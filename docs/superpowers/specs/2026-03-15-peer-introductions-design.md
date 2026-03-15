# Peer Introductions Design

## Context

Story #45 implemented a broadcast model where peers automatically share who they're connected to. This design replaces that with an introduction model — a more intentional, consent-based approach where a mutual peer actively introduces two people.

## Stories

### Story 1: Roll back "See who your peers are connected to"

**Who** — developers working on the connection system

**Problem** — The CONNECTIONS broadcast and peer connection list were built for a discovery model that's being replaced by introductions. Keeping this code around adds complexity and leaks connection information that users didn't consent to share.

**Behaviors**
- Peers no longer broadcast who they're connected to
- The UI no longer shows a nested list of a peer's connections

### Story 2: Trust a peer to introduce you

**Who** — a person connected to a peer

**Problem** — Before someone can introduce you to others, you need a way to grant them that permission. Without explicit trust, any peer could initiate introductions on your behalf without your consent.

**Behaviors**
- You can grant a peer permission to introduce you to others
- You can revoke that permission
- Your peer can see whether you trust them to make introductions

### Story 3: Introduce two peers

**Who** — a person connected to two people who don't know each other

**Problem** — Two of your peers want to connect, but the only way is to exchange codes out-of-band. You already have a direct connection to both — you should be able to introduce them.

**Behaviors**
- You can introduce two peers who both trust you to make introductions
- Each person is told who wants to introduce them and to whom
- Each person can accept or decline the introduction
- If both accept, they get a direct P2P connection — no codes exchanged
- If one declines, the other is told the introduction was declined
- If neither responds, the introduction eventually expires and both are told it expired
- The introducer is not involved in the connection after it's established

**Notes**
- SDP offer/answer relayed over the introducer's data channels
- Depends on Story 2 (trust)

## Design Decisions

### Why introductions over discovery?

The broadcast model (Story #45) implicitly shares your connection list with all peers. The introduction model is more intentional:
- **Consent** — You opt in to being introduced via trust
- **Agency** — The introducer actively decides who should meet
- **Privacy** — Your connections aren't broadcast to everyone

### Trust model

- Trust is **opt-in per peer** — you explicitly grant a peer permission to introduce you
- Trust is **revocable** — you can withdraw permission at any time
- Trust grants **permission to introduce, not to auto-connect** — you still accept or decline each introduction
- Trust status is **visible to the trusted peer** — so they know whether they can introduce you

### Introduction flow

```
Alice (introducer)          Bob                        Carol
─────────────────────────────────────────────────────────────

Alice selects Bob + Carol
from her peer list
        │
        ├──────────────────► "Alice wants to
        │                    introduce you to Carol"
        │                    [Accept] [Decline]
        │
        ├─────────────────────────────────────────────► "Alice wants to
        │                                               introduce you to Bob"
        │                                               [Accept] [Decline]
        │
        │                    Bob accepts
        │                                               Carol accepts
        │
        │                    SDP offer created
        │◄────────────────── (relayed through Alice)
        ├─────────────────────────────────────────────► SDP offer
        │
        │                                               SDP answer created
        │◄─────────────────────────────────────────────  (relayed through Alice)
        ├──────────────────► SDP answer
        │
        │                    Direct P2P connection established
        │                    Bob ◄──────────────────► Carol
```

### Decline and expiry

- If one party **declines**, the other is notified: "Carol declined the introduction"
- If neither responds within a timeout, both are notified: "Introduction expired"
- The introducer does not need to be notified of the outcome — the introduced parties handle it between themselves (via Alice's relay)

### Rollback scope (Story 1)

Removing Story #45's implementation:
- `broadcastConnections()` function and calls to it
- `CONNECTIONS` message type and `connectionsDecoder`
- `PEER_CONNECTIONS_UPDATED` event and its handler
- `connections` field on `Peer` type
- Nested peer connection list in `Connections.tsx` UI
