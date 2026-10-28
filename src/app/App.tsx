import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Square } from 'chess.js'
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flag,
  History,
  LoaderCircle,
  Palette,
  RotateCcw,
  Shuffle,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Board } from './Board'
import { Piece } from './Piece'
import {
  CONTROLS,
  finish,
  moveGame,
  newGame,
  publicGame,
  remaining,
  settleClock,
  type ChallengeView,
  type Game,
  type Lobby,
  type PublicGame,
} from '../shared/game'
import { connectRealtime } from '../../freebuff-realtime/browser.js'

type Session = {
  name: string
  signedIn: boolean
  authEnabled: boolean
  realtime: boolean
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  )
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok)
    throw new Error(body.error || 'Se interrumpió la conexión. Inténtalo de nuevo.')
  return body as T
}
function time(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [])
  return now
}
function PlayerBar({
  name,
  color,
  ms,
  active,
  you,
  waiting,
  connected,
}: {
  name: string
  color: Color
  ms: number
  active: boolean
  you: boolean
  waiting?: boolean
  connected?: boolean
}) {
  return (
    <div className={`player-bar ${active ? 'active' : ''}`}>
      <div className={`player-avatar ${color}`}>
        <Piece type="k" color={color} />
      </div>
      <div className="player-identity">
        <strong>{name}</strong>
        <span>
          {waiting
            ? 'Asiento libre'
            : you
              ? 'Tú'
              : color === 'w'
                ? 'Piezas blancas'
                : 'Piezas negras'}
          {connected && <i className="presence-dot" title="Conectado" />}
        </span>
      </div>
      <div
        className={`clock ${active ? 'ticking' : ''} ${ms < 30000 && active ? 'low' : ''}`}
      >
        <Clock3 size={17} />
        <span>{time(ms)}</span>
      </div>
    </div>
  )
}
const blank = new Chess()
export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [game, setGame] = useState<PublicGame | null>(null)
  const [practice, setPractice] = useState<Game | null>(null)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [games, setGames] = useState<PublicGame[]>([])
  const [stats, setStats] = useState<{
    played: number
    wins: number
    draws: number
  } | null>(null)
  const [panel, setPanel] = useState<'play' | 'history'>('play')
  const [control, setControl] = useState(2)
  const [color, setColor] = useState<'w' | 'b' | 'random'>('random')
  const [flipped, setFlipped] = useState(false)
  const [sound, setSound] = useState(true)
  const [theme, setTheme] = useState(0)
  const [review, setReview] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<'resign' | 'help' | null>(null)
  const [connection, setConnection] = useState('connecting')
  const [peers, setPeers] = useState(0)
  const [ready, setReady] = useState(false)
  const moveList = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const now = useNow()
  const offset = useRef(0),
    lastRevision = useRef(-1),
    gameId = useRef<string | null>(null),
    audio = useRef<AudioContext | null>(null),
    lobbyOffset = useRef(0),
    handled = useRef(new Set<string>())
  const online = lobby?.players ?? []
  const outgoing = lobby?.outgoing ?? null
  // A challenge the player has already answered is hidden until the server
  // answer arrives with the next check-in.
  const incoming =
    lobby?.incoming && !handled.current.has(lobby.incoming.id)
      ? lobby.incoming
      : null
  const challengeSeconds = (challenge: ChallengeView) =>
    Math.max(
      0,
      Math.ceil((challenge.expiresAt - (now + lobbyOffset.current)) / 1000),
    )
  const current = practice ? publicGame(practice, 'practice-you', now) : game
  const active = current?.status === 'playing',
    waiting = current?.status === 'waiting'
  const orientation: Color = (current?.seat === 'b') !== flipped ? 'b' : 'w'
  const turn = (current?.fen.split(' ')[1] || 'w') as Color
  const visible = useMemo(() => {
    const chess = new Chess()
    if (current?.pgn) chess.loadPgn(current.pgn)
    if (review !== null) {
      while (chess.history().length > review) chess.undo()
    }
    return { fen: chess.fen(), pgn: chess.pgn(), check: chess.inCheck() }
  }, [current?.pgn, review])
  const accept = useCallback((next: PublicGame) => {
    if (gameId.current !== next.id) {
      gameId.current = next.id
      lastRevision.current = -1
      setReview(null)
      setFlipped(false)
    }
    if (next.revision < lastRevision.current) return
    lastRevision.current = next.revision
    offset.current = next.serverNow - Date.now()
    setGame(next)
  }, [])
  const refresh = useCallback(
    async (id: string) => {
      const next = await api<PublicGame>(`/games/${id}`)
      if (gameId.current === id) accept(next)
    },
    [accept],
  )
  useEffect(() => {
    let live = true
    api<Session>('/session', {})
      .then(async (s) => {
        if (!live) return
        setSession(s)
        setReady(true)
        const id = new URL(location.href).searchParams.get('game')
        if (id) {
          const next = await api<PublicGame>(`/games/${encodeURIComponent(id)}`)
          if (live) accept(next)
        }
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [accept])
  // One check-in per tick: it records presence, expires stale challenges and
  // returns the lobby, so a connected player list stays accurate without a
  // second connection.
  const syncLobby = useCallback(async () => {
    const result = await api<Lobby>('/players', {})
    lobbyOffset.current = result.serverNow - Date.now()
    setLobby(result)
  }, [])
  useEffect(() => {
    if (!ready) return
    const load = () =>
      syncLobby().catch(() => {
        /* The next check-in repairs a transient failure. */
      })
    void load()
    // Faster while a challenge is in flight, so both sides see the answer
    // within a second instead of most of a poll interval.
    const busy = !!lobby?.outgoing || !!lobby?.incoming
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, busy ? 1500 : 6000)
    window.addEventListener('online', load)
    document.addEventListener('visibilitychange', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [ready, syncLobby, lobby?.outgoing?.id, lobby?.incoming?.id])
  useEffect(() => {
    if (!ready || panel !== 'history') return
    api<{ games: PublicGame[]; stats: typeof stats }>('/history')
      .then((result) => {
        setGames(result.games)
        setStats(result.stats)
      })
      .catch((e) => setError(e.message))
  }, [ready, panel])
  useEffect(() => {
    if (
      !game ||
      practice ||
      game.status === 'cancelled' ||
      game.status === 'finished'
    )
      return
    const id = game.id
    const sync = () => {
      if (!document.hidden)
        void refresh(id).catch(() => {
          /* The next snapshot repairs transient HTTP failures. */
        })
    }
    const timer = setInterval(sync, 4000)
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    const socket =
      session?.realtime && game.seat
        ? connectRealtime({
            room: `game:${id}`,
            onStatus: (status: string) => setConnection(status),
            onMessage: (message: {
              type: string
              members?: unknown[]
              userId?: string | null
            }) => {
              if (
                message.type === 'ready' ||
                (message.type === 'broadcast' && message.userId === null)
              )
                sync()
              if (message.type === 'presence')
                setPeers(message.members?.length || 0)
            },
          })
        : null
    return () => {
      clearInterval(timer)
      socket?.close()
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
      setPeers(0)
    }
  }, [
    game?.id,
    game?.seat,
    game?.status,
    practice !== null,
    ready,
    session?.realtime,
    refresh,
  ])
  useEffect(() => {
    if (!practice || practice.status !== 'playing' || turn !== 'b') return
    const worker = new Worker(new URL('./computer.ts', import.meta.url), {
      type: 'module',
    })
    const snapshot = practice
    worker.onmessage = ({
      data,
    }: MessageEvent<{ move: string; revision: number }>) => {
      const chess = new Chess()
      if (snapshot.pgn) chess.loadPgn(snapshot.pgn)
      const move = chess.move(data.move)
      if (move)
        setPractice((previous) =>
          previous?.revision === data.revision
            ? {
                ...moveGame(
                  previous,
                  'practice-computer',
                  move.from,
                  move.to,
                  move.promotion,
                  Date.now(),
                ),
                revision: previous.revision + 1,
              }
            : previous,
        )
    }
    const timer = setTimeout(
      () =>
        worker.postMessage({ pgn: snapshot.pgn, revision: snapshot.revision }),
      420,
    )
    return () => {
      clearTimeout(timer)
      worker.terminate()
    }
  }, [practice?.revision, practice?.status, turn])
  useEffect(() => {
    if (!current?.moves.length || !sound) return
    try {
      audio.current ??= new AudioContext()
      const ctx = audio.current,
        oscillator = ctx.createOscillator(),
        gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(500, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(
        180,
        ctx.currentTime + 0.055,
      )
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.09)
    } catch {
      /* Audio is optional, including browsers that require a gesture. */
    }
  }, [current?.moves.length, sound])
  useEffect(() => {
    if (practice?.status !== 'playing') return
    const settled = settleClock(practice, now)
    if (settled !== practice) setPractice(settled)
  }, [now, practice])
  useEffect(() => {
    if (current?.status === 'playing') window.scrollTo({ top: 0 })
  }, [current?.id, current?.status])
  useEffect(() => {
    if (review === null && moveList.current)
      moveList.current.scrollTop = moveList.current.scrollHeight
  }, [current?.moves.length, review])
  useEffect(() => {
    if (!incoming && !confirm) return
    const previous = document.activeElement as HTMLElement | null
    const root = dialog.current
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, a[href]',
        ) ?? [],
      )
    const preferred = root?.querySelector<HTMLElement>(
      '[data-preferred], input, [autofocus]',
    )
    ;(preferred ?? focusable()[0])?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Dismissing the challenge pop-up counts as declining it.
        if (incoming) void declineChallenge(incoming)
        setConfirm(null)
      }
      if (event.key !== 'Tab') return
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [incoming, confirm])
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const openGame = (next: PublicGame) => {
    setPractice(null)
    accept(next)
    setPanel('play')
    window.scrollTo({ top: 0 })
    history.replaceState(null, '', `?game=${next.id}`)
  }
  const create = (isPublic: boolean) =>
    run(async () =>
      openGame(
        await api<PublicGame>('/games', {
          ...CONTROLS[control],
          public: isPublic,
          color,
        }),
      ),
    )
  const join = (id: string) =>
    run(async () => {
      openGame(
        await api<PublicGame>(`/games/${encodeURIComponent(id)}/join`, {}),
      )
    })
  const action = (name: string, data: object = {}) =>
    run(async () => {
      if (!game) return
      try {
        accept(
          await api<PublicGame>(`/games/${game.id}/${name}`, {
            revision: game.revision,
            ...data,
          }),
        )
        setReview(null)
      } catch (e) {
        await refresh(game.id)
        throw e
      }
    })
  const move = (from: Square, to: Square, promotion?: string) => {
    if (practice) {
      try {
        setPractice({
          ...moveGame(
            practice,
            'practice-you',
            from,
            to,
            promotion,
            Date.now(),
          ),
          revision: practice.revision + 1,
        })
      } catch (e) {
        setError((e as Error).message)
      }
    } else void action('move', { from, to, promotion })
  }
  const startPractice = () => {
    const game = newGame(
      { id: 'practice-you', name: session?.name || 'Tú', sub: null },
      { ...CONTROLS[control], public: false, color: 'w' },
      now,
    )
    setPractice({
      ...game,
      black: { id: 'practice-computer', name: 'La casa', sub: null },
      status: 'playing',
    })
    setReview(null)
    setFlipped(false)
    setGame(null)
    gameId.current = null
    setPanel('play')
    window.scrollTo({ top: 0 })
    history.replaceState(null, '', location.pathname)
  }
  const home = () => {
    setGame(null)
    setPractice(null)
    gameId.current = null
    setPanel('play')
    setReview(null)
    setError('')
    history.replaceState(null, '', location.pathname)
  }
  const challenge = (target: string) =>
    run(async () => {
      await api<ChallengeView>('/challenges', {
        ...CONTROLS[control],
        color,
        target,
      })
      await syncLobby()
    })
  const cancelChallenge = (id: string) =>
    run(async () => {
      await api(`/challenges/${id}/cancel`, {})
      await syncLobby()
    })
  const acceptChallenge = (challenge: ChallengeView) =>
    run(async () => {
      handled.current.add(challenge.id)
      setLobby((previous) =>
        previous ? { ...previous, incoming: null } : previous,
      )
      openGame(
        await api<PublicGame>(`/challenges/${challenge.id}/accept`, {}),
      )
    })
  const declineChallenge = (challenge: ChallengeView) =>
    run(async () => {
      handled.current.add(challenge.id)
      setLobby((previous) =>
        previous ? { ...previous, incoming: null } : previous,
      )
      await api(`/challenges/${challenge.id}/decline`, {}).catch(() => {
        /* An already expired challenge needs no apology. */
      })
    })
  // The answer to a challenge this player sent: an accepted challenge opens the
  // board, while a rejection or an expiry is reported once and acknowledged.
  useEffect(() => {
    const event = lobby?.event
    if (!event || handled.current.has(event.id)) return
    handled.current.add(event.id)
    if (event.status === 'accepted' && event.gameId)
      void api<PublicGame>(`/games/${event.gameId}`)
        .then((next) => {
          if (gameId.current !== next.id) openGame(next)
        })
        .catch(() => {})
    else if (event.status === 'declined')
      setNotice(`${event.opponent} rechazó tu reto.`)
    else if (event.status === 'expired')
      setNotice(`El reto a ${event.opponent} caducó sin respuesta.`)
    void api(`/challenges/${event.id}/seen`, {}).catch(() => {})
  }, [lobby?.event?.id])
  const signIn = `/auth/freebuff/signin?returnTo=${encodeURIComponent(location.pathname + location.search)}`
  const count = current?.moves.length || 0
  const clock = (side: Color) =>
    current
      ? remaining(current, side, practice ? now : now + offset.current)
      : CONTROLS[control].minutes * 60000
  const topColor = orientation === 'w' ? 'b' : 'w',
    bottomColor = orientation
  const player = (side: Color) =>
    current ? (side === 'w' ? current.white : current.black) : null
  const status = waiting
    ? 'Esperando jugador'
    : current?.status === 'finished'
      ? current.reason
      : active
        ? visible.check
          ? 'Jaque'
          : turn === current?.seat
            ? 'Tu turno'
            : 'Turno del rival'
        : ''
  return (
    <div
      className={`app theme-${theme} ${!current || waiting || panel === 'history' ? 'setup' : 'in-game'}`}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            home()
          }}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M9 7h6v6h3V7h4v6h3V7h6v12l-5 5v8H14v-8l-5-5zM11 34h18" />
          </svg>
          <span>
            torre<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Navegación principal">
          <button
            className={panel === 'play' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPanel('play')}
          >
            <Swords size={19} />
            Jugar
            <ArrowRight className="nav-arrow" size={16} />
          </button>
          <button
            className={panel === 'history' ? 'nav-item selected' : 'nav-item'}
            onClick={() => setPanel('history')}
          >
            <History size={19} />
            Tus partidas
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setConfirm('help')}>
            <CircleHelp size={18} />
            Cómo jugar
          </button>
          <div className="account">
            <div className="account-avatar">
              {(session?.name || 'Invitado').slice(0, 1)}
            </div>
            <div>
              <strong>
                {session?.signedIn ? session.name : 'Jugador invitado'}
              </strong>
              {session?.signedIn ? (
                <form method="post" action="/auth/freebuff/signout">
                  <button>Cerrar sesión</button>
                </form>
              ) : session?.authEnabled ? (
                <a href={signIn}>
                  Inicia sesión con Freebuff <ArrowRight size={12} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <h1>{panel === 'history' ? 'Tus partidas' : 'Juega al ajedrez'}</h1>
          </div>
          <div className="header-actions">
            <span className="quiet-badge">
              <i /> {practice ? 'Práctica' : 'Ajedrez casual'}
            </span>
            <button
              className="icon-button"
              aria-label="Cambiar los colores del tablero"
              title="Cambiar los colores del tablero"
              onClick={() => setTheme((theme + 1) % 3)}
            >
              <Palette size={19} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Cerrar el aviso"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice-banner" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Cerrar el aviso"
              onClick={() => setNotice('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="game-layout">
          <section className="board-column" aria-label="Partida">
            <PlayerBar
              color={topColor}
              name={
                player(topColor)?.name ||
                (current ? 'Esperando a alguien…' : 'Tu rival')
              }
              ms={clock(topColor)}
              active={!!active && turn === topColor}
              you={current?.seat === topColor}
              waiting={waiting && !player(topColor)}
              connected={peers > 1}
            />
            <Board
              fen={visible.fen || blank.fen()}
              pgn={visible.pgn}
              orientation={orientation}
              turn={turn}
              enabled={
                !!active && current?.seat === turn && review === null && !busy
              }
              onMove={move}
            />
            <PlayerBar
              color={bottomColor}
              name={
                player(bottomColor)?.name ||
                (current ? 'Esperando a alguien…' : session?.name || 'Tú')
              }
              ms={clock(bottomColor)}
              active={!!active && turn === bottomColor}
              you={!current || current?.seat === bottomColor}
              waiting={waiting && !player(bottomColor)}
            />
            <div className="board-footer">
              <span className={active ? 'turn-status' : ''}>
                {active && <i />}
                {review !== null ? `Jugada ${Math.ceil(review / 2)}` : status}
              </span>
              <div>
                <button
                  className="icon-button"
                  title="Girar el tablero"
                  aria-label="Girar el tablero"
                  onClick={() => setFlipped(!flipped)}
                >
                  <ArrowDownUp size={17} />
                </button>
                <button
                  className="icon-button"
                  title={sound ? 'Silenciar el sonido' : 'Activar el sonido'}
                  aria-label={sound ? 'Silenciar el sonido' : 'Activar el sonido'}
                  onClick={() => setSound(!sound)}
                >
                  {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                </button>
              </div>
            </div>
          </section>
          <aside className="game-panel">
            {panel === 'history' ? (
              <>
                <div className="panel-heading">
                  <h2>Tus partidas</h2>
                  <button
                    className="icon-button"
                    aria-label="Volver a jugar"
                    onClick={() => setPanel('play')}
                  >
                    <X size={18} />
                  </button>
                </div>
                {stats && (
                  <div className="stats">
                    <div>
                      <strong>{stats.played}</strong>
                      <span>Jugadas</span>
                    </div>
                    <div>
                      <strong>{stats.wins || 0}</strong>
                      <span>Ganadas</span>
                    </div>
                    <div>
                      <strong>{stats.draws || 0}</strong>
                      <span>Empatadas</span>
                    </div>
                    <div>
                      <strong>
                        {stats.played - (stats.wins || 0) - (stats.draws || 0)}
                      </strong>
                      <span>Perdidas</span>
                    </div>
                  </div>
                )}
                <div className="history-list">
                  {games.length ? (
                    games.map((g) => (
                      <button
                        className="history-game"
                        key={g.id}
                        onClick={() =>
                          run(async () =>
                            openGame(await api<PublicGame>(`/games/${g.id}`)),
                          )
                        }
                      >
                        <div>
                          <strong>
                            {(g.seat === 'w' ? g.black : g.white)?.name ||
                              'Asiento libre'}
                          </strong>
                          <span>
                            {new Date(g.createdAt).toLocaleDateString(
                              'es',
                              { month: 'short', day: 'numeric' },
                            )}{' '}
                            · {g.minutes} + {g.increment}
                          </span>
                        </div>
                        <span className="game-result">
                          {g.result ||
                            (g.status === 'waiting'
                              ? 'Esperando'
                              : g.status === 'cancelled'
                                ? 'Cancelada'
                                : 'En juego')}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-history">
                      <History size={30} strokeWidth={1.3} />
                      <p>Tu primera partida te espera.</p>
                      <button
                        className="text-button"
                        onClick={() => setPanel('play')}
                      >
                        Vamos a jugar <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
                {!session?.signedIn && session?.authEnabled && (
                  <a className="signin-note" href={signIn}>
                    Inicia sesión con Freebuff para guardar tu historial{' '}
                    <ArrowRight size={15} />
                  </a>
                )}
              </>
            ) : current ? (
              <>
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">
                      {practice
                        ? 'Práctica'
                        : current.public
                          ? 'Partida abierta'
                          : 'Partida amistosa'}
                    </span>
                    <h2>
                      {current.minutes} <span className="time-plus">+</span>{' '}
                      {current.increment}
                      <small>{current.minutes < 10 ? 'Blitz' : 'Rápida'}</small>
                    </h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Volver a la sala"
                    title="Volver a la sala"
                    onClick={home}
                  >
                    <ArrowLeft size={18} />
                  </button>
                </div>
                {waiting ? (
                  <div className="waiting-content">
                    <div className="waiting-symbol">
                      <Piece type="n" color="w" />
                      <span className="waiting-pulse" />
                    </div>
                    <h3>
                      {current.seat ? 'Tu mesa está abierta' : 'Únete a esta mesa'}
                    </h3>
                    {current.seat ? (
                      <>
                        <div className="waiting-table">
                          <span>
                            {current.minutes} <b>+</b> {current.increment}
                          </span>
                          <strong>Mesa pública</strong>
                        </div>
                        <span className="waiting-note">
                          Apareces en la lista de jugadores conectados como mesa
                          abierta, y desde ahí también puedes retar a quien
                          quieras.
                        </span>
                        <button
                          className="text-button muted"
                          onClick={() => action('cancel')}
                          disabled={busy}
                        >
                          Cerrar la mesa
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => join(current.id)}
                      >
                        Únete a la partida <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="game-state">
                      <span>
                        <i
                          className={`connection-dot ${connection === 'connected' || practice ? 'online' : ''}`}
                        />
                        {current.status === 'finished'
                          ? 'Partida terminada'
                          : practice
                            ? 'Jugando contra la casa'
                            : connection === 'connected'
                              ? 'Conectado'
                              : 'Sincronizando'}
                      </span>
                      <span>
                        {current.seat
                          ? current.seat === 'w'
                            ? 'Juegas con blancas'
                            : 'Juegas con negras'
                          : 'Observando'}
                      </span>
                    </div>
                    {current.status === 'finished' && (
                      <div className="result-card">
                        <Trophy size={25} strokeWidth={1.5} />
                        <h3>
                          {current.result === '½-½'
                            ? 'Un empate bien jugado.'
                            : `${current.result === '1-0' ? 'Ganan las blancas' : 'Ganan las negras'}.`}
                        </h3>
                        <span>{current.reason}</span>
                        <strong>{current.result}</strong>
                        <button
                          className="primary"
                          onClick={practice ? startPractice : home}
                        >
                          Jugar otra vez <RotateCcw size={16} />
                        </button>
                      </div>
                    )}
                    {current.status === 'cancelled' ? (
                      <div className="empty-history">
                        <p>Partida cancelada.</p>
                        <button className="primary" onClick={home}>
                          Nueva partida
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="moves-heading">
                          <span>Jugadas</span>
                          {count > 0 && (
                            <button
                              className="text-button"
                              onClick={() => {
                                const blob = new Blob([current.pgn], {
                                    type: 'application/x-chess-pgn',
                                  }),
                                  url = URL.createObjectURL(blob),
                                  a = document.createElement('a')
                                a.href = url
                                a.download = 'torre-partida.pgn'
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                            >
                              Exportar
                            </button>
                          )}
                        </div>
                        <div className="move-list" ref={moveList}>
                          {count ? (
                            Array.from(
                              { length: Math.ceil(count / 2) },
                              (_, i) => (
                                <div className="move-row" key={i}>
                                  <span>{i + 1}.</span>
                                  {[i * 2, i * 2 + 1].map((index) => (
                                    <button
                                      key={index}
                                      disabled={!current.moves[index]}
                                      className={
                                        (review ?? count) === index + 1
                                          ? 'current-move'
                                          : ''
                                      }
                                      onClick={() =>
                                        setReview(
                                          index + 1 === count
                                            ? null
                                            : index + 1,
                                        )
                                      }
                                    >
                                      {current.moves[index] || ''}
                                    </button>
                                  ))}
                                </div>
                              ),
                            )
                          ) : (
                            <div className="empty-moves">
                              <span>1.</span>
                              <span>Mueven las blancas</span>
                            </div>
                          )}
                        </div>
                        <div className="replay-controls">
                          <button
                            className="icon-button"
                            aria-label="Posición inicial"
                            disabled={!count}
                            onClick={() => setReview(0)}
                          >
                            <ChevronFirst size={19} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Jugada anterior"
                            disabled={!count || review === 0}
                            onClick={() =>
                              setReview(Math.max(0, (review ?? count) - 1))
                            }
                          >
                            <ChevronLeft size={19} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Jugada siguiente"
                            disabled={review === null}
                            onClick={() =>
                              setReview(
                                (review ?? count) + 1 >= count
                                  ? null
                                  : (review ?? count) + 1,
                              )
                            }
                          >
                            <ChevronRight size={19} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Tablero en vivo"
                            disabled={review === null}
                            onClick={() => setReview(null)}
                          >
                            <ChevronLast size={19} />
                          </button>
                        </div>
                      </>
                    )}
                    {current.drawOffer && active && (
                      <div className="draw-notice">
                        {current.drawOffer === current.seat ? (
                          <span>Tablas ofrecidas</span>
                        ) : (
                          <>
                            <span>¿Tablas?</span>
                            <button onClick={() => action('draw')}>
                              Aceptar
                            </button>
                            <button onClick={() => action('decline')}>
                              Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {active && current.seat && (
                      <div className="game-actions">
                        {!practice && (
                          <button
                            onClick={() => action('draw')}
                            disabled={busy || !!current.drawOffer}
                          >
                            <span className="draw-icon">½</span>Ofrecer tablas
                          </button>
                        )}
                        <button
                          onClick={() => setConfirm('resign')}
                          disabled={busy}
                        >
                          <Flag size={15} />
                          Abandonar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="panel-heading">
                  <h2>Nueva partida</h2>
                  <span className="panel-emblem">
                    <Swords size={19} />
                  </span>
                </div>
                <div className="new-game-controls">
                  <div className="control-label">Ritmo de juego</div>
                  <div className="time-controls">
                    {CONTROLS.map((c, i) => (
                      <button
                        key={c.minutes}
                        className={control === i ? 'chosen' : ''}
                        onClick={() => setControl(i)}
                      >
                        <strong>
                          {c.minutes} <span>+</span> {c.increment}
                        </strong>
                        <small>{c.minutes < 10 ? 'Blitz' : 'Rápida'}</small>
                      </button>
                    ))}
                  </div>
                  <div className="side-controls">
                    <span>Juega con</span>
                    <div role="group" aria-label="Tus piezas">
                      <button
                        className={color === 'w' ? 'chosen' : ''}
                        aria-label="Blancas"
                        aria-pressed={color === 'w'}
                        title="Blancas"
                        onClick={() => setColor('w')}
                      >
                        <Piece type="k" color="w" />
                      </button>
                      <button
                        className={color === 'random' ? 'chosen' : ''}
                        aria-label="Color aleatorio"
                        aria-pressed={color === 'random'}
                        title="Aleatorio"
                        onClick={() => setColor('random')}
                      >
                        <Shuffle size={19} />
                      </button>
                      <button
                        className={color === 'b' ? 'chosen' : ''}
                        aria-label="Negras"
                        aria-pressed={color === 'b'}
                        title="Negras"
                        onClick={() => setColor('b')}
                      >
                        <Piece type="k" color="b" />
                      </button>
                    </div>
                  </div>
                  <button
                    className="primary"
                    disabled={busy || !ready}
                    onClick={() => create(true)}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <Swords size={18} />
                    )}
                    Jugar en línea
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="text-button practice-button"
                    onClick={startPractice}
                  >
                    Practicar contra la computadora <ArrowRight size={14} />
                  </button>
                </div>
                <div className="lobby">
                  <div className="lobby-heading">
                    <h3>Jugadores conectados</h3>
                    <span className="count-badge">{online.length}</span>
                  </div>
                  {outgoing && (
                    <div className="challenge-sent">
                      <Swords size={17} />
                      <div>
                        <strong>Reto enviado a {outgoing.opponent}</strong>
                        <span>
                          {outgoing.minutes} + {outgoing.increment} ·{' '}
                          {challengeSeconds(outgoing)
                            ? `${challengeSeconds(outgoing)} s`
                            : 'sin respuesta'}
                        </span>
                      </div>
                      <button
                        className="text-button muted"
                        disabled={busy}
                        onClick={() => cancelChallenge(outgoing.id)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {online.length ? (
                    <div className="lobby-list">
                      {online.map((p) => (
                        <div className="lobby-player" key={p.id}>
                          <div className="lobby-avatar">
                            <Users size={16} />
                          </div>
                          <div>
                            <strong>{p.name}</strong>
                            <span>
                              <i
                                className={`status-dot ${p.status === 'free' ? 'free' : 'busy'}`}
                              />
                              {p.status === 'busy'
                                ? p.table
                                  ? `Mesa abierta · ${p.table.minutes} + ${p.table.increment}`
                                  : 'En una partida'
                                : 'Libre'}
                            </span>
                          </div>
                          {p.table ? (
                            <button
                              className="mini"
                              disabled={busy}
                              onClick={() => join(p.table!.id)}
                            >
                              Unirse <ArrowRight size={15} />
                            </button>
                          ) : p.status === 'busy' ? (
                            <span className="busy-badge">Ocupado</span>
                          ) : p.challenged ? (
                            <span className="busy-badge sent">Reto enviado</span>
                          ) : (
                            <button
                              className="mini"
                              disabled={busy || !!outgoing}
                              onClick={() => challenge(p.id)}
                            >
                              Retar <Swords size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-lobby">
                      <Users size={24} strokeWidth={1.3} />
                      <p>No hay otros jugadores conectados</p>
                      <span>
                        Abre la página en otro navegador y aparecerán aquí.
                      </span>
                    </div>
                  )}
                  <p className="lobby-hint">
                    Elige el ritmo y el color arriba y reta a quien esté libre.
                    Le saltará un aviso en pantalla para aceptar o rechazar.
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
      {(incoming || confirm) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (incoming) void declineChallenge(incoming)
            setConfirm(null)
          }}
        >
          <section
            className={`modal ${incoming ? 'challenge-modal' : ''}`}
            ref={dialog}
            role={incoming ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-label={
              incoming
                ? `Reto de ${incoming.opponent}`
                : confirm === 'help'
                  ? 'Cómo jugar'
                  : 'Abandonar la partida'
            }
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (incoming) void declineChallenge(incoming)
                setConfirm(null)
              }
            }}
          >
            <button
              className="modal-close icon-button"
              aria-label={incoming ? 'Rechazar el reto' : 'Cerrar'}
              onClick={() => {
                if (incoming) void declineChallenge(incoming)
                setConfirm(null)
              }}
            >
              <X size={19} />
            </button>
            {incoming ? (
              <>
                <div className="challenge-emblem">
                  <Piece type="k" color="w" />
                  <span className="challenge-versus">
                    <Swords size={15} />
                  </span>
                </div>
                <span className="eyebrow">Reto de partida</span>
                <h2>{incoming.opponent} te reta</h2>
                <p>
                  {incoming.minutes} + {incoming.increment} ·{' '}
                  {incoming.minutes < 10 ? 'Blitz' : 'Rápida'} · juegas con{' '}
                  {incoming.color === 'random'
                    ? 'color aleatorio'
                    : incoming.color === 'w'
                      ? 'blancas'
                      : 'negras'}
                </p>
                <div className="challenge-clock">
                  <Clock3 size={15} />
                  {challengeSeconds(incoming)
                    ? `Tienes ${challengeSeconds(incoming)} s para responder`
                    : 'El reto caducó'}
                </div>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => void declineChallenge(incoming)}
                  >
                    Rechazar
                  </button>
                  <button
                    className="primary"
                    data-preferred
                    onClick={() => void acceptChallenge(incoming)}
                  >
                    Aceptar <Swords size={17} />
                  </button>
                </div>
                <span className="modal-hint">
                  Si cierras este aviso, el reto se rechaza.
                </span>
              </>
            ) : confirm === 'help' ? (
              <>
                <h2>Mueve tu pieza.</h2>
                <p>
                  Toca una pieza y luego una casilla marcada. También puedes
                  arrastrarla.
                </p>
                <p>
                  Reta a cualquier jugador conectado de la lista: verás quién
                  está libre y quién está ocupado, y a quien retes recibirá un
                  aviso en pantalla para aceptar o rechazar. También puedes
                  abrir una mesa pública y esperar a que alguien se siente. No
                  hace falta crear una cuenta.
                </p>
                <button
                  className="primary"
                  autoFocus
                  onClick={() => setConfirm(null)}
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <Flag className="modal-symbol" size={26} />
                <h2>¿Abandonar esta partida?</h2>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    autoFocus
                    onClick={() => setConfirm(null)}
                  >
                    Seguir jugando
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      setConfirm(null)
                      if (practice)
                        setPractice(
                          finish(practice, '0-1', 'Abandono', Date.now()),
                        )
                      else void action('resign')
                    }}
                  >
                    Abandonar
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
