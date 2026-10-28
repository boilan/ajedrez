// Exercises the real Worker and database. Run only against this template's
// disposable local database or its dedicated preview, never a production site.
// bun scripts/smoke.ts http://127.0.0.1:5184
import assert from 'node:assert/strict'
const origin = process.argv[2]
if (!origin) throw new Error('Pass the local or isolated preview origin.')
class Client {
  cookie = ''
  name = ''
  async request(
    path: string,
    body?: unknown,
    expected = 200,
    customOrigin = origin,
  ) {
    const response = await fetch(origin + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: customOrigin,
        Cookie: this.cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const cookie = response.headers.get('set-cookie')
    if (cookie) this.cookie = cookie.split(';')[0]
    const text = await response.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(
        `${path} answered ${response.status}: ${text.slice(0, 200)}`,
      )
    }
    assert.equal(response.status, expected, JSON.stringify(data))
    return data
  }
}
async function until(predicate: () => boolean) {
  const end = Date.now() + 12000
  while (!predicate()) {
    if (Date.now() > end)
      throw new Error('Timed out waiting for realtime message')
    await Bun.sleep(50)
  }
}
const a = new Client(),
  b = new Client(),
  c = new Client(),
  outsider = new Client()
const clients = [a, b, c, outsider]
for (const client of clients) client.name = (await client.request('/session', {})).name

// Checking in is what makes a player visible, so everyone checks in before the
// lobby is read. Nobody is listed for themselves.
await Promise.all(clients.map((client) => client.request('/players', {})))
const lobbies = await Promise.all(
  clients.map((client) => client.request('/players', {})),
)
clients.forEach((client, index) => {
  const lobby = lobbies[index]
  assert.equal(lobby.players.length, clients.length - 1)
  assert.ok(!lobby.players.some((p: any) => p.name === client.name))
  assert.ok(
    lobby.players.every((p: any) => p.status === 'free' && p.table === null),
  )
  assert.equal(lobby.incoming, null)
  assert.equal(lobby.outgoing, null)
})
const ids = new Map<string, string>()
for (const lobby of lobbies)
  for (const player of lobby.players) ids.set(player.name, player.id)
assert.equal(ids.size, clients.length, 'Every connected player is listed once')
const idFor = (client: Client) => {
  const id = ids.get(client.name)
  assert.ok(id, `${client.name} is missing from the player list`)
  return id
}

// Challenges never cross origins.
await a.request(
  '/challenges',
  { minutes: 10, increment: 0, color: 'w', target: idFor(b) },
  403,
  'https://foreign.example',
)

// A public table is visible to everyone, and only one of two simultaneous
// claims wins the seat.
const table = await outsider.request(
  '/games',
  { minutes: 10, increment: 0, public: true, color: 'w' },
  201,
)
const advertised = (await a.request('/players', {})).players.find(
  (p: any) => p.name === outsider.name,
)
assert.equal(advertised.status, 'busy')
assert.deepEqual(advertised.table, {
  id: table.id,
  minutes: 10,
  increment: 0,
})
const races = await Promise.allSettled([
  a.request(`/games/${table.id}/join`, {}),
  b.request(`/games/${table.id}/join`, {}),
])
assert.equal(
  races.filter((r) => r.status === 'fulfilled').length,
  1,
  'Only one opponent can claim the seat',
)
const winner = races[0].status === 'fulfilled' ? a : b
const loser = winner === a ? b : a
const seated = await winner.request(`/games/${table.id}`)
assert.equal(seated.status, 'playing')
assert.equal(seated.code, undefined)
assert.ok(!JSON.stringify(seated).includes('"code"'))
await winner.request(`/games/${table.id}/resign`, {
  revision: seated.revision,
})
assert.equal((await outsider.request(`/games/${table.id}`)).status, 'finished')
assert.equal((await loser.request('/players', {})).incoming, null)

// A challenge reaches its target as a pending offer, one at a time, and never
// while either side is already at a board.
const sent = await a.request(
  '/challenges',
  { minutes: 10, increment: 0, color: 'w', target: idFor(b) },
  201,
)
assert.equal(sent.opponent, b.name)
assert.equal(sent.color, 'w')
assert.equal(sent.status, 'pending')
await a.request(
  '/challenges',
  { minutes: 5, increment: 0, color: 'b', target: idFor(c) },
  429,
)
await c.request(
  '/challenges',
  { minutes: 5, increment: 0, color: 'b', target: idFor(b) },
  409,
)
await a.request('/challenges', { minutes: 5, target: idFor(a) }, 400)
const bLobby = await b.request('/players', {})
assert.equal(bLobby.incoming.id, sent.id)
assert.equal(bLobby.incoming.opponent, a.name)
assert.equal(bLobby.incoming.color, 'b')
assert.ok(bLobby.incoming.expiresAt > bLobby.serverNow)
await c.request(`/challenges/${sent.id}/accept`, {}, 403)
const game = await b.request(`/challenges/${sent.id}/accept`, {}, 201)
assert.equal(game.status, 'playing')
assert.equal(game.seat, 'b')
assert.equal(game.code, undefined)
const answer = await a.request('/players', {})
assert.equal(answer.event.id, sent.id)
assert.equal(answer.event.status, 'accepted')
assert.equal(answer.event.opponent, b.name)
assert.equal(answer.event.gameId, game.id)
await a.request(`/challenges/${sent.id}/seen`, {})
assert.equal((await a.request('/players', {})).event, null)
const mine = await a.request(`/games/${game.id}`)
assert.equal(mine.seat, 'w')

// An occupied player is shown as busy and cannot be challenged.
const busy = (await c.request('/players', {})).players.find(
  (p: any) => p.name === a.name,
)
assert.equal(busy.status, 'busy')
assert.equal(busy.table, null)
await c.request(
  '/challenges',
  { minutes: 5, increment: 0, color: 'w', target: idFor(a) },
  409,
)

// Only the two players can subscribe to the game room.
const ticket = await b.request('/realtime/ticket', { room: `game:${game.id}` })
assert.equal(typeof ticket.websocketUrl, 'string')
await c.request('/realtime/ticket', { room: `game:${game.id}` }, 403)
const socket = new WebSocket(ticket.websocketUrl, {
  headers: { Origin: origin },
})
const messages: any[] = []
socket.addEventListener('message', (e) =>
  messages.push(JSON.parse(String(e.data))),
)
await until(() => messages.some((m) => m.type === 'ready'))
const stale = game.revision
const opened = await a.request(`/games/${game.id}/move`, {
  revision: stale,
  from: 'f2',
  to: 'f3',
})
await until(() =>
  messages.some(
    (m) => m.type === 'broadcast' && m.data?.revision === opened.revision,
  ),
)
assert.equal(messages.find((m) => m.type === 'broadcast').userId, null)
await a.request(
  `/games/${game.id}/move`,
  { revision: stale, from: 'e2', to: 'e4' },
  409,
)
let played = await b.request(`/games/${game.id}/move`, {
  revision: opened.revision,
  from: 'e7',
  to: 'e5',
})
played = await a.request(`/games/${game.id}/move`, {
  revision: played.revision,
  from: 'g2',
  to: 'g4',
})
played = await b.request(`/games/${game.id}/move`, {
  revision: played.revision,
  from: 'd8',
  to: 'h4',
})
assert.equal(played.result, '0-1')
assert.equal(played.reason, 'Jaque mate')
assert.equal((await a.request(`/games/${game.id}`)).pgn, played.pgn)
assert.ok(
  (await a.request('/history')).games.some(
    (g: any) => g.id === game.id && g.result === '0-1',
  ),
)
socket.close()

// A rejection is reported once to the sender, and a challenge can be withdrawn
// before it is answered.
const declinedOffer = await c.request(
  '/challenges',
  { minutes: 5, increment: 0, color: 'w', target: idFor(outsider) },
  201,
)
await outsider.request(`/challenges/${declinedOffer.id}/decline`, {})
const declined = await c.request('/players', {})
assert.equal(declined.event.id, declinedOffer.id)
assert.equal(declined.event.status, 'declined')
assert.equal(declined.event.opponent, outsider.name)
await c.request(`/challenges/${declinedOffer.id}/seen`, {})
const withdrawn = await outsider.request(
  '/challenges',
  { minutes: 3, increment: 2, color: 'random', target: idFor(c) },
  201,
)
await a.request(`/challenges/${withdrawn.id}/cancel`, {}, 403)
await outsider.request(`/challenges/${withdrawn.id}/cancel`, {})
assert.equal((await outsider.request('/players', {})).outgoing, null)
assert.equal((await c.request('/players', {})).incoming, null)

console.log(
  'Passed: guest sessions, presence with free/busy state, public table and join race, challenge offer, occupied-player and one-at-a-time rules, origin protection, seat authorization, accept and open, decline, withdraw, realtime delivery, checkmate, reload and history.',
)
process.exit(0)
