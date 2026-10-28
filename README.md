# Torre

A standalone chess app on Freebuff Sites, in Spanish. Original SVG pieces, a
responsive board, drag or click moves, four time controls, a list of connected
players you can challenge with an accept-or-decline pop-up, public tables, move
replay, game exports, a small practice opponent and optional Sign in with
Freebuff. No account is required to play another person.

All interface copy, server messages and error text are Spanish, so piece names,
accessibility labels and the PGN export filename differ from the English starter.
`APP_ORIGIN` in a gitignored `.dev.vars` is a local-only override for running the
cloud preview origin; hosted deploys keep the platform-injected value.

## Run

```sh
bun install
# Terminal 1: local managed realtime helper
bun run dev:realtime
# Terminal 2: app + local D1, at http://127.0.0.1:5184
bun run dev
```

Use two different browser profiles to play both sides. Two tabs in one profile
are the same guest. The computer is available without a second player; it runs
in a browser Worker so its search does not block board interaction.

```sh
bun run typecheck
bunx bun@1.3.14 test tests
bun scripts/smoke.ts http://127.0.0.1:5184
bun run build
```

The smoke test drives four guests through the real Worker: presence, a public
table with simultaneous seat claims, a challenge that is accepted and played to
checkmate, a declined challenge, a withdrawn challenge, same-origin protection,
rejection of a challenge to an occupied player, a real WebSocket update, reload
persistence and history. Run it only against a local database or a dedicated
preview.

## Challenging another player

Every open tab checks in with the server, so the lobby lists the players who are
connected right now with their state: free, sitting at a public table, or already
playing. Choose a time control and a colour, then challenge anybody who is free.
The challenge arrives on their screen as a dialog with accept and decline, and
it expires after 30 seconds. Dismissing the dialog declines it, one player can
hold only one unanswered challenge, and the sender sees the answer in the same
lobby: an accepted challenge opens the board for both sides.

## Deploy to Preview

Follow the repository's Freebuff Sites workflow: create the site, attach its
Preview D1 database as `DB`, enable Sign in with Freebuff for Preview, then
deploy `deploy.json`. Its `realtime: true` provisions the managed realtime helper.
The platform injects `APP_ORIGIN`, `FREEBUFF_CLIENT_ID` and `FREEBUFF_ISSUER`.
Local `wrangler.jsonc` values and database ids are never deployed as platform
configuration. No API key, session secret or external chess service is needed.

The hosted demo is at
https://site-9026a518791f45bbb3fe07b01ec05260.freebuff.page.
It has its own isolated database and realtime helper. Projects created from
this template provision their own resources; they do not share the demo's games
or accounts. Publishing the starter catalog does not promote the demo's data.

The generated `freebuff-realtime/worker.js` is **local development only**. Sites
deploys its own managed helper. Never upload the local helper as an app Worker.
Stop both local processes when finished.

## Where things live

- `src/styles.css`: colors, typography, responsive layout and board animation.
- `src/app/Piece.tsx`: the original, consistently shaded Staunton vector set.
- `src/app/Board.tsx`: stable piece identities, castling/capture animations,
  pointer handling, legal destinations, keyboard buttons and promotion.
- `src/shared/game.ts`: chess.js validation, history, game outcomes, clocks and
  the challenge shape shared with the browser.
- `src/worker/index.ts`: guest sessions, Freebuff auth, D1, presence,
  challenges and game APIs.
- `src/app/computer.ts`: a modest two-ply practice opponent, not an engine rating.

## State and identity

The server validates every online move. A compare-and-set on the game's revision
commits the entire state, clock and outcome atomically. Concurrent joins or moves
cannot overwrite each other. Published events contain only a revision; clients
fetch authoritative state, ignore older revisions and resync after reconnect.
A four-second snapshot fallback repairs a missed publication and resolves clocks
even if realtime is unavailable. Clocks use server time; an expired clock is
settled when the game is next read or changed. Guests cannot publish game events.

D1 stores this site's games and a SHA-256 hash of each random guest credential.
The credential lives only in an HttpOnly, SameSite cookie (Secure on hosted
origins). Invites identify a game, never authorize a player's moves. Games and
stats are casual, with no matchmaking rating or anti-cheat claim.

Signing in before creating or joining a game associates that seat with the
server-verified Freebuff `sub`. That account can resume on another device and
its wins, losses and draws persist. Guest history remains in that browser;
signing in does not retroactively claim guest results. Signing out does not
permit the guest cookie to control the account's seats.

Invites identify a game, never authorize a player's moves: a challenge is a
request to play, and every seat, move and clock is still checked server-side. The
player list shows up to 50 players seen in the last 25 seconds. Game history
shows the latest 50; signed-in stats aggregate completed account games. Game
creation and challenge sending each have a short cooldown, and a challenge never
reaches a player who is already at a board. The managed realtime limits still
apply; this is a small casual chess room, not a tournament service. No platform
Postgres schema, auth provider or dispatcher is changed.

All visible copy uses sentence case. Fonts are bundled locally. No tracking,
remote image requests or purchased chess artwork are required.
