# Iteration 9: Architecture & Reliability

## Goal

Achieve the 3-store architecture (Connections, Transport, Game) where each store has one clear responsibility, then harden reliability by fixing e2e coverage gaps and surfacing silent failures.

## Stories

### #1 — Game store owns all game state

**Who** — a developer working on game features

**Problem** — AI game state (`board`, `boardLoading`, `gameState`), board persistence actions (SAVE_BOARD, LOAD_BOARD, BOARD_SAVED, BOARD_LOADED, BOARD_NOT_FOUND), and AI game actions (START_GAME, GAME_STARTED, FIRE_SHOT, FIRE_RESULT, LOAD_GAME, GAME_STATE, GAME_NOT_FOUND) live in the connection store. A developer adding game behavior has to reason about two stores and understand which one owns what.

**Behaviors:**

- A developer can add or modify game features by working in the game module alone
- Game tests don't require configuring or faking the connection store
- AI and P2P games behave identically to how they do today (no user-facing change)

**Notes:** AI game state (`board`, `boardLoading`, `gameState`), board persistence actions, and AI game actions currently live in the connection store reducer. After this story, they move to the game store. The signaling bridge listener currently forwards game actions to the connection store for server persistence — after this, the game store talks to the server directly via the port or a signaling interface.

### #2 — Eliminate circular dispatch between stores

**Who** — a developer maintaining the store architecture

**Problem** — The connection store dispatches to the game store (`dispatchToGame` for peer disconnect, P2P game loaded) and the game store dispatches back (`dispatchToConnection` for save board, start game). App.tsx hand-wires these cross-references. This circular dependency makes each store impossible to test or reason about independently.

**Behaviors:**

- Each store can be instantiated and tested with only a fake port, no fake "other store"
- Adding a new store does not require modifying existing stores
- All existing game and connection behavior works identically (no user-facing change)

**Notes:** Currently the connection store dispatches to the game store (`dispatchToGame`) and vice versa (`dispatchToConnection`), with App.tsx hand-wiring cross-references. The port already emits PEER_MESSAGE, PEER_CONNECTED, PEER_DISCONNECTED events — the game store can subscribe to these directly. The port-subscription pattern established here is the foundation for the transport store extraction in Story 6.

### #3 — Fix skipped e2e tests for disconnection and reconnection

**Who** — a player whose opponent disconnects mid-game

**Problem** — One e2e test is skipped (mid-game disconnection status) and one is unwritten (full reconnect via server). These are real user scenarios with no end-to-end coverage.

**Behaviors:**

- When an opponent leaves mid-game, the player sees the game is disconnected
- When a disconnected opponent reconnects via the server, the game resumes where it left off

**Notes:** The product behavior already works — the gap is e2e test coverage. The skipped test (disconnection status) hangs in Playwright due to WebRTC timing. The reconnect test exists with a full body but does not pass — the server-mediated WebRTC flow fails to complete in Playwright. Unit tests cover both scenarios today.

### #4 — Surface transport failures to the user

**Who** — a player whose connection to the signaling server or a peer silently breaks

**Problem** — When the signaling WebSocket errors or closes, the `onerror`/`onclose` handlers are no-ops. When a data channel send fails (channel closed or missing), the message is silently discarded. The player has no idea their actions aren't reaching the other side.

**Behaviors:**

- When the signaling connection is lost, the player sees that the service is unavailable
- When a message to a peer can't be delivered (closed channel), the player sees feedback that the action failed
- Existing recovery mechanisms (heartbeat reconnection) continue to work; this story surfaces failures, not new auto-recovery

**Notes:** Heartbeat already detects service loss and shows status. The gap is signaling-specific errors outside the heartbeat path, and data channel send failures.

### #5 — Surface game action failures to the user

**Who** — a player whose game action silently fails

**Problem** — Several game-critical operations fail without feedback: coin flip hash failure auto-loses the flip, clipboard copy fails silently on permission denied, malformed game state from server is dropped, board verification can silently skip. The player doesn't know something went wrong.

**Behaviors:**

- When a coin flip can't be verified, the player sees a notification that the flip failed and can retry, rather than silently losing
- When clipboard copy fails, the player sees that it didn't work
- When game state from the server can't be loaded, the player sees that the game couldn't be restored
- When board verification fails at game over, the result clearly shows it couldn't be verified

### #6 — Extract transport into its own module

**Who** — a developer adding a new connection method or debugging a connectivity issue

**Problem** — The connection store owns both peer identity (who is connected, trust, introductions) and transport plumbing (WebRTC lifecycle, signaling WebSocket, ICE restart, SDP exchange, data channels). A developer debugging an ICE failure has to wade through trust logic; a developer adding introduction rules has to understand RTCPeerConnection lifecycle. These are independent concerns tangled in one module.

**Behaviors:**

- A developer can work on transport (connectivity, ICE, data channels) without touching connection domain logic
- A developer can work on connection domain logic (trust, introductions, messages) without touching WebRTC code
- Transport can be tested with fake RTCPeerConnections and no peer registry
- Connections can be tested with a fake transport layer and no real WebRTC
- All existing connectivity behavior works identically (no user-facing change)

**Notes:** The connection handler (`connectionHandler.ts`) is already transport-shaped — it manages RTCPeerConnection lifecycle, data channels, and ICE without knowing what messages mean. The signaling WebSocket (`signaling.ts`) is pure transport. The encoding/decoding middleware (`encodingMiddleware`, `codecMiddleware`) handles connection code crypto. After this story, these move to a transport module. The connection store keeps peer registry, trust, introductions, messages, online/previous peers, and flow state. The 11 items that straddle both (server-mediated SDP relay, introduction channel setup) live at the boundary — transport executes the plumbing, connections initiates the request.

## Ordering

Stories 1 and 2 are tightly coupled — the circular dispatch exists because game state is split across stores. They should be worked in order (1 then 2), and may collapse into a single implementation session.

Story 6 depends on Story 2 (clean port-based architecture) and should come after.

Story 3 is independent of the architecture work and can be worked in parallel or after.

Stories 4 and 5 benefit from the clean architecture (clearer ownership of error handling) and should come after 1-2. Story 4 (transport failures) specifically benefits from Story 6 (transport module owns error surfacing).

## Out of scope

- UX polish, animations, mobile responsiveness
- TURN/STUN for NAT traversal
- macOS installer signing (#67)
