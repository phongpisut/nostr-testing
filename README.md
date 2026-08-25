# 🎣 Nostr Fishing

A realtime multiplayer fishing game over the Nostr network, built with
**React 19 + Vite + [nostr-tools](https://www.npmjs.com/package/nostr-tools)**.

Players share a room over low-traffic Nostr relays. One player is the **host**
and runs the authoritative game state (fish positions, score values, timer);
everyone else competes on a shared realtime arena.

## Gameplay

1. **Create a room** to become the **host**, or **paste a room id** to join as a player.
2. The host presses **▶ Play** — a 3‑2‑1 countdown runs for everyone.
3. Fish swim left/right across the ocean. Host assigns each fish a score (+1 to +9).
4. Move your fishing pole (← → arrow keys or click) and press **SPACE** when the
   pole is close to a fish to catch it.
5. Catches are broadcast to everyone: the fish leaves the pool, the catcher earns
   its score, and the total scoreboard updates live.

Each player is auto-assigned a distinct color (derived from their Nostr pubkey).

## How it works over Nostr

Game messages ride on Nostr **kind‑1** events scoped to a room via a `["t", room]`
tag and a `["g", type]` tag classifying the payload (JSON in `content`):

| Type   | Sent by | Payload                       | Purpose                               |
| ------ | ------- | ----------------------------- | ------------------------------------- |
| `start`| host    | `{ countdown }`               | Begin 3‑2‑1 countdown                 |
| `state`| host    | fish positions, time, scores  | Authoritative game state broadcast    |
| `catch`| player  | `{ fishId }`                  | Attempted catch                       |
| `hit`  | host    | `{ fishId, player, score, scores }` | Catch confirmation + score out |
| `end`  | host    | `{ scores }`                  | Game over leaderboard                 |

The **host is the source of truth**: it owns the fish pool, moves fish each tick,
resolves catch attempts, and redistributes scores. Players render the latest host
state, attempt local catches, and learn the outcome from `hit` broadcasts. Color
and identity come from each player's Nostr keypair (stored in `localStorage`).

### Nostr notes

- Relays: `wss://nos.lol`, `wss://relay.mostr.pub` — free, low-traffic, support
  kind‑1 `#t` indexing.
- Subscriptions use `AbstractRelay` directly because `SimplePool.subscribeMany`
  emits a malformed REQ frame (`["REQ","id",[{...}]]`) that strict relays reject.
- Events are deduped by id and only messages tagged with the active room are shown.

## Architecture

```text
                 ┌──────────────────── Browser ────────────────────┐
                 │                                                   │
                 │  HOST client          │      PLAYER client(s)    │
                 │  ──────────────       │      ───────────────      │
                 │  fish pool (owner)    │      render fish + pole    │
                 │  game loop (tick 400ms)│      move pole ← → space  │
                 │  resolve catches      │      send  catch event     │
                 └───────┬───────────────┴──────────┬────────────────┘
                         │  publish                  │  publish
                         ▼                           ▼
                 ┌──────────────────────────────────────────────┐
                 │     Nostr relays (nos.lol, relay.mostr.pub)  │
                 │   kind-1 events tagged [#g:type, #t:room]     │
                 └──────────────────────────────────────────────┘
                         ▲           ▲          ▲
                         │           │          │
              start/state │     catch  │    hit/end
              (host→all)  │  (player→host)  (host→all)
```

Message flow for one catch:

```text
player presses SPACE near fish A
   │
   ▼
player publishes catch {fishId:A}  ──►  host
   │
   ▼
host validates A is still in pool, +score to player
   │
   ├─► broadcast hit {fishId:A, player, score, scores}
   └─► remove A from pool
        │
        ▼
   all clients: A disappears, scoreboard updates, toast "on fire caught +5"
```

## Run

```bash
npm install
npm run dev
```

Open two tabs, create a room in one and join with the same id in the other.

## Tech notes

- Keys and current room live in `localStorage`; clearing them yields a new identity.
- The room creator (host) is remembered on reload via `nostr-fishing-host`.
- `dist/` and `node_modules/` are gitignored.
