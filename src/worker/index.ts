import { Hono } from 'hono'
import {
  createFreebuffAuth,
  isSameOriginRequest,
  type FreebuffAuth,
} from '@freebuff/auth'
import { getCookie, setCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import {
  CONTROLS,
  actorFor,
  challengeView,
  GameError,
  finish,
  joinGame,
  moveGame,
  newChallenge,
  newGame,
  publicGame,
  seatFor,
  settleClock,
  type Game,
  type Player,
} from '../shared/game'
import {
  createRealtimeTicket,
  publishRealtime,
} from '../../freebuff-realtime/server.js'
import type { Challenge, Lobby } from '../shared/game'

type Env = {
  ASSETS: Fetcher
  DB: D1Database
  REALTIME?: DurableObjectNamespace
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN: string
}
type Context = { Bindings: Env; Variables: { player: Player } }
let cached: { key: string; auth: FreebuffAuth } | undefined
function authFor(env: Env) {
  if (!env.FREEBUFF_CLIENT_ID) return null
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER}|${env.APP_ORIGIN}`
  if (cached?.key !== key)
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER,
        baseUrl: env.APP_ORIGIN,
        allowInsecureLocalhost: env.APP_ORIGIN.startsWith('http://127.0.0.1:'),
      }),
    }
  return cached.auth
}
const initialized = new WeakMap<D1Database, Promise<unknown>>()
function initialize(db: D1Database) {
  let pending = initialized.get(db)
  if (!pending) {
    pending = db
      .batch([
        db.prepare(
          'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL, last_create INTEGER NOT NULL DEFAULT 0)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL, white_id TEXT, black_id TEXT, white_sub TEXT, black_sub TEXT, created_at INTEGER NOT NULL, state TEXT NOT NULL)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_lobby ON games(status, public, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_white ON games(white_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_black ON games(black_id, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_white_sub ON games(white_sub, status, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS games_black_sub ON games(black_sub, status, created_at)',
        ),
        db.prepare(
          'CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, from_name TEXT NOT NULL, from_sub TEXT, to_id TEXT NOT NULL, to_name TEXT NOT NULL, to_sub TEXT, minutes INTEGER NOT NULL, increment INTEGER NOT NULL, color TEXT NOT NULL, status TEXT NOT NULL, game_id TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ack INTEGER NOT NULL DEFAULT 0)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS challenges_to ON challenges(to_id, status, created_at)',
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS challenges_from ON challenges(from_id, status, created_at)',
        ),
      ])
      .then(async (result) => {
        // Presence tracking postdates the first local databases.
        await db
          .prepare(
            'ALTER TABLE players ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0',
          )
          .run()
          .catch(() => {})
        return result
      })
      .catch((error) => {
        initialized.delete(db)
        throw error
      })
    initialized.set(db, pending)
  }
  return pending
}
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
async function load(db: D1Database, key: string) {
  if (!/^[a-z0-9-]{8,36}$/.test(key)) return null
  const row = await db
    .prepare('SELECT state FROM games WHERE id = ? OR code = ? LIMIT 1')
    .bind(key, key)
    .first<{ state: string }>()
  return row ? (JSON.parse(row.state) as Game) : null
}
async function save(db: D1Database, before: Game, next: Game) {
  next = { ...next, revision: before.revision + 1 }
  const result = await db
    .prepare(
      'UPDATE games SET state = ?, revision = ?, status = ?, white_id = ?, black_id = ?, white_sub = ?, black_sub = ? WHERE id = ? AND revision = ?',
    )
    .bind(
      JSON.stringify(next),
      next.revision,
      next.status,
      next.white?.id ?? null,
      next.black?.id ?? null,
      next.white?.sub ?? null,
      next.black?.sub ?? null,
      next.id,
      before.revision,
    )
    .run()
  if (result.meta.changes !== 1)
    throw new GameError('La partida cambió. Inténtalo de nuevo.')
  return next
}
async function broadcast(env: Env, game: Game) {
  if (!env.REALTIME) return
  try {
    await publishRealtime(env, {
      room: `game:${game.id}`,
      event: 'changed',
      data: { revision: game.revision },
    })
  } catch {
    console.warn(
      'Realtime publication unavailable; clients will refresh the snapshot.',
    )
  }
}
function view(game: Game, player: Player, now: number) {
  return publicGame(game, actorFor(game, player), now)
}
// A player counts as connected while their browser keeps checking in, and a
// short cushion stops challenge spam. Both windows live in one place.
const ONLINE_WINDOW_MS = 25_000
const CHALLENGE_COOLDOWN_MS = 3_000
type ChallengeRow = {
  id: string
  from_id: string
  from_name: string
  from_sub: string | null
  to_id: string
  to_name: string
  to_sub: string | null
  minutes: number
  increment: number
  color: string
  status: string
  game_id: string | null
  created_at: number
  expires_at: number
  ack: number
}
function asChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    from: { id: row.from_id, name: row.from_name, sub: row.from_sub },
    to: { id: row.to_id, name: row.to_name, sub: row.to_sub },
    minutes: row.minutes,
    increment: row.increment,
    color: row.color as Challenge['color'],
    status: row.status as Challenge['status'],
    gameId: row.game_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ack: row.ack,
  }
}
async function expireChallenges(db: D1Database, now: number) {
  await db
    .prepare(
      "UPDATE challenges SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?",
    )
    .bind(now)
    .run()
}
type Seat = {
  gameId: string
  status: string
  minutes: number
  increment: number
  public: boolean
}
// One pass over the live games tells us who is free, who is playing and which
// public tables are still open for anyone to sit at.
async function presence(db: D1Database, now: number) {
  const rows = await db
    .prepare(
      "SELECT id, status, state FROM games WHERE status IN ('waiting', 'playing') AND created_at > ? ORDER BY created_at DESC LIMIT 200",
    )
    .bind(now - 86400000)
    .all<{ id: string; status: string; state: string }>()
  const seats = new Map<string, Seat>()
  for (const row of rows.results) {
    const game = JSON.parse(row.state) as Game
    for (const member of [game.white, game.black]) {
      if (!member) continue
      const existing = seats.get(member.id)
      if (existing && (existing.status === 'playing' || row.status !== 'playing'))
        continue
      seats.set(member.id, {
        gameId: game.id,
        status: row.status,
        minutes: game.minutes,
        increment: game.increment,
        public: game.public,
      })
    }
  }
  return seats
}
async function insertGame(db: D1Database, game: Game) {
  await db
    .prepare(
      'INSERT INTO games (id, code, revision, status, public, white_id, black_id, white_sub, black_sub, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      game.id,
      game.code,
      0,
      game.status,
      Number(game.public),
      game.white?.id ?? null,
      game.black?.id ?? null,
      game.white?.sub ?? null,
      game.black?.sub ?? null,
      game.createdAt,
      JSON.stringify(game),
    )
    .run()
}
const app = new Hono<Context>()
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: 'La solicitud es demasiado grande.' }, 413),
  }),
)
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  if (!c.env.DB || !c.env.APP_ORIGIN)
    return c.json({ error: 'La base de datos del juego no está conectada.' }, 503)
  if (
    c.req.method !== 'GET' &&
    !isSameOriginRequest(c.req.raw, c.env.APP_ORIGIN)
  )
    return c.json({ error: 'Solicitud de otro origen rechazada.' }, 403)
  if (
    c.req.method !== 'GET' &&
    !c.req.header('content-type')?.startsWith('application/json')
  )
    return c.json({ error: 'Envía JSON.' }, 415)
  if (Number(c.req.header('content-length') ?? 0) > 4096)
    return c.json({ error: 'La solicitud es demasiado grande.' }, 413)
  await initialize(c.env.DB)
  const token = getCookie(
    c,
    c.env.APP_ORIGIN.startsWith('https:') ? '__Host-rook' : 'rook-local',
  )
  const stored =
    token && /^[a-f0-9]{64}$/.test(token)
      ? await c.env.DB.prepare(
          'SELECT id, name FROM players WHERE token_hash = ? AND expires_at > ?',
        )
          .bind(await hash(token), Date.now())
          .first<{ id: string; name: string }>()
      : null
  const user = await authFor(c.env)?.getUser(c.req.raw)
  if (stored)
    c.set('player', {
      ...stored,
      name: user?.name?.slice(0, 40) || stored.name,
      sub: user?.sub ?? null,
    })
  else if (c.req.path !== '/api/session')
    return c.json({ error: 'Recarga la página para entrar como invitado.' }, 401)
  await next()
})
app.post('/api/session', async (c) => {
  let player = c.get('player')
  const user = await authFor(c.env)?.getUser(c.req.raw)
  if (!player) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')
    player = {
      id: crypto.randomUUID(),
      name:
        user?.name?.slice(0, 40) ||
        `Invitado ${Math.floor(1000 + Math.random() * 9000)}`,
      sub: user?.sub ?? null,
    }
    await c.env.DB.prepare(
      'INSERT INTO players (id, token_hash, name, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(
        player.id,
        await hash(token),
        player.name,
        Date.now() + 30 * 86400000,
      )
      .run()
    const secure = c.env.APP_ORIGIN.startsWith('https:')
    setCookie(c, secure ? '__Host-rook' : 'rook-local', token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 30 * 86400,
    })
  }
  return c.json({
    name: player.name,
    signedIn: !!user,
    authEnabled: !!c.env.FREEBUFF_CLIENT_ID,
    realtime: !!c.env.REALTIME,
  })
})
app.get('/api/history', async (c) => {
  const player = c.get('player')
  const rows = await c.env.DB.prepare(
    'SELECT state FROM games WHERE ((white_id = ? AND white_sub IS NULL) OR (black_id = ? AND black_sub IS NULL) OR white_sub = ? OR black_sub = ?) ORDER BY created_at DESC LIMIT 50',
  )
    .bind(player.id, player.id, player.sub, player.sub)
    .all<{ state: string }>()
  const games = rows.results.map((row) => {
    const game = JSON.parse(row.state) as Game
    const id =
      player.sub && game.white?.sub === player.sub
        ? game.white.id
        : player.sub && game.black?.sub === player.sub
          ? game.black.id
          : player.id
    return publicGame(game, id, Date.now())
  })
  // Aggregate completed games for this authenticated account, with indexed predicates.
  const stats = player.sub
    ? await c.env.DB.prepare(
        `SELECT COUNT(*) AS played, SUM(CASE WHEN (white_sub = ? AND json_extract(state, '$.result') = '1-0') OR (black_sub = ? AND json_extract(state, '$.result') = '0-1') THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN json_extract(state, '$.result') = '½-½' THEN 1 ELSE 0 END) AS draws FROM games WHERE status = 'finished' AND (white_sub = ? OR black_sub = ?)`,
      )
        .bind(player.sub, player.sub, player.sub, player.sub)
        .first()
    : null
  return c.json({ games, stats })
})
app.post('/api/games', async (c) => {
  const body = await c.req.json<{
    minutes: number
    increment: number
    public: boolean
    color: string
  }>()
  if (
    !CONTROLS.some(
      (t) => t.minutes === body.minutes && t.increment === body.increment,
    ) ||
    typeof body.public !== 'boolean' ||
    !['w', 'b', 'random'].includes(body.color)
  )
    return c.json({ error: 'Elige un ritmo de juego y un color.' }, 400)
  const player = c.get('player')
  const admitted = await c.env.DB.prepare(
    'UPDATE players SET last_create = ? WHERE id = ? AND last_create < ?',
  )
    .bind(Date.now(), player.id, Date.now() - 5000)
    .run()
  if (!admitted.meta.changes)
    return c.json({ error: 'Espera un momento antes de crear otra partida.' }, 429)
  const active = await c.env.DB.prepare(
    "SELECT id FROM games WHERE status IN ('waiting', 'playing') AND (white_id = ? OR black_id = ?) AND created_at > ? LIMIT 5",
  )
    .bind(player.id, player.id, Date.now() - 86400000)
    .all()
  if (active.results.length >= 5)
    return c.json({ error: 'Termina o cancela antes una partida abierta.' }, 409)
  const game = newGame(
    player,
    {
      ...body,
      color:
        body.color === 'random'
          ? Math.random() < 0.5
            ? 'w'
            : 'b'
          : (body.color as 'w' | 'b'),
    },
    Date.now(),
  )
  await insertGame(c.env.DB, game)
  return c.json(publicGame(game, player.id, Date.now()), 201)
})
app.get('/api/games/:id', async (c) => {
  let game = await load(c.env.DB, c.req.param('id'))
  if (!game) return c.json({ error: 'Partida no encontrada.' }, 404)
  const settled = settleClock(game, Date.now())
  if (settled !== game) {
    try {
      game = await save(c.env.DB, game, settled)
      c.executionCtx.waitUntil(broadcast(c.env, game))
    } catch (error) {
      if (!(error instanceof GameError)) throw error
      game = (await load(c.env.DB, game.id))!
    }
  }
  return c.json(view(game, c.get('player'), Date.now()))
})
app.post('/api/games/:id/:action', async (c) => {
  const game = await load(c.env.DB, c.req.param('id'))
  if (!game) return c.json({ error: 'Partida no encontrada.' }, 404)
  const player = c.get('player'),
    action = c.req.param('action'),
    now = Date.now()
  const body = await c.req.json<{
    revision?: number
    from?: string
    to?: string
    promotion?: string
  }>()
  const actor = actorFor(game, player)
  const seat = seatFor(game, actor)
  let next: Game
  if (action === 'join') next = actor ? game : joinGame(game, player, now)
  else {
    if (!seat)
      return c.json({ error: 'Solo los jugadores pueden cambiar esta partida.' }, 403)
    if (body.revision !== game.revision)
      return c.json({ error: 'El tablero cambió. Inténtalo de nuevo.' }, 409)
    next = settleClock(game, now)
    if (next === game) {
      if (action === 'cancel' && game.status === 'waiting')
        next = { ...game, status: 'cancelled' }
      else if (game.status !== 'playing')
        return c.json({ error: 'La partida no está en juego.' }, 409)
      else if (action === 'move')
        next = moveGame(
          game,
          actor,
          body.from ?? '',
          body.to ?? '',
          body.promotion,
          now,
        )
      else if (action === 'resign')
        next = finish(game, seat === 'w' ? '0-1' : '1-0', 'Abandono', now)
      else if (action === 'draw')
        next =
          game.drawOffer && game.drawOffer !== seat
            ? finish(game, '½-½', 'Tablas acordadas', now)
            : { ...game, drawOffer: seat }
      else if (action === 'decline') next = { ...game, drawOffer: null }
      else return c.json({ error: 'Acción desconocida.' }, 400)
    }
  }
  if (next !== game) next = await save(c.env.DB, game, next)
  c.executionCtx.waitUntil(broadcast(c.env, next))
  return c.json(view(next, player, Date.now()))
})
app.post('/api/players', async (c) => {
  const player = c.get('player'),
    now = Date.now(),
    db = c.env.DB
  await db
    .prepare('UPDATE players SET last_seen = ? WHERE id = ?')
    .bind(now, player.id)
    .run()
  await expireChallenges(db, now)
  const online = await db
    .prepare(
      'SELECT id, name FROM players WHERE last_seen > ? AND id != ? ORDER BY last_seen DESC LIMIT 50',
    )
    .bind(now - ONLINE_WINDOW_MS, player.id)
    .all<{ id: string; name: string }>()
  const seats = await presence(db, now)
  const pending = await db
    .prepare(
      "SELECT * FROM challenges WHERE status = 'pending' AND (from_id = ? OR to_id = ?) ORDER BY created_at DESC",
    )
    .bind(player.id, player.id)
    .all<ChallengeRow>()
  const incoming = pending.results.find((row) => row.to_id === player.id)
  const outgoing = pending.results.find((row) => row.from_id === player.id)
  // An answer this player has not read yet: an accepted game, a rejection or
  // an expiry. It is cleared with /challenges/:id/seen once the client reacts.
  const answered = await db
    .prepare(
      "SELECT * FROM challenges WHERE from_id = ? AND status != 'pending' AND ack = 0 AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(player.id, now - 120000)
    .first<ChallengeRow>()
  const lobby: Lobby = {
    serverNow: now,
    players: online.results.map((row) => {
      const seat = seats.get(row.id)
      return {
        id: row.id,
        name: row.name,
        status: seat ? ('busy' as const) : ('free' as const),
        table:
          seat && seat.status === 'waiting' && seat.public
            ? {
                id: seat.gameId,
                minutes: seat.minutes,
                increment: seat.increment,
              }
            : null,
        challenged: !!outgoing && outgoing.to_id === row.id,
      }
    }),
    incoming: incoming ? challengeView(asChallenge(incoming), 'to') : null,
    outgoing: outgoing ? challengeView(asChallenge(outgoing), 'from') : null,
    event: answered ? challengeView(asChallenge(answered), 'from') : null,
  }
  return c.json(lobby)
})
app.post('/api/challenges', async (c) => {
  const body = await c.req.json<{
    minutes: number
    increment: number
    color: string
    target: string
  }>()
  if (
    !CONTROLS.some(
      (t) => t.minutes === body.minutes && t.increment === body.increment,
    ) ||
    !['w', 'b', 'random'].includes(body.color) ||
    typeof body.target !== 'string'
  )
    return c.json({ error: 'Elige un ritmo de juego y un color.' }, 400)
  const player = c.get('player'),
    now = Date.now(),
    db = c.env.DB
  if (body.target === player.id)
    return c.json({ error: 'No puedes retarte a ti mismo.' }, 400)
  await expireChallenges(db, now)
  const recent = await db
    .prepare('SELECT id FROM challenges WHERE from_id = ? AND created_at > ? LIMIT 1')
    .bind(player.id, now - CHALLENGE_COOLDOWN_MS)
    .first()
  if (recent)
    return c.json({ error: 'Espera un momento antes de enviar otro reto.' }, 429)
  const target = await db
    .prepare('SELECT id, name FROM players WHERE id = ? AND last_seen > ?')
    .bind(body.target, now - ONLINE_WINDOW_MS)
    .first<{ id: string; name: string }>()
  if (!target)
    return c.json({ error: 'Ese jugador ya no está conectado.' }, 409)
  const seats = await presence(db, now)
  if (seats.has(player.id))
    return c.json(
      { error: 'Termina tu partida antes de retar a alguien.' },
      409,
    )
  if (seats.has(target.id))
    return c.json({ error: `${target.name} está en una partida.` }, 409)
  const mine = await db
    .prepare("SELECT id FROM challenges WHERE status = 'pending' AND from_id = ? LIMIT 1")
    .bind(player.id)
    .first()
  if (mine) return c.json({ error: 'Ya tienes un reto pendiente.' }, 409)
  const theirs = await db
    .prepare("SELECT id FROM challenges WHERE status = 'pending' AND to_id = ? LIMIT 1")
    .bind(target.id)
    .first()
  if (theirs)
    return c.json({ error: `${target.name} tiene otro reto pendiente.` }, 409)
  const challenge = newChallenge(
    player,
    { id: target.id, name: target.name, sub: null },
    {
      minutes: body.minutes,
      increment: body.increment,
      color: body.color as 'w' | 'b' | 'random',
    },
    now,
  )
  await db
    .prepare(
      'INSERT INTO challenges (id, from_id, from_name, from_sub, to_id, to_name, to_sub, minutes, increment, color, status, game_id, created_at, expires_at, ack) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      challenge.id,
      challenge.from.id,
      challenge.from.name,
      challenge.from.sub,
      challenge.to.id,
      challenge.to.name,
      challenge.to.sub,
      challenge.minutes,
      challenge.increment,
      challenge.color,
      challenge.status,
      challenge.gameId,
      challenge.createdAt,
      challenge.expiresAt,
      challenge.ack,
    )
    .run()
  return c.json(challengeView(challenge, 'from'), 201)
})
app.post('/api/challenges/:id/:action', async (c) => {
  const player = c.get('player'),
    now = Date.now(),
    db = c.env.DB,
    action = c.req.param('action')
  const row = await db
    .prepare('SELECT * FROM challenges WHERE id = ?')
    .bind(c.req.param('id'))
    .first<ChallengeRow>()
  if (!row) return c.json({ error: 'Ese reto ya no existe.' }, 404)
  if (action === 'seen') {
    if (row.from_id !== player.id)
      return c.json({ error: 'Ese reto no es tuyo.' }, 403)
    await db
      .prepare('UPDATE challenges SET ack = 1 WHERE id = ?')
      .bind(row.id)
      .run()
    return c.json({ ok: true })
  }
  if (action === 'cancel') {
    if (row.from_id !== player.id)
      return c.json({ error: 'Ese reto no es tuyo.' }, 403)
    const changed = await db
      .prepare(
        "UPDATE challenges SET status = 'cancelled', ack = 1 WHERE id = ? AND status = 'pending'",
      )
      .bind(row.id)
      .run()
    if (!changed.meta.changes)
      return c.json({ error: 'El reto ya no está disponible.' }, 409)
    return c.json({ ok: true, status: 'cancelled' })
  }
  if (action !== 'accept' && action !== 'decline')
    return c.json({ error: 'Acción desconocida.' }, 400)
  if (row.to_id !== player.id)
    return c.json({ error: 'Ese reto no es para ti.' }, 403)
  if (row.status !== 'pending')
    return c.json({ error: 'El reto ya no está disponible.' }, 409)
  if (row.expires_at <= now) {
    await db
      .prepare(
        "UPDATE challenges SET status = 'expired' WHERE id = ? AND status = 'pending'",
      )
      .bind(row.id)
      .run()
    return c.json({ error: 'El reto caducó.' }, 409)
  }
  // Whichever answer wins the compare-and-set gets to act on the challenge.
  const claimed = await db
    .prepare(
      `UPDATE challenges SET status = ?, game_id = ? WHERE id = ? AND status = 'pending'`,
    )
    .bind(action === 'accept' ? 'accepted' : 'declined', null, row.id)
    .run()
  if (!claimed.meta.changes)
    return c.json({ error: 'El reto ya no está disponible.' }, 409)
  if (action === 'decline') return c.json({ ok: true, status: 'declined' })
  const seats = await presence(db, now)
  if (seats.get(row.from_id)?.status === 'playing') {
    await db
      .prepare("UPDATE challenges SET status = 'cancelled', ack = 0 WHERE id = ?")
      .bind(row.id)
      .run()
    return c.json({ error: 'Ese jugador ya está en otra partida.' }, 409)
  }
  const color =
    row.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : row.color
  const game = joinGame(
    newGame(
      asChallenge(row).from,
      {
        minutes: row.minutes,
        increment: row.increment,
        public: false,
        color: color as 'w' | 'b',
      },
      now,
    ),
    { id: player.id, name: player.name, sub: player.sub },
    now,
  )
  const linked = await db
    .prepare(
      "UPDATE challenges SET game_id = ? WHERE id = ? AND status = 'accepted'",
    )
    .bind(game.id, row.id)
    .run()
  if (!linked.meta.changes) {
    await db
      .prepare('DELETE FROM games WHERE id = ?')
      .bind(game.id)
      .run()
    return c.json({ error: 'El reto ya no está disponible.' }, 409)
  }
  await insertGame(db, game)
  c.executionCtx.waitUntil(broadcast(c.env, game))
  return c.json(publicGame(game, player.id, Date.now()), 201)
})
app.post('/api/realtime/ticket', async (c) => {
  if (!c.env.REALTIME) return c.json({ error: 'La conexión en tiempo real no está disponible.' }, 503)
  const { room } = await c.req.json<{ room: string }>()
  if (typeof room !== 'string' || !room.startsWith('game:'))
    return c.json({ error: 'Sala no válida.' }, 400)
  const game = await load(c.env.DB, room.slice(5))
  if (!game || !actorFor(game, c.get('player')))
    return c.json({ error: 'Únete a la partida primero.' }, 403)
  return c.json(
    await createRealtimeTicket(c.env, {
      room: `game:${game.id}`,
      userId: c.get('player').id,
      origin: c.env.APP_ORIGIN,
      publish: false,
      presence: true,
    }),
  )
})
app.onError((error, c) => {
  if (error instanceof GameError) return c.json({ error: error.message }, 409)
  if (error instanceof SyntaxError)
    return c.json({ error: 'Solicitud no válida.' }, 400)
  console.error('Chess request failed', error.name)
  return c.json({ error: 'No se pudo completar la solicitud. Inténtalo de nuevo.' }, 500)
})
app.notFound((c) =>
  c.req.path.startsWith('/auth/')
    ? c.json(
        {
          error: 'Iniciar sesión con Freebuff no está habilitado en esta vista previa.',
        },
        503,
      )
    : c.req.path.startsWith('/api/')
      ? c.json({ error: 'No encontrado.' }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
)
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const handler = (req: Request) => Promise.resolve(app.fetch(req, env, ctx))
    return authFor(env)?.wrap(handler)(request) ?? handler(request)
  },
}
