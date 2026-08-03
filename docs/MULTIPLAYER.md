# Multiplayer

The game ships with a small relay server (`server.js`) that lets two players
share a run. Until now it was not documented anywhere — this page fills that gap.

Single-player needs nothing but a static file server. Everything below applies
only if you want the co-op lobby to work.

---

## Running the server

The relay is the only part of the project that has a dependency:

```bash
npm install ws
node server.js
```

It prints:

```
Crown Defender MP — 3 rooms on :3100
```

`GET /` on the same port returns the current room list as JSON — handy as a
health check:

```bash
curl -s localhost:3100
{"status":"Crown Defender MP","rooms":[{"id":0,"players":0,"state":"empty"}, ...]}
```

## Connecting the client

The client builds its socket URL from the page it was served from:

```js
const MP_WS = `ws://${location.hostname}/ws`;
```

Two consequences worth knowing before you debug for an hour:

1. **No port in the URL.** The browser goes to port 80, not 3100. The relay
   has to sit behind a reverse proxy that forwards `/ws` to it.
2. **`ws://`, not `wss://`.** On an HTTPS page the browser blocks a plain
   `ws://` connection as mixed content. Either serve the game over plain HTTP,
   or change that line to derive the scheme from `location.protocol`.

Minimal nginx:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

For local testing on one machine it is simpler to serve the page from the
relay's own host and point `MP_WS` at `ws://${location.hostname}:3100/ws`.

## Rooms

Three fixed rooms, two slots each — the constant is `MAX_ROOMS` in `server.js`.
Slot 0 is the host (P1), slot 1 is the guest (P2).

A room is `empty` → `waiting` (someone joined) → `active` (host pressed start).
While a room is `active` nobody else can enter it, and when both players leave
it drops back to `empty`.

## Protocol

Plain JSON over WebSocket. The relay understands three message types and
forwards everything else untouched to the other player in the room.

**Server → client**

| Type | Payload | When |
|---|---|---|
| `rooms` | `list: [{id, players, state}]` | on connect, and on every room change while you are still in the lobby |
| `joined` | `pid` (1 or 2), `room` | you got a slot |
| `p2joined` | — | sent to the host when a guest arrives |
| `full` | `room` | room is taken or already running |
| `start` | `countdown: 5` | host started the game |
| `leave` | `pid` | the other player disconnected |
| `err` | `text` | human-readable refusal |

**Client → server**

| Type | Payload | Notes |
|---|---|---|
| `join` | `room` (0..2) | ignored if you are already in a room |
| `startReq` | — | host only; refused while the second slot is empty |
| anything else | — | relayed verbatim to the other player |

That last row is the whole design: the server keeps no game state. It knows
about rooms and nothing else, and both clients simulate the run themselves,
exchanging position and enemy updates directly through the relay.

**What that buys and what it costs.** The server stays 122 lines and cannot
desync, because it has nothing to desync. In exchange there is no authority:
a modified client can send whatever it likes, and the two simulations can
drift apart on a bad connection. For a co-op game against AI enemies that
trade is fine — for competitive play it would not be.

## Troubleshooting

**Lobby shows nothing.** The socket never opened. Check the browser console
for the `/ws` request — a `404` means the proxy is not forwarding, a mixed
content error means the page is on HTTPS.

**"Ждём второго игрока".** The host pressed start with an empty second slot.

**Both players see room `full`.** A previous session left the room `active`.
Restarting `node server.js` clears all rooms — they live in memory only.
