import { Chess, type Color, type Square } from 'chess.js'

export const CONTROLS = [
  { minutes: 3, increment: 2 },
  { minutes: 5, increment: 0 },
  { minutes: 10, increment: 0 },
  { minutes: 15, increment: 10 },
] as const
export type Player = { id: string; name: string; sub: string | null }
export type Game = {
  id: string
  code: string
  revision: number
  public: boolean
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  white: Player | null
  black: Player | null
  pgn: string
  fen: string
  moves: string[]
  minutes: number
  increment: number
  whiteMs: number
  blackMs: number
  tickAt: number
  createdAt: number
  result: '1-0' | '0-1' | '½-½' | null
  reason: string | null
  drawOffer: Color | null
}
export type PublicGame = Omit<Game, 'white' | 'black' | 'code'> & {
  white: { name: string } | null
  black: { name: string } | null
  seat: Color | null
  serverNow: number
}
export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'
export type Challenge = {
  id: string
  from: Player
  to: Player
  minutes: number
  increment: number
  color: Color | 'random'
  status: ChallengeStatus
  gameId: string | null
  createdAt: number
  expiresAt: number
  ack: number
}
// What one side of a challenge is allowed to see. Opponent names replace
// player identifiers, and `color` is always the colour of the viewer.
export type ChallengeView = {
  id: string
  opponent: string
  minutes: number
  increment: number
  color: Color | 'random'
  status: ChallengeStatus
  gameId: string | null
  expiresAt: number
}
export type LobbyPlayer = {
  id: string
  name: string
  status: 'free' | 'busy'
  table: { id: string; minutes: number; increment: number } | null
  challenged: boolean
}
export type Lobby = {
  serverNow: number
  players: LobbyPlayer[]
  incoming: ChallengeView | null
  outgoing: ChallengeView | null
  event: ChallengeView | null
}
export const CHALLENGE_WINDOW_MS = 30_000
export class GameError extends Error {}
export function chessFor(game: Pick<Game, 'pgn'>) {
  const chess = new Chess()
  if (game.pgn) chess.loadPgn(game.pgn)
  return chess
}
export function seatFor(game: Game, id: string): Color | null {
  return game.white?.id === id ? 'w' : game.black?.id === id ? 'b' : null
}
export function remaining(
  game: Pick<Game, 'status' | 'fen' | 'whiteMs' | 'blackMs' | 'tickAt'>,
  color: Color,
  now: number,
) {
  const ticking = game.status === 'playing' && game.fen.split(' ')[1] === color
  return Math.max(
    0,
    (color === 'w' ? game.whiteMs : game.blackMs) -
      (ticking ? Math.max(0, now - game.tickAt) : 0),
  )
}
export function finish(
  game: Game,
  result: Game['result'],
  reason: string,
  now: number,
): Game {
  return {
    ...game,
    whiteMs: remaining(game, 'w', now),
    blackMs: remaining(game, 'b', now),
    status: 'finished',
    result,
    reason,
    drawOffer: null,
    tickAt: now,
  }
}
export function settleClock(game: Game, now: number): Game {
  if (game.status !== 'playing') return game
  const turn = game.fen.split(' ')[1] as Color
  if (remaining(game, turn, now) > 0) return game
  // A bare king cannot win on time. Other low-material positions are handled
  // by chess.js's insufficient-material detection after every legal move.
  const other = turn === 'w' ? 'b' : 'w'
  const hasMaterial = new Chess(game.fen)
    .board()
    .flat()
    .some((p) => p?.color === other && p.type !== 'k')
  return finish(
    game,
    hasMaterial ? (turn === 'w' ? '0-1' : '1-0') : '½-½',
    hasMaterial ? 'Se acabó el tiempo' : 'Material insuficiente',
    now,
  )
}
export function moveGame(
  game: Game,
  actor: string,
  from: string,
  to: string,
  promotion: string | undefined,
  now: number,
): Game {
  const settled = settleClock(game, now)
  if (settled !== game) return settled
  if (game.status !== 'playing')
    throw new GameError('La partida no está en juego.')
  const chess = chessFor(game)
  const seat = seatFor(game, actor)
  if (!seat || seat !== chess.turn()) throw new GameError('Espera tu turno.')
  if (
    !/^[a-h][1-8]$/.test(from) ||
    !/^[a-h][1-8]$/.test(to) ||
    (promotion && !/^[qrbn]$/.test(promotion))
  )
    throw new GameError('Jugada no válida.')
  try {
    chess.move({ from: from as Square, to: to as Square, promotion })
  } catch {
    throw new GameError('Esa jugada no es legal.')
  }
  let next: Game = {
    ...game,
    pgn: chess.pgn(),
    fen: chess.fen(),
    moves: chess.history(),
    tickAt: now,
    drawOffer: null,
    whiteMs:
      remaining(game, 'w', now) + (seat === 'w' ? game.increment * 1000 : 0),
    blackMs:
      remaining(game, 'b', now) + (seat === 'b' ? game.increment * 1000 : 0),
  }
  if (chess.isCheckmate())
    next = finish(next, seat === 'w' ? '1-0' : '0-1', 'Jaque mate', now)
  else if (chess.isDraw())
    next = finish(
      next,
      '½-½',
      chess.isStalemate()
        ? 'Rey ahogado'
        : chess.isThreefoldRepetition()
          ? 'Triple repetición'
          : chess.isInsufficientMaterial()
            ? 'Material insuficiente'
            : 'Regla de las cincuenta jugadas',
      now,
    )
  return next
}
export function newGame(
  player: Player,
  options: {
    minutes: number
    increment: number
    public: boolean
    color: Color
  },
  now: number,
): Game {
  if (
    !CONTROLS.some(
      (c) => c.minutes === options.minutes && c.increment === options.increment,
    )
  )
    throw new GameError('Elige un ritmo de juego.')
  return {
    id: crypto.randomUUID(),
    code: Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (n) => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 29],
    ).join(''),
    revision: 0,
    public: options.public,
    status: 'waiting',
    white: options.color === 'w' ? player : null,
    black: options.color === 'b' ? player : null,
    pgn: '',
    fen: new Chess().fen(),
    moves: [],
    minutes: options.minutes,
    increment: options.increment,
    whiteMs: options.minutes * 60000,
    blackMs: options.minutes * 60000,
    tickAt: now,
    createdAt: now,
    result: null,
    reason: null,
    drawOffer: null,
  }
}
export function joinGame(game: Game, player: Player, now: number): Game {
  if (seatFor(game, player.id)) return game
  if (game.status !== 'waiting')
    throw new GameError('Esta partida ya tiene dos jugadores.')
  return {
    ...game,
    white: game.white ?? player,
    black: game.black ?? player,
    status: 'playing',
    tickAt: now,
  }
}
// Rebuilt field by field, so the invite code and every player identifier stay
// on the server. Manual invites are gone; games are reached from the lobby.
export function publicGame(game: Game, id: string, now: number): PublicGame {
  return {
    id: game.id,
    revision: game.revision,
    public: game.public,
    status: game.status,
    pgn: game.pgn,
    fen: game.fen,
    moves: game.moves,
    minutes: game.minutes,
    increment: game.increment,
    whiteMs: game.whiteMs,
    blackMs: game.blackMs,
    tickAt: game.tickAt,
    createdAt: game.createdAt,
    result: game.result,
    reason: game.reason,
    drawOffer: game.drawOffer,
    white: game.white && { name: game.white.name },
    black: game.black && { name: game.black.name },
    seat: seatFor(game, id),
    serverNow: now,
  }
}
export function newChallenge(
  from: Player,
  to: Player,
  options: { minutes: number; increment: number; color: Color | 'random' },
  now: number,
): Challenge {
  if (
    !CONTROLS.some(
      (c) => c.minutes === options.minutes && c.increment === options.increment,
    )
  )
    throw new GameError('Elige un ritmo de juego.')
  if (!['w', 'b', 'random'].includes(options.color))
    throw new GameError('Elige un color.')
  return {
    id: crypto.randomUUID(),
    from,
    to,
    minutes: options.minutes,
    increment: options.increment,
    color: options.color,
    status: 'pending',
    gameId: null,
    createdAt: now,
    expiresAt: now + CHALLENGE_WINDOW_MS,
    ack: 0,
  }
}
export function challengeView(
  challenge: Challenge,
  side: 'from' | 'to',
): ChallengeView {
  const opponent = side === 'from' ? challenge.to : challenge.from
  return {
    id: challenge.id,
    opponent: opponent.name,
    minutes: challenge.minutes,
    increment: challenge.increment,
    color:
      side === 'from' || challenge.color === 'random'
        ? challenge.color
        : challenge.color === 'w'
          ? 'b'
          : 'w',
    status: challenge.status,
    gameId: challenge.gameId,
    expiresAt: challenge.expiresAt,
  }
}

// Authenticated seats follow their Freebuff subject across devices. A guest
// cookie alone never grants access to a seat belonging to a signed-in account.
export function actorFor(game: Game, player: Player) {
  for (const member of [game.white, game.black]) {
    if (
      member &&
      (member.sub ? member.sub === player.sub : member.id === player.id)
    )
      return member.id
  }
  return ''
}
