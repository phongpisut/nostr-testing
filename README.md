# Nostr Channel Chat

A minimal realtime Nostr chat client built with Svelte 5 + Vite + [nostr-tools](https://www.npmjs.com/package/nostr-tools).

Unlike a normal Nostr client that shows the global timeline, this app scopes
messages to a **private channel**: every event is tagged with a channel id and
the client only subscribes to events carrying that tag. Only people who know
the channel id can read or post to it.

## Features

- Realtime send/receive over WebSocket (no polling)
- Channel-scoped messaging via `#t` tags, not the public firehose
- Automatic local keypair generation (persisted in `localStorage`)
- Low-traffic relays to keep noise down
- Join any channel by pasting its id

## Getting started

```bash
npm install
npm run dev
```

Load the app in two tabs, copy the channel id from the first into the second,
and chat in realtime.

## Nostr implementation

This project uses the [`nostr-tools`](https://www.npmjs.com/package/nostr-tools) library:

| Concern              | Approach                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Key generation       | `generateSecretKey()` → hex, persisted in `localStorage`                 |
| Pubkey               | `getPublicKey(sk)`                                                        |
| Signing              | `finalizeEvent(..., sk)` produces a signed kind-1 event                  |
| Subscription         | `AbstractRelay.subscribe(...)` per relay (see note below)                 |
| Publishing           | `relay.publish(event)` to every connected relay                           |
| Channel scoping      | `["t", <channelId>]` tag on every event; filter with `"#t": [channelId]`  |

### Why not `SimplePool`?

`SimplePool.subscribeMany` in the current `nostr-tools` line double-wraps the
filter array and emits a malformed REQ frame:

```
["REQ","sub:1",[{...}]]   ❌ non-standard, rejected by strict relays
```

`AbstractRelay` sends the spec-compliant single-object form:

```
["REQ","sub:1",{...}]     ✅ accepted
```

The app therefore subscribes via `AbstractRelay` directly and deduplicates
events across relays by event id.

## Relay servers (low-traffic, free)

| Relay                 | URL                       | Notes                                  |
| --------------------- | ------------------------- | -------------------------------------- |
| Nos.lol               | `wss://nos.lol`           | Free, supports kind 1 + `#t` indexing  |
| Mostr.pub             | `wss://relay.mostr.pub`   | Free, supports kind 1 (Mastodon bridge)|

Relays tested and excluded:

| Relay                 | Reason for exclusion                     |
| --------------------- | ---------------------------------------- |
| `purplepag.es`        | Blocks kind 1 (pubkey metadata only)     |
| `nostr.land`          | Paywall / not free                       |
| `relay.nostr.band`    | High traffic                             |
| `relay.primal.net`    | High traffic                             |
| `relay.damus.io`      | High traffic                             |
| `nostr.wine`          | Requires sign-in                         |

## Architecture

```text
                  ┌────────────────────────────────────────────┐
                  │                 Browser                    │
                  │                                            │
                  │  ┌──────────────────────────────────────┐  │
                  │  │         App.svelte (Svelte 5)        │  │
                  │  │                                      │  │
                  │  │  key ──generateSecretKey──► sk (hex)│  │
                  │  │  sk ──getPublicKey───────► pk        │  │
                  │  │                                      │  │
                  │  │  send: finalizeEvent(tags:[t,chan])  │  │
                  │  │                                    ▼  │  │
                  │  └──────────────────────────────────────┘  │
                  │              │       │                     │
                  │        publish│       │subscribe           │
                  │              ▼       ▼                     │
                  └───────────┬──┴───────┴──┬──────────────────┘
                              │              │  WebSocket (WSS)
                  ┌───────────▼──┐       ┌───▼───────────┐
                  │  nos.lol     │       │  relay.mostr  │
                  │  (relay)     │       │  (relay)       │
                  └──────┬───────┘       └───────┬────────┘
                         │                       │
                         │      kind-1 events    │
                         │    tagged [#t: chan]  │
                         └───────────┬───────────┘
                                     ▼
                 Other clients sharing the same
                 channel id see the messages too
```

Message flow for one chat message:

```text
You type "hello"
   │
   ▼
finalizeEvent(kind:1, tags:[["t","mychan"]], content:"hello", sk)
   │
   ├─► publish ──► nos.lol ─────────┐
   └─► publish ──► relay.mostr.pub ─┴──► relay stores event
   │
   ▲
subscribe({kinds:[1], "#t":["mychan"]})  ◄── your other tab / friends
   │
   └─ onevent ──► dedupe by id ──► render
```

## Tech notes

- Keys and the current channel id live in `localStorage`; clearing them
  generates a fresh identity/channel.
- Only the last 100 events are kept in memory.
- `dist/` and `node_modules/` are gitignored.
