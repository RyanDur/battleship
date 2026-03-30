# Iteration 9: Architecture & Reliability

## Goal

Complete the game store extraction so each store has one clear responsibility, then harden reliability by fixing e2e coverage gaps and surfacing silent failures.

## Stories

### #1 — Game store owns all game state

**Who** — a developer working on game features

**Problem** — AI game state (`board`, `boardLoading`, `gameState`), board persistence actions (SAVE_BOARD, LOAD_BOARD, BOARD_SAVED, BOARD_LOADED, BOARD_NOT_FOUND), and AI game actions (START_GAME, GAME_STARTED, FIRE_SHOT, FIRE_RESULT, LOAD_GAME, GAME_STATE, GAME_NOT_FOUND) live in the connection store. A developer adding game behavior has to reason about two stores and understand which one owns what.

**Behaviors:**

- All board and game state lives in the game store
- Connection store has no game-related state or actions
- AI game and P2P game share the same store and dispatch
- Board persistence (save/load to server) is initiated from the game store

**Notes:** The signaling bridge listener currently forwards game actions to the connection store for server persistence. After this story, the game store talks to the server directly (via the port or a signaling interface), removing the bridge.

### #2 — Eliminate circular dispatch between stores

**Who** — a developer maintaining the store architecture

**Problem** — The connection store dispatches to the game store (`dispatchToGame` for peer disconnect, P2P game loaded) and the game store dispatches back (`dispatchToConnection` for save board, start game). App.tsx hand-wires these cross-references. This circular dependency makes each store impossible to test or reason about independently.

**Behaviors:**

- Neither store imports or dispatches to the other
- Peer lifecycle events (connect, disconnect, named) reach the game store through the port's event stream, not through cross-dispatch
- App.tsx wiring is simplified — each store subscribes to the port independently
- Each store can be tested with only a fake port, no fake "other store"

**Notes:** The port (`connectionPort.ts`) already emits PEER_MESSAGE, PEER_CONNECTED, PEER_DISCONNECTED events. The game store can subscribe to these directly instead of receiving forwarded dispatches from the connection store.

### #3 — Fix skipped e2e tests for disconnection and reconnection

**Who** — a player whose opponent disconnects mid-game

**Problem** — Two e2e tests are skipped because WebRTC connections don't behave predictably in Playwright: one for mid-game disconnection status, one for full reconnect via server. These are real user scenarios with no end-to-end coverage.

**Behaviors:**

- When an opponent leaves mid-game, the player sees the game is disconnected
- When a disconnected opponent reconnects via the server, the game resumes where it left off

**Notes:** The product behavior already works — this is a test infrastructure problem. The fix likely involves Playwright's WebRTC handling or test timing, not product code changes. Unit tests cover both scenarios today.

### #4 — Surface transport failures to the user

**Who** — a player whose connection to the signaling server or a peer silently breaks

**Problem** — When the signaling WebSocket errors or closes, the `onerror`/`onclose` handlers are no-ops. When a data channel send fails (channel closed or missing), the message is silently discarded. The player has no idea their actions aren't reaching the other side.

**Behaviors:**

- When the signaling connection is lost, the player sees that the service is unavailable
- When a message to a peer can't be delivered (closed channel), the player sees feedback that the action failed
- The app attempts to recover automatically where possible, but doesn't hide the failure

**Notes:** Heartbeat already detects service loss and shows status. The gap is signaling-specific errors outside the heartbeat path, and data channel send failures.

### #5 — Surface game action failures to the user

**Who** — a player whose game action silently fails

**Problem** — Several game-critical operations fail without feedback: coin flip hash failure auto-loses the flip, clipboard copy fails silently on permission denied, malformed game state from server is dropped, board verification can silently skip. The player doesn't know something went wrong.

**Behaviors:**

- When a coin flip can't be verified, the player sees an error instead of silently losing
- When clipboard copy fails, the player sees that it didn't work
- When game state from the server can't be loaded, the player sees that the game couldn't be restored
- When board verification fails at game over, the result clearly shows it couldn't be verified

## Ordering

Stories 1 and 2 are tightly coupled — the circular dispatch exists because game state is split across stores. They should be worked in order (1 then 2), and may collapse into a single implementation session.

Story 3 is independent of the architecture work and can be worked in parallel or after.

Stories 4 and 5 benefit from the clean architecture (clearer ownership of error handling) but don't strictly depend on it. They should come after 1-2.

## Out of scope

- Transport store extraction (Iteration 10)
- UX polish, animations, mobile responsiveness
- TURN/STUN for NAT traversal
- macOS installer signing (#67)
