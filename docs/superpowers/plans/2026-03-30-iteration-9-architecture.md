# Iteration 9: Architecture & Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the game store extraction so each store has one clear responsibility, then harden reliability by fixing e2e coverage gaps and surfacing silent failures.

**Architecture:** Two-phase refactor. Phase 1 (Story 1) removes game state from the connection store — the game store already handles all these actions via the port's `SERVER_MESSAGE` events, so the connection store's game handling is redundant. Phase 2 (Story 2) eliminates circular dispatch by wiring `port.sendToServer` to the signaling WebSocket and moving server communication from `dispatchToConnection` to the port. Stories 3-5 are independent reliability work.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Playwright, custom Redux-like stores

**Spec:** `docs/superpowers/specs/2026-03-30-iteration-9-design.md`

---

## File Map

### Story 1: Game store owns all game state

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/connections/connections.ts` | Remove `board`, `boardLoading`, `gameState` from state; remove game reducer cases |
| Modify | `src/connections/connectionActions.ts` | Remove game response action creators; remove game type imports |
| Modify | `src/connections/connectionStore.ts` | Signaling listener emits-only for game responses; remove `dispatchToGame` from `SignalingListenerConfig`; remove game imports |
| Modify | `src/connections/connectionStore.signaling.server.test.ts` | Move game response tests to verify port emission; update P2P_GAME_LOADED test |
| Modify | `src/connections/signaling.ts` | Remove game type imports from `SignalingEvent` (use generic `data` for game events) |

### Story 2: Eliminate circular dispatch

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/connections/connectionStore.ts` | Add `portEmit` for PEER_DISCONNECTED; expose signaling handle via `onReady`; remove `dispatchToGame` from `HandlerListenerConfig`; remove game command types from signaling action dispatcher; remove `loadBoard`/`loadGame` dispatches from REGISTERED |
| Modify | `src/connections/connectionActions.ts` | Remove all game command action creators and types |
| Modify | `src/connections/connections.ts` | Remove all game action types from `ConnectionsAction` union |
| Modify | `src/game/gameStore.ts` | Replace `createSignalingBridgeListenerFactory` with `createServerBridgeListenerFactory`; update `createSaveOnShotListenerFactory` and `createGameCommandListenerFactory` to use `port.sendToServer`; remove `dispatchToConnection` from config |
| Modify | `src/game/gameActions.ts` | Add `saveP2pGame` action (game-only, carries full game state for serialization) |
| Modify | `src/App.tsx` | Wire `port.sendToServer` via late-binding to signaling handle; remove `dispatchToConnection`; simplify store wiring |
| Modify | `src/connections/connectionStore.handler.test.ts` | Remove `dispatchToGame` from handler config; ensure port delivers all events |
| Modify | `src/connections/connectionStore.signaling.server.test.ts` | Move SAVE_P2P_GAME test to game store tests; remove game command tests |
| Modify | `src/game/gameStore.test.ts` | Add tests for server bridge listener; add test for PEER_CONNECTED triggers game load |

All file paths below are relative to `applications/web-client/`.

---

## Story 1: Game store owns all game state

### Task 1: Remove game state from connection store

The game store already has its own reducer for `board`, `boardLoading`, and `aiGameState` in `src/game/game.ts:170-186`. The connection store's copies in `src/connections/connections.ts:43-45` and `269-284` are redundant — both stores receive the same server messages (the signaling listener emits to the port, and the game message handler processes them).

**Files:**
- Modify: `src/connections/connections.ts:34-46` (state type), `269-284` (reducer cases)

- [ ] **Step 1: Remove game fields from `ConnectionsState`**

In `connections.ts`, remove `board`, `boardLoading`, and `gameState` from the `ConnectionsState` type and from `initialState`. Remove the `Board` and game type imports that become unused.

- [ ] **Step 2: Remove game reducer cases**

In the `coreConnectionsReducer` dispatch map (lines 200-285), remove all game-related entries: `LOAD_BOARD`, `BOARD_LOADED`, `BOARD_NOT_FOUND`, `SAVE_BOARD`, `GAME_STARTED`, `GAME_STATE`, `FIRE_RESULT`, `GAME_NOT_FOUND`.

- [ ] **Step 3: Run tests, expect type errors**

Run: `cd applications/web-client && npx tsc --noEmit`

Expected: Type errors in `connectionStore.ts` (signaling listener dispatches removed action creators) and `connectionStore.signaling.server.test.ts`. These are addressed in Tasks 2-4.

- [ ] **Step 4: Commit**

```
feat: remove game state from connection store reducer
```

---

### Task 2: Remove game response actions from ConnectionsAction

After removing game state from the reducer, the game response action types (BOARD_SAVED, BOARD_LOADED, etc.) no longer mutate connection state. Remove them from the union and their action creators. Keep the command types (SAVE_BOARD, LOAD_BOARD, etc.) — they still trigger server communication via the signaling action dispatcher.

**Files:**
- Modify: `src/connections/connections.ts:48-120` (action union)
- Modify: `src/connections/connectionActions.ts:74-87` (action creators)

- [ ] **Step 1: Remove game response types from `ConnectionsAction`**

In `connections.ts`, remove these from the union:
- `BOARD_SAVED`
- `BOARD_LOADED`
- `BOARD_NOT_FOUND` (only the response — keep it if LOAD_BOARD needs it; actually it doesn't exist as a command, remove it)
- `GAME_STARTED`
- `FIRE_RESULT`
- `GAME_STATE`
- `GAME_NOT_FOUND`

Keep: `SAVE_BOARD`, `LOAD_BOARD`, `START_GAME`, `FIRE_SHOT`, `LOAD_GAME`, `SAVE_P2P_GAME`, `LOAD_P2P_GAME`.

- [ ] **Step 2: Remove game response action creators from `connectionActions.ts`**

Remove: `boardSaved`, `boardLoaded`, `boardNotFound`, `gameStarted`, `fireResult`, `gameStateReceived`, `gameNotFound`. Remove unused imports (`AiGameState`, `Shot`, `AiGamePhase`).

Keep: `saveBoard`, `loadBoard`, `startGame`, `fireShot`, `loadGame`, `saveP2pGame`, `loadP2pGame` (still used by game store's `dispatchToConnection`).

- [ ] **Step 3: Commit**

```
feat: remove game response actions from ConnectionsAction
```

---

### Task 3: Signaling listener emits-only for game responses

The signaling listener (`connectionStore.ts:228-332`) currently dispatches game response events to the connection store AND emits them to the port. Since the game store already processes these via the port (through `gameMessageHandler`), remove the connection store dispatches and keep only the port emissions.

**Files:**
- Modify: `src/connections/connectionStore.ts:228-300` (signaling listener)

- [ ] **Step 1: Remove dispatch calls for game responses**

In `createSignalingListener`'s `dispatchSignalingEvent` map, for each game response event, remove the `dispatch(...)` call and keep only the `portEmit?.(...)` call:

- `BOARD_SAVED`: remove `dispatch(boardSaved())`, keep `portEmit`
- `BOARD_LOADED`: remove `dispatch(boardLoaded(event.board))`, keep `portEmit`
- `BOARD_NOT_FOUND`: remove `dispatch(boardNotFound())`, keep `portEmit`
- `GAME_STARTED`: remove `dispatch(gameStarted(event.gameState))`, keep `portEmit`
- `FIRE_RESULT`: remove `dispatch(fireResult(...))`, keep `portEmit`
- `GAME_STATE`: remove `dispatch(gameStateReceived(event.gameState))`, keep `portEmit`
- `GAME_NOT_FOUND`: remove `dispatch(gameNotFound())`, keep `portEmit`
- `P2P_GAME_LOADED`: remove the entire `tryCatch` block that calls `dispatchToGame?.(gameP2pGameLoaded(game))` (lines 278-299), keep only the `portEmit` (line 277). The game message handler at `gameMessageHandler.ts:200-223` already decodes and dispatches this.

- [ ] **Step 2: Remove `dispatchToGame` from `SignalingListenerConfig`**

Remove the `dispatchToGame` property from the `SignalingListenerConfig` type (line 225) and the destructured parameter in `createSignalingListener` (line 228). Remove the `GameAction` import and `gameP2pGameLoaded` import. Remove the `P2pGame` type import, the `p2pGameStateDecoder`, and `Decoder`/`tryCatch` imports if they become unused.

- [ ] **Step 3: Remove unused imports from `connectionStore.ts`**

Remove: `gamePeerDisconnected`, `gameP2pGameLoaded` from game action imports (line 9). Remove `P2pGame` import (line 4). Remove `GameAction` import (line 8). Remove game response action creator imports from connectionActions (line 10): `boardSaved`, `boardLoaded`, `boardNotFound`, `gameStarted`, `fireResult`, `gameStateReceived`, `gameNotFound`, `loadBoard`, `loadGame`.

Keep: `loadP2pGame` (still used in `makeHandlerEmit` line 99 for PEER_CONNECTED game load).

Note: `dispatchToGame` remains in `HandlerListenerConfig` (line 86) for PEER_DISCONNECTED — this is removed in Story 2.

- [ ] **Step 4: Run tests**

Run: `cd applications/web-client && npm test`

The signaling server test will fail because it checks connection store state for game-related messages and uses `dispatchToGame` in signaling listener config. Fix in Task 4.

- [ ] **Step 5: Commit**

```
feat: signaling listener emits-only for game server responses
```

---

### Task 4: Update signaling server tests

`connectionStore.signaling.server.test.ts` tests game-related server messages by checking connection store state and using `dispatchToGame`. After Story 1, game responses are only emitted to the port. Update tests to verify port emission, and verify the game store receives them via the game message handler.

**Files:**
- Modify: `src/connections/connectionStore.signaling.server.test.ts`

- [ ] **Step 1: Read the existing test file to understand the setup**

Read `src/connections/connectionStore.signaling.server.test.ts` completely. The test setup creates both stores with `dispatchToGame` wired. Game-related tests are at approximately lines 252-360.

- [ ] **Step 2: Remove `dispatchToGame` from signaling listener config**

The `createSignalingListener` config no longer accepts `dispatchToGame`. Remove it from the test setup. The game store receives game events via the port.

- [ ] **Step 3: Update P2P_GAME_LOADED tests**

These tests currently verify `selectP2pGame(gameStore.getState())`. After the change, P2P_GAME_LOADED is emitted to the port as a `SERVER_MESSAGE`. If the game store is created with the port and has the game message handler wired, it should still receive and process the event. Ensure the test creates the game store with the port so the game message handler processes `SERVER_MESSAGE` events.

If the test setup doesn't already wire the port to the game store, update it: the game store needs the port from `createConnectionPort`, and the signaling listener needs the `portEmit` from the same port handle.

- [ ] **Step 4: Update SAVE_P2P_GAME test**

The SAVE_P2P_GAME test verifies that dispatching `saveP2pGame(game)` to the connection store sends the right message to the server with translated peer IDs. This test should still pass since SAVE_P2P_GAME remains a ConnectionsAction and the signaling action dispatcher still handles it.

- [ ] **Step 5: Remove connection store game state assertions**

Any assertions that check connection store state for `board`, `boardLoading`, or `gameState` need to be updated. These fields no longer exist on `ConnectionsState`. If a test verifies the server message was received correctly, assert on the game store's state instead (via `selectBoard`, `selectAiGameState` from game selectors).

- [ ] **Step 6: Run all tests**

Run: `cd applications/web-client && npm test`

All tests should pass. If game store tests also break, check that the game message handler's SERVER_MESSAGE processing covers all the cases the signaling listener used to handle.

- [ ] **Step 7: Commit**

```
feat: update signaling server tests for game store ownership
```

---

## Story 2: Eliminate circular dispatch

After Story 1, the remaining cross-dispatch points are:

| Direction | Where | What |
|-----------|-------|------|
| connection → game | `createHandlerListener` line 151 | `dispatchToGame(gamePeerDisconnected(peerId))` on PEER_DISCONNECTED |
| game → connection | `createSignalingBridgeListenerFactory` | `dispatchToConnection(connectionSaveBoard(...))` on SAVE_BOARD, `dispatchToConnection(connectionStartGame())` on START_GAME |
| game → connection | `createSaveOnShotListenerFactory` | `dispatchToConnection(saveP2pGame(game))` on shot/game-over events |
| game → connection | `createGameCommandListenerFactory` | `dispatchToConnection(loadP2pGame(signalingId))` on CHALLENGE_PEER, ACCEPT_CHALLENGE |
| game reads connection | `App.tsx` lines 80-82 | `getPeerToSignaling`, `translatePeerId` closures |
| connection sends game cmd | `makeHandlerEmit` line 99 | `dispatch(loadP2pGame(signalingPeerId))` on PEER_CONNECTED |

### Task 5: Emit PEER_DISCONNECTED to port

Currently `makeHandlerEmit` emits PEER_CONNECTED and PEER_NAMED to the port but NOT PEER_DISCONNECTED (line 106). The game store receives PEER_DISCONNECTED only via `dispatchToGame`. Before removing `dispatchToGame`, we must ensure the port delivers this event.

**Files:**
- Modify: `src/connections/connectionStore.ts:106`

- [ ] **Step 1: Add portEmit for PEER_DISCONNECTED**

In `makeHandlerEmit`, update the `PEER_DISCONNECTED` handler from:
```ts
PEER_DISCONNECTED: (event) => dispatch(peerDisconnected(event.peerId)),
```
to:
```ts
PEER_DISCONNECTED: (event) => {
  dispatch(peerDisconnected(event.peerId));
  portEmit?.({type: 'PEER_DISCONNECTED', peerId: event.peerId});
},
```

- [ ] **Step 2: Run tests**

Run: `cd applications/web-client && npm test`

All tests should pass — this is additive. The game store's `gameMessageHandler` already handles `PEER_DISCONNECTED` from the port (line 173-176 of `gameMessageHandler.ts`).

- [ ] **Step 3: Commit**

```
feat: emit PEER_DISCONNECTED to port for game store
```

---

### Task 6: Expose signaling handle for port.sendToServer

To replace `dispatchToConnection` with `port.sendToServer`, the port needs access to the signaling WebSocket's `send` method. The signaling handle is created inside `createSignalingListener` when START_SIGNALING fires. Expose it via a callback.

**Files:**
- Modify: `src/connections/connectionStore.ts:220-228` (SignalingListenerConfig + createSignalingListener)

- [ ] **Step 1: Add `onReady` to `SignalingListenerConfig`**

Add an `onReady` callback to `SignalingListenerConfig`:
```ts
type SignalingListenerConfig = {
  config: SignalingConfig
  portEmit?: (event: ConnectionEvent) => void
  onReady?: (handle: {send: (message: unknown) => void}) => void
}
```

- [ ] **Step 2: Call `onReady` when signaling starts**

In the `START_SIGNALING` handler of `dispatchSignalingAction`, after `handle = startSignaling(...)`, call `onReady?.({send: handle.send})`:

```ts
START_SIGNALING: () => {
  handle = startSignaling(config, dispatchSignalingEvent);
  onReady?.({send: (msg) => handle?.send(msg as Record<string, unknown>)});
},
```

Use a closure over `handle` rather than capturing the direct reference, so `send` works even if the handle is recreated.

- [ ] **Step 3: Run tests**

Run: `cd applications/web-client && npm test`

All tests should pass — `onReady` is optional.

- [ ] **Step 4: Commit**

```
feat: expose signaling handle via onReady callback
```

---

### Task 7: Wire port.sendToServer in App.tsx

Connect the port's `sendToServer` to the signaling handle's `send` via late-binding.

**Files:**
- Modify: `src/App.tsx:58-84`

- [ ] **Step 1: Wire sendToServer**

In `App.tsx`'s `useMemo`, replace `sendToServer: () => {}` with a late-bound closure:

```ts
let serverSend: ((message: unknown) => void) | null = null;

const {port, emit: portEmit} = createConnectionPort({
  sendToPeer: (peerId, message) => connectionStore.dispatch(sendToPeer(peerId, message as Record<string, unknown>)),
  sendToServer: (message) => serverSend?.(message),
});
```

And pass `onReady` to the signaling listener:

```ts
createSignalingListener({
  config: {createWebSocket: (url) => new WebSocket(url), sessionUrl: `${config.serviceUrl}/session`, url: signalingUrl, name: 'Player'},
  portEmit,
  onReady: (handle) => { serverSend = handle.send; },
}),
```

- [ ] **Step 2: Run tests**

Run: `cd applications/web-client && npm test`

All tests should pass — `sendToServer` was previously a no-op, now it routes to signaling. No code calls it yet.

- [ ] **Step 3: Commit**

```
feat: wire port.sendToServer to signaling handle
```

---

### Task 8: Create server bridge listener in game store

Replace `createSignalingBridgeListenerFactory` (which uses `dispatchToConnection`) with `createServerBridgeListenerFactory` (which uses `port.sendToServer`). Also move the `loadP2pGame` call from the connection handler's PEER_CONNECTED to a game store listener.

**Files:**
- Modify: `src/game/gameStore.ts:74-78` (replace signaling bridge), `108-161` (update game command listener), `80-90` (update save-on-shot listener)
- Modify: `src/game/gameStore.test.ts` (add server bridge tests)

- [ ] **Step 1: Write failing test for server bridge listener**

In `gameStore.test.ts`, add a test that verifies `SAVE_BOARD` triggers a `sendToServer` call with `{type: 'SAVE_BOARD', board: <stringified>}`:

```ts
it('SAVE_BOARD sends board to server', () => {
  const sent: unknown[] = [];
  const {port} = createConnectionPort({sendToPeer: () => {}, sendToServer: (msg) => sent.push(msg)});
  const store = createGameStore({port, listenerFactories: [createServerBridgeListenerFactory]});
  const board = {placed: [{ship: {name: 'Destroyer', size: 2}, position: {row: 0, col: 0}, orientation: 'horizontal'}]};
  store.dispatch(saveBoard(board));
  expect(sent).toEqual([{type: 'SAVE_BOARD', board: JSON.stringify(board)}]);
});
```

Add similar tests for: `START_GAME` → `{type: 'START_GAME'}`, `FIRE_SHOT` → `{type: 'FIRE', row, col}`, `LOAD_BOARD` → `{type: 'LOAD_BOARD'}`, `LOAD_GAME` → `{type: 'LOAD_GAME'}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd applications/web-client && npm run test:watch -- src/game/gameStore.test.ts`

Expected: FAIL — `createServerBridgeListenerFactory` doesn't exist yet.

- [ ] **Step 3: Implement `createServerBridgeListenerFactory`**

In `gameStore.ts`, replace `createSignalingBridgeListenerFactory` with:

```ts
export const createServerBridgeListenerFactory: GameListenerFactory = ({port}) =>
  (action) => {
    if (action.type === 'SAVE_BOARD') port?.sendToServer({type: 'SAVE_BOARD', board: JSON.stringify(action.board)});
    if (action.type === 'START_GAME') port?.sendToServer({type: 'START_GAME'});
    if (action.type === 'FIRE_SHOT') port?.sendToServer({type: 'FIRE', row: action.row, col: action.col});
    if (action.type === 'LOAD_BOARD') port?.sendToServer({type: 'LOAD_BOARD'});
    if (action.type === 'LOAD_GAME') port?.sendToServer({type: 'LOAD_GAME'});
  };
```

Remove the old `createSignalingBridgeListenerFactory` and its import of `connectionSaveBoard`/`connectionStartGame` from `connectionActions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd applications/web-client && npm run test:watch -- src/game/gameStore.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```
feat: create server bridge listener for game store
```

---

### Task 9: Move save-on-shot and game commands to port.sendToServer

Replace `dispatchToConnection` usage in `createSaveOnShotListenerFactory` and `createGameCommandListenerFactory` with `port.sendToServer`.

**Files:**
- Modify: `src/game/gameStore.ts:80-90` (save-on-shot), `108-161` (game commands)
- Modify: `src/game/gameStore.test.ts` (add server send tests)

- [ ] **Step 1: Write failing test for save-on-shot server send**

Test that after `P2P_FIRE_RESULT`, the game state is sent to the server via `port.sendToServer` with `{type: 'SAVE_P2P_GAME', ...}`:

```ts
it('P2P_FIRE_RESULT saves game to server', () => {
  const sent: unknown[] = [];
  const {port} = createConnectionPort({sendToPeer: () => {}, sendToServer: (msg) => sent.push(msg)});
  const store = createGameStore({
    port,
    listenerFactories: [createSaveOnShotListenerFactory],
    getPeerToSignaling: () => ({'peer-1': 'sig-1'}),
  });
  // Set up a game in my-turn phase, then fire...
  // (use existing test patterns from the file to set up P2P game state)
  // Then verify sent includes {type: 'SAVE_P2P_GAME', opponentId: 'sig-1', gameState: ...}
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `createSaveOnShotListenerFactory` still uses `dispatchToConnection`.

- [ ] **Step 3: Update `createSaveOnShotListenerFactory`**

Replace `dispatchToConnection` with `port.sendToServer`:

```ts
export const createSaveOnShotListenerFactory: GameListenerFactory = ({getState, port, getPeerToSignaling}) =>
  (action) => {
    if (
      action.type !== 'P2P_FIRE_RESULT' &&
      action.type !== 'OPPONENT_FIRED' &&
      action.type !== 'P2P_GAME_OVER' &&
      action.type !== 'TURN_ORDER_DECIDED'
    ) return;
    const game = selectP2pGame(getState());
    if (!game) return;
    const signalingOpponentId = getPeerToSignaling?.()[game.opponentId] ?? game.opponentId;
    port?.sendToServer({
      type: 'SAVE_P2P_GAME',
      opponentId: signalingOpponentId,
      gameState: JSON.stringify({...game, opponentId: signalingOpponentId}),
    });
  };
```

- [ ] **Step 4: Update `createGameCommandListenerFactory`**

Replace `loadSavedGame` to use `port.sendToServer` instead of `dispatchToConnection`:

```ts
const loadSavedGame = (peerId: string) => {
  const signalingId = getPeerToSignaling?.()[peerId];
  if (signalingId) port?.sendToServer({type: 'LOAD_P2P_GAME', opponentId: signalingId});
};
```

Add `PEER_CONNECTED` to the handlers to replace the connection store's `loadP2pGame` on connect:

```ts
PEER_CONNECTED: (action) => {
  loadSavedGame(action.peerId);
},
```

Remove the `dispatchToConnection` parameter usage. Remove imports of `saveP2pGame` and `loadP2pGame` from `connectionActions`.

- [ ] **Step 5: Run tests**

Run: `cd applications/web-client && npm test`

- [ ] **Step 6: Commit**

```
feat: game store sends to server via port, not dispatchToConnection
```

---

### Task 10: Remove dispatchToGame from handler listener

The port now delivers PEER_DISCONNECTED (Task 5), so `dispatchToGame` in the handler listener is redundant.

**Files:**
- Modify: `src/connections/connectionStore.ts:82-87` (HandlerListenerConfig), `125-157` (createHandlerListener)

- [ ] **Step 1: Remove dispatchToGame from handler listener**

Remove `dispatchToGame` from `HandlerListenerConfig` type. In `createHandlerListener`'s PEER_DISCONNECTED handler (line 149-152), remove `dispatchToGame?.(gamePeerDisconnected(action.peerId))`:

```ts
PEER_DISCONNECTED: (action) => {
  handler.cleanup(action.peerId);
},
```

Remove the `GameAction` import and `gamePeerDisconnected` import from `connectionStore.ts`.

- [ ] **Step 2: Run tests**

Run: `cd applications/web-client && npm test`

Tests that relied on `dispatchToGame` should now work via the port path instead. If handler integration tests fail, update their setup to remove `dispatchToGame` from the handler listener config.

- [ ] **Step 3: Commit**

```
feat: remove dispatchToGame — port delivers all peer events
```

---

### Task 11: Remove dispatchToConnection from game store

All game store listener factories now use `port.sendToServer` instead of `dispatchToConnection`. Remove it from the config.

**Files:**
- Modify: `src/game/gameStore.ts:36,43-49,178-227` (config type, store factory)
- Modify: `src/App.tsx:77-84` (remove dispatchToConnection from game store creation)

- [ ] **Step 1: Remove dispatchToConnection from GameStoreConfig and ListenerFactoryDeps**

In `gameStore.ts`, remove `dispatchToConnection` from `ListenerFactoryDeps` (line 36) and `GameStoreConfig` (line 47). Remove the `ConnectionsAction` import (line 4).

- [ ] **Step 2: Remove dispatchToConnection from App.tsx**

In `App.tsx`, remove `dispatchToConnection: (action) => connectionStore.dispatch(action)` from the `createGameStore` config (line 81). Remove the game store's import of `connectionActions` if no longer needed.

- [ ] **Step 3: Run tests**

Run: `cd applications/web-client && npm test`

- [ ] **Step 4: Commit**

```
feat: remove dispatchToConnection from game store
```

---

### Task 12: Remove game command types from ConnectionsAction

With `dispatchToConnection` gone, no one dispatches game command actions (SAVE_BOARD, LOAD_BOARD, START_GAME, etc.) to the connection store. Remove them.

**Files:**
- Modify: `src/connections/connections.ts:106-119` (action union)
- Modify: `src/connections/connectionActions.ts:74-91` (action creators)
- Modify: `src/connections/connectionStore.ts:303-328` (signaling action dispatcher)

- [ ] **Step 1: Remove game command types from ConnectionsAction**

In `connections.ts`, remove: `SAVE_BOARD`, `LOAD_BOARD`, `START_GAME`, `FIRE_SHOT`, `LOAD_GAME`, `SAVE_P2P_GAME`, `LOAD_P2P_GAME`.

- [ ] **Step 2: Remove game command action creators**

In `connectionActions.ts`, remove: `saveBoard`, `loadBoard`, `startGame`, `fireShot`, `loadGame`, `saveP2pGame`, `loadP2pGame`. Remove unused game type imports.

- [ ] **Step 3: Remove game commands from signaling action dispatcher**

In `connectionStore.ts`'s `dispatchSignalingAction` map, remove: `SAVE_BOARD`, `LOAD_BOARD`, `START_GAME`, `FIRE_SHOT`, `LOAD_GAME`, `SAVE_P2P_GAME`, `LOAD_P2P_GAME`.

- [ ] **Step 4: Remove `loadBoard`/`loadGame` dispatches from REGISTERED handler**

In the signaling listener's `REGISTERED` handler, remove `dispatch(loadBoard())` and `dispatch(loadGame())`. The game store handles REGISTERED from the port and sends LOAD_BOARD/LOAD_GAME to the server via the server bridge listener.

Keep the `portEmit` call.

- [ ] **Step 5: Remove loadP2pGame from makeHandlerEmit**

In `makeHandlerEmit`'s `PEER_CONNECTED` handler (line 97-99), remove `dispatch(loadP2pGame(signalingPeerId))`. The game store's `createGameCommandListenerFactory` now handles PEER_CONNECTED and loads the saved game via `port.sendToServer`.

- [ ] **Step 6: Clean up remaining game imports from connectionStore.ts**

Remove any remaining game-related imports: `loadP2pGame`, `loadBoard`, `loadGame`, `P2pGame`, `GameAction`, game action imports. The connection store should have zero imports from `src/game/`.

- [ ] **Step 7: Clean up signaling.ts**

Remove game-related types from `SignalingEvent` if they are now only forwarded as raw data via `portEmit`. The signaling layer can emit these as generic `SERVER_MESSAGE` data rather than typed game events. However, this is optional — the types serve as documentation. Evaluate whether removing them simplifies or complicates.

- [ ] **Step 8: Run all tests**

Run: `cd applications/web-client && npm test`

Fix any remaining compilation or test failures.

- [ ] **Step 9: Commit**

```
feat: remove all game actions from connection store
```

---

### Task 13: Update integration tests

The handler integration tests (`connectionStore.handler.test.ts`) and signaling server tests wire both stores together with `dispatchToGame` and `dispatchToConnection`. Update them to use the port-only architecture.

**Files:**
- Modify: `src/connections/connectionStore.handler.test.ts` (remove cross-dispatch wiring)
- Modify: `src/connections/connectionStore.signaling.server.test.ts` (remove game command tests)
- Modify: `src/game/gameStore.test.ts` (add any tests that moved from connection store tests)

- [ ] **Step 1: Update handler test `makePair` setup**

In `connectionStore.handler.test.ts`, the `makePair()` helper creates game stores with `dispatchToConnection` and handler listeners with `dispatchToGame`. Update:

- Remove `dispatchToConnection` from `createGameStore({...})`
- Remove `dispatchToGame` from `createHandlerListener({...})`
- Ensure `port.sendToServer` is wired (can be a spy/collector for assertions, or a no-op if server persistence isn't tested in handler tests)
- Ensure `getPeerToSignaling` is still provided to game stores that need peer ID translation

- [ ] **Step 2: Verify game scenarios still pass**

The P2P game scenarios (challenge, fire, reconnect, board reveal) should work via the port: handler emits events → port → game message handler → game store. No cross-dispatch needed.

Run: `cd applications/web-client && npm run test:watch -- src/connections/connectionStore.handler.test.ts`

- [ ] **Step 3: Update signaling server tests**

Remove game command tests that dispatch SAVE_P2P_GAME to the connection store — these now go through the game store's save-on-shot listener via `port.sendToServer`. Move the peer ID translation test to `gameStore.test.ts`.

- [ ] **Step 4: Run all tests**

Run: `cd applications/web-client && npm test`

All tests should pass. Run: `cd applications/web-client && npm run lint`

- [ ] **Step 5: Commit**

```
feat: update integration tests for port-based architecture
```

---

### Task 14: Simplify App.tsx wiring

Clean up App.tsx now that cross-dispatch is gone.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove cross-dispatch artifacts**

- Remove `dispatchToGame` from handler listener config
- Remove `dispatchToConnection` from game store config (if not already done)
- Replace `createSignalingBridgeListenerFactory` with `createServerBridgeListenerFactory` in the game store's listener factories list
- Remove unused imports from connectionActions if any remain
- Remove the `let gs` late-binding pattern if `dispatchToGame` was the only reason for it

The final wiring should look like:
```
port ← createConnectionPort({sendToPeer: ..., sendToServer: ...})
connectionStore ← createConnectionStore(middleware, [handlerListener, signalingListener])
gameStore ← createGameStore({port, listenerFactories: [...], translatePeerId: ..., getPeerToSignaling: ...})
```

No store references the other. `getPeerToSignaling` and `translatePeerId` are read-only closures over connection store state — acceptable cross-reads, not circular dispatch.

- [ ] **Step 2: Run full test suite**

Run: `cd applications/web-client && npm test`

- [ ] **Step 3: Run e2e tests**

Build and run e2e to verify production wiring:
```bash
./gradlew :applications:signaling-server:bootJar
cd applications/web-client && npm run e2e
```

- [ ] **Step 4: Commit**

```
feat: simplify App.tsx — no cross-dispatch between stores
```

---

## Story 3: Fix skipped e2e tests

### Task 15: Fix disconnection mid-game e2e test

The test at `e2e/p2p-game.test.ts` (approximately line 353) is skipped because it hangs during game setup in Playwright.

**Files:**
- Modify: `applications/web-client/e2e/p2p-game.test.ts`

- [ ] **Step 1: Read the skipped test**

Read the test body and surrounding context. Understand what it tries to do and where it hangs.

- [ ] **Step 2: Reproduce the hang**

Unskip the test and run it:
```bash
cd applications/web-client && npm run e2e:run -- e2e/p2p-game.test.ts
```

Observe where it hangs. Use Playwright's `--debug` flag if needed.

- [ ] **Step 3: Diagnose and fix**

The fix will likely involve one of:
- Playwright WebRTC timing (need `waitFor` or event-driven assertions)
- Page close timing (closing a page to simulate disconnect needs careful ordering)
- Race condition between disconnect detection and UI update

Fix the test. Do not change product code unless a genuine bug is found.

- [ ] **Step 4: Run the full e2e suite**

```bash
cd applications/web-client && npm run e2e
```

- [ ] **Step 5: Commit**

```
fix: unskip disconnection mid-game e2e test
```

---

### Task 16: Fix reconnect via server e2e test

The test at `e2e/p2p-game.test.ts` (approximately line 415) exists but does not pass — server-mediated WebRTC connections fail to complete in Playwright.

**Files:**
- Modify: `applications/web-client/e2e/p2p-game.test.ts`

- [ ] **Step 1: Read the existing test**

Read the test body. It has a full implementation that exercises the reconnect flow.

- [ ] **Step 2: Run the test and observe the failure**

```bash
cd applications/web-client && npm run e2e:run -- e2e/p2p-game.test.ts
```

Identify where the server-mediated connection fails. Is it SDP exchange? ICE gathering? Signaling message timing?

- [ ] **Step 3: Diagnose and fix**

The server-mediated flow uses the signaling server to relay SDP offers/answers. In Playwright, both browser contexts share the same signaling server. The issue may be:
- Both pages need to be REGISTERED before one can connect to the other
- Timing between page navigation, registration, and connection attempt
- WebRTC ICE candidates not gathering in time

Fix the test infrastructure. If the test needs a helper for reliable server-mediated connections, create one.

- [ ] **Step 4: Run the full e2e suite**

```bash
cd applications/web-client && npm run e2e
```

- [ ] **Step 5: Commit**

```
fix: enable reconnect via server e2e test
```

---

## Story 4: Surface transport failures

### Task 17: Surface signaling connection loss

When the signaling WebSocket errors or closes, `onerror`/`onclose` handlers are no-ops (`() => undefined`). Surface these to the user.

**Files:**
- Modify: `src/connections/signaling.ts:127,173` (onerror, onclose handlers)
- Modify: `src/connections/signaling.ts` (SignalingEvent type)
- Modify: `src/connections/connectionStore.ts` (signaling listener handles new events)

- [ ] **Step 1: Write failing test**

In `src/connections/signaling.server.test.ts`, add a test that verifies signaling emits an event when the WebSocket closes unexpectedly or errors.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add `DISCONNECTED` and `ERROR` to SignalingEvent**

In `signaling.ts`, add new event types and emit them from `onerror`/`onclose`:

```ts
currentWs.onerror = () => onEvent({type: 'SIGNALING_ERROR'});
currentWs.onclose = () => onEvent({type: 'SIGNALING_DISCONNECTED'});
```

- [ ] **Step 4: Handle in signaling listener**

In `connectionStore.ts`'s signaling listener, handle these new events by emitting to port so the UI can react (the heartbeat system may already show "offline", but this provides faster feedback).

- [ ] **Step 5: Run tests**

- [ ] **Step 6: Surface in UI**

If the heartbeat doesn't already cover this case, add a visual indicator. If it does, verify the behavior is sufficient.

- [ ] **Step 7: Commit**

```
feat: surface signaling connection failures to user
```

---

### Task 18: Surface data channel send failures

When `dataChannel?.send(...)` fails (channel closed/missing), messages are silently discarded. Surface this to the user.

**Files:**
- Modify: `src/connections/connectionHandler.ts` (send wrapper)
- Modify: `src/connections/connectionPort.ts` or state (error event)

- [ ] **Step 1: Identify the send pattern**

Read `connectionHandler.ts` to find all `dataChannels.get(...)?.send(...)` calls. These use optional chaining — if the channel doesn't exist, the send silently fails.

- [ ] **Step 2: Create a safe send wrapper**

Replace optional chaining sends with a wrapper that returns a Result:

```ts
const safeSend = (peerId: string, message: unknown): boolean => {
  const channel = dataChannels.get(peerId);
  if (!channel || channel.readyState !== 'open') return false;
  channel.send(JSON.stringify(message));
  return true;
};
```

- [ ] **Step 3: Emit failure events**

When `safeSend` returns false for game-critical messages (FIRE, GAME_CHALLENGE, etc.), emit an error event through the port so the game store can show feedback.

- [ ] **Step 4: Write tests and verify**

- [ ] **Step 5: Commit**

```
feat: surface data channel send failures to user
```

---

## Story 5: Surface game action failures

### Task 19: Surface coin flip hash failure

When coin flip hash verification fails, the player silently loses. Show a notification instead.

**Files:**
- Modify: `src/game/coinFlipProtocol.ts:60-68`
- Modify: `src/game/gameActions.ts` (new action for coin flip failure)
- Modify: `src/game/game.ts` (reducer handles new action)

- [ ] **Step 1: Write failing test**

Test that hash failure dispatches a distinguishable error action, not `turnOrderDecided(false)`.

- [ ] **Step 2: Add `COIN_FLIP_FAILED` action**

Create a new action type that the reducer handles by setting the P2P game to an error state with a message the UI can display.

- [ ] **Step 3: Update coinFlipProtocol**

Replace `dispatch(turnOrderDecided(false))` in the hash failure path with `dispatch(coinFlipFailed())`.

- [ ] **Step 4: Surface in UI**

The GameLobby should show a notification when coin flip fails, with an option to retry.

- [ ] **Step 5: Run tests and commit**

```
fix: surface coin flip failure instead of silent loss
```

---

### Task 20: Surface clipboard copy failure

When clipboard write fails (permission denied), the "Copy" button gives no feedback.

**Files:**
- Modify: `src/connections/DirectConnect.tsx:44-46`

- [ ] **Step 1: Read the current clipboard code**

- [ ] **Step 2: Add failure feedback**

In the clipboard `onFailure` handler, set state to show "Copy failed" or similar feedback instead of doing nothing.

- [ ] **Step 3: Write test and verify**

- [ ] **Step 4: Commit**

```
fix: show feedback when clipboard copy fails
```

---

### Task 21: Surface game state load failure

When P2P game state from the server can't be decoded, it's silently dropped.

**Files:**
- Modify: `src/game/gameMessageHandler.ts:200-223`

- [ ] **Step 1: Add `P2P_GAME_LOAD_FAILED` action**

- [ ] **Step 2: Dispatch on decode failure**

In the P2P_GAME_LOADED handler, when `serverP2pGameStateDecoder.decode(gs)` returns null or JSON parse fails, dispatch the failure action.

- [ ] **Step 3: Surface in UI**

Show a notification that the saved game couldn't be restored.

- [ ] **Step 4: Run tests and commit**

```
fix: surface game state load failure to user
```

---

### Task 22: Surface board verification failure

When board hash verification fails at game over, the result is ambiguous.

**Files:**
- Modify: `src/game/gameMessageHandler.ts:296-298`

- [ ] **Step 1: Ensure verification failure is clearly surfaced**

Currently, hash failure dispatches `opponentBoardRevealed(msg.board, false)`. The `false` means "not verified." The UI should clearly indicate this — check if the GameView already shows "not verified" differently from "verified." If not, update it.

- [ ] **Step 2: Run tests and commit**

```
fix: clarify unverified board status at game over
```

---

## Story ordering and GitHub issues

Create GitHub issues for each story with milestone "Iteration 9". Work order:

1. Stories 1 + 2 (sequential — architecture)
2. Story 3 (independent — e2e tests)
3. Stories 4 + 5 (after architecture — reliability)

Tag and release as v0.10.0 when all stories are complete.
