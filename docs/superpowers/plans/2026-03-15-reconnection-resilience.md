# Reconnection Resilience — Implementation Plan

**Goal:** Peers connect automatically via signaling server, reconnect after refresh, recover from network disruption, and invite offline peers by email.

**Architecture:** The signaling server evolves from health-only to a peer registry and SDP relay. Cookie-based identity persists across refresh. Server-side database persists relationships across restarts. Client gains a signaling service (same pattern as heartbeat), online/previous peer lists, and ICE restart logic.

**Tech Stack:** Spring Boot (WebSocket + HTTP + JPA), React/TypeScript, WebRTC, Vitest, JUnit 5

**Spec:** `docs/superpowers/specs/2026-03-15-reconnection-resilience-design.md`

**Milestone:** [Iteration 5: Reconnection Resilience](https://github.com/RyanDur/battleship/milestone/4)

---

## Stories

| # | Story | Issue | Depends on |
|---|-------|-------|------------|
| 1 | See who's online | [#51](https://github.com/RyanDur/battleship/issues/51) | — |
| 2 | Connect without codes | [#52](https://github.com/RyanDur/battleship/issues/52) | #51 |
| 3 | Remember previous peers | [#53](https://github.com/RyanDur/battleship/issues/53) | #51 |
| 4 | Reconnect to a previous peer | [#54](https://github.com/RyanDur/battleship/issues/54) | #52, #53 |
| 5 | Survive WiFi drops | [#55](https://github.com/RyanDur/battleship/issues/55) | #52 |
| 6 | Invite an offline peer | [#56](https://github.com/RyanDur/battleship/issues/56) | #53 |
| 7 | Share your email with peers | [#57](https://github.com/RyanDur/battleship/issues/57) | #51 |
| 8 | Forget a peer | [#58](https://github.com/RyanDur/battleship/issues/58) | #53 |

Stories 5, 6, 7, and 8 are independent of each other. They can be implemented in any order after their prerequisites.

## Dependency Graph

```
#51 See who's online
 ├─► #52 Connect without codes
 │    ├─► #54 Reconnect to a previous peer (also needs #53)
 │    └─► #55 Survive WiFi drops
 ├─► #53 Remember previous peers
 │    ├─► #54 Reconnect to a previous peer (also needs #52)
 │    ├─► #56 Invite an offline peer
 │    └─► #58 Forget a peer
 └─► #57 Share your email with peers
```
