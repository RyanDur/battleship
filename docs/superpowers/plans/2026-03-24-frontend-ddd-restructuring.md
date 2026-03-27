# Frontend DDD Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the web-client frontend from technical-layer directories into two domain-driven bounded contexts (`connections/` and `game/`), each with their own store, so domain boundaries are structural.

**Architecture:** Two independent custom stores (not Redux). `ConnectionPort` interface mediates all cross-domain communication. Connection handler becomes pure transport — game handler subscribes to port events. Components move into their owning domain directory.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, schemawax, custom store pattern (reducer + middleware + listeners)

**Spec:** `docs/superpowers/specs/2026-03-24-frontend-ddd-restructuring-design.md`

**Key codebase files to read first:** `src/state/connectionStore.ts` (334 lines — store factory, middleware, listeners), `src/state/connections.ts` (517 lines — state shape, all reducers), `src/workers/connection.handler.ts` (689 lines — WebRTC + game protocol), `src/state/connectionActions.ts` (114 lines), `src/state/connectionSelectors.ts` (51 lines), `src/App.tsx` (92 lines)

**Running tests:** `cd applications/web-client && npm test` (tsc + eslint + vitest). All 416+ tests must pass after every commit.

**Code rules:** Arrow functions only. Named exports only. No `useRef`. No `as` casts. No `async`/`await` — use `AsyncResult`/`tryCatch`/`asyncTryCatch` (ROP). No `npx` — use `npm run` or `npm test`. Schemawax decoders for all external data (no casting). Classicist testing — fakes over mocks, test through the store.

---

## Task 1: Create ConnectionPort type and factory

**Goal:** Define the integration contract between domains and wire it alongside the existing store without changing any behavior.

**Files:**
- Create: `src/connections/connectionPort.ts`
- Create: `src/connections/connectionPort.test.ts`

**Context:** `ConnectionPort` is the only way game will talk to connections. It wraps the store's emit/dispatch in a domain-agnostic interface. For now, nobody calls it — we just prove the factory works.

- [ ] **Step 1: Write the ConnectionPort type and factory**

The port type and its event types live in one file. The factory takes the connection store and handler reference:

The `emit` method should not be on the `ConnectionPort` type — use a separate `ConnectionPortHandle` return type:

```typescript
// src/connections/connectionPort.ts

export type ConnectionEvent =
  | { type: 'PEER_CONNECTED'; peerId: string; isOfferer: boolean }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_MESSAGE'; peerId: string; data: unknown }
  | { type: 'SERVER_MESSAGE'; data: unknown }

export type ConnectionPort = {
  sendToPeer: (peerId: string, message: unknown) => void
  sendToServer: (message: unknown) => void
  subscribe: (listener: (event: ConnectionEvent) => void) => () => void
}

export type ConnectionPortHandle = {
  port: ConnectionPort
  emit: (event: ConnectionEvent) => void
}

type PortDeps = {
  sendToPeer: (peerId: string, message: unknown) => void
  sendToServer: (message: unknown) => void
}

export const createConnectionPort = (deps: PortDeps): ConnectionPortHandle => {
  const listeners = new Set<(event: ConnectionEvent) => void>();
  return {
    port: {
      sendToPeer: deps.sendToPeer,
      sendToServer: deps.sendToServer,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    emit: (event) => listeners.forEach(fn => fn(event)),
  };
};
```

- [ ] **Step 2: Write the test**

```typescript
// src/connections/connectionPort.test.ts
import {createConnectionPort} from './connectionPort';
import type {ConnectionEvent} from './connectionPort';

describe('connectionPort', () => {
  const makeDeps = () => ({
    sendToPeer: vi.fn(),
    sendToServer: vi.fn(),
  });

  it('sendToPeer delegates to deps', () => {
    const deps = makeDeps();
    const {port} = createConnectionPort(deps);
    port.sendToPeer('p1', {type: 'FIRE', row: 1, col: 2});
    expect(deps.sendToPeer).toHaveBeenCalledWith('p1', {type: 'FIRE', row: 1, col: 2});
  });

  it('sendToServer delegates to deps', () => {
    const deps = makeDeps();
    const {port} = createConnectionPort(deps);
    port.sendToServer({type: 'LOAD_BOARD'});
    expect(deps.sendToServer).toHaveBeenCalledWith({type: 'LOAD_BOARD'});
  });

  it('subscribe receives emitted events', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const received: ConnectionEvent[] = [];
    port.subscribe(event => received.push(event));
    emit({type: 'PEER_CONNECTED', peerId: 'p1', isOfferer: true});
    expect(received).toEqual([{type: 'PEER_CONNECTED', peerId: 'p1', isOfferer: true}]);
  });

  it('unsubscribe stops delivery', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const received: ConnectionEvent[] = [];
    const unsub = port.subscribe(event => received.push(event));
    unsub();
    emit({type: 'PEER_DISCONNECTED', peerId: 'p1'});
    expect(received).toEqual([]);
  });

  it('multiple subscribers each receive events', () => {
    const deps = makeDeps();
    const {port, emit} = createConnectionPort(deps);
    const a: ConnectionEvent[] = [];
    const b: ConnectionEvent[] = [];
    port.subscribe(e => a.push(e));
    port.subscribe(e => b.push(e));
    emit({type: 'PEER_MESSAGE', peerId: 'p1', data: {type: 'CHAT'}});
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd applications/web-client && npm test`
Expected: all existing tests still pass + 5 new port tests pass

- [ ] **Step 5: Commit**

```bash
git add applications/web-client/src/connections/connectionPort.ts applications/web-client/src/connections/connectionPort.test.ts
git commit -m "feat: add ConnectionPort type and factory for domain integration"
```

---

## Task 2: Create game store infrastructure

**Goal:** Create the game store with its own state, reducer, actions, selectors, context, and hooks — all extracted from the connection store files. The game store receives a `ConnectionPort`. At the end of this task, both stores exist but `App.tsx` still only uses the connection store.

**Files:**
- Create: `src/game/gameActions.ts`
- Create: `src/game/gameSelectors.ts`
- Create: `src/game/game.ts` (state + reducer)
- Create: `src/game/gameStore.ts` (store factory)
- Create: `src/game/gameContext.ts`
- Create: `src/game/GameProvider.tsx`
- Create: `src/game/useGame.ts`
- Create: `src/game/gameStore.test.ts`

**Context:** The game store follows the same custom store pattern as the connection store (`createConnectionStore` in `src/state/connectionStore.ts`). Read that file first to understand the pattern: `baseDispatch` runs reducer → notifies subscribers → runs action listeners. Middleware wraps dispatch. Listener factories receive `{dispatch, getState}`.

The game-domain types currently live in `src/state/connections.ts` (lines 11-48): `ShotResult`, `GamePhase`, `Shot`, `GameState`, `P2pGamePhase`, `P2pGame`, `GameView`. The game fields in `ConnectionsState` (lines 80-83) are: `board`, `boardLoading`, `gameState`, `p2pGame`.

The game actions currently live in `src/state/connectionActions.ts` (lines 73-114): everything from `saveBoard` onward.

The game selectors currently live in `src/state/connectionSelectors.ts` (lines 21-50): `selectBoard`, `selectBoardLoading`, `selectGameState`, `selectP2pGame`, `selectAnnouncement`, `selectGameView`.

The p2p game reducer currently lives in `src/state/connections.ts` (lines 427-510). The board/AI game cases live in `coreConnectionsReducer` (lines 378-409).

### Step-by-step:

- [ ] **Step 1: Create `src/game/gameActions.ts`**

Extract game actions from `src/state/connectionActions.ts` lines 73-114. Copy them into the new file. Keep the old file unchanged for now — both files export the same actions temporarily.

The new file needs the game types. Import them from `src/state/connections.ts` for now (we'll move the types later).

```typescript
// src/game/gameActions.ts
import type {GameState, Shot, GamePhase, P2pGame, P2pGamePhase} from '../state/connections';
import type {Board} from './board';

export const saveBoard = (board: Board) => ({type: 'SAVE_BOARD' as const, board});
export const boardSaved = () => ({type: 'BOARD_SAVED' as const});
// ... (all 37 game action creators, identical to connectionActions.ts lines 73-114)
```

- [ ] **Step 2: Create `src/game/game.ts`**

Extract the game types (`ShotResult`, `GamePhase`, `Shot`, `GameState`, `P2pGamePhase`, `P2pGame`, `GameView`) from `src/state/connections.ts` lines 11-48. Extract the game state shape. Extract `p2pGameReducer` (lines 427-510), the board/AI cases from `coreConnectionsReducer` (lines 378-409), and `p2pGameInitial` (lines 412-425). Combine into a `gameReducer`.

```typescript
// src/game/game.ts
import type {Board} from './board';

export type ShotResult = 'hit' | 'miss' | 'sunk';
// ... (all game types from connections.ts lines 11-48)

export type GameAction = /* union of all 37 game action types */;

export type GameState = {
  board: Board | null
  boardLoading: boolean
  gameState: AiGameState | null  // renamed from GameState to avoid collision
  p2pGame: P2pGame | null
  opponentNames: Record<string, string>  // peerId → name, from PEER_NAMED events
  offererPeerIds: string[]  // from PEER_CONNECTED events, for coin flip
}

export const initialGameState: GameState = {
  board: null,
  boardLoading: true,
  gameState: null,
  p2pGame: null,
  opponentNames: {},
  offererPeerIds: [],
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  // Combine: p2pGameReducer + board/AI cases + new PEER_CONNECTED/PEER_NAMED handling
};
```

**Important naming note:** The current codebase uses `GameState` for the AI game state type AND as a general concept. In the new game domain, rename the AI game state type to `AiGameState` to avoid collision with the overall `GameState` that holds `board`, `boardLoading`, etc.

- [ ] **Step 3: Create `src/game/gameSelectors.ts`**

Extract game selectors from `src/state/connectionSelectors.ts` lines 21-50. Update them to select from `GameState` instead of `ConnectionsState`.

```typescript
// src/game/gameSelectors.ts
import type {GameState, GameView} from './game';

export const selectBoard = (state: GameState) => state.board;
export const selectBoardLoading = (state: GameState) => state.boardLoading;
export const selectAiGameState = (state: GameState) => state.gameState;
export const selectP2pGame = (state: GameState) => state.p2pGame;

export const selectAnnouncement = (state: GameState): string => {
  if (state.p2pGame) return state.p2pGame.announcement;
  return state.gameState?.announcement ?? '';
};

export const selectGameView = (state: GameState): GameView | null => {
  const {gameState, p2pGame, opponentNames} = state;
  if (p2pGame && (p2pGame.phase === 'my-turn' || p2pGame.phase === 'their-turn' || p2pGame.phase === 'game-over' || p2pGame.phase === 'disconnected' || p2pGame.phase === 'state-mismatch')) {
    const opponentName = opponentNames[p2pGame.opponentId] ?? 'Opponent';
    // ... (same transform as connectionSelectors.ts selectGameView, but reads opponentNames from game state instead of peers from connection state)
  }
  // ... AI game path unchanged
};
```

**Key difference from current:** `selectGameView` currently reads `peers` from `ConnectionsState` to get opponent name. After the split, the game store tracks opponent names in `opponentNames` (populated from `PEER_NAMED` port events). This removes the cross-domain dependency.

- [ ] **Step 4: Create `src/game/gameStore.ts`**

Follow the exact same store pattern as `src/state/connectionStore.ts` lines 49-75. The game store factory receives a `ConnectionPort` and subscribes to connection events.

```typescript
// src/game/gameStore.ts
import {gameReducer, initialGameState} from './game';
import type {GameState, GameAction} from './game';
import type {ConnectionPort} from '../connections/connectionPort';

export type GameStore = {
  getState: () => GameState
  subscribe: (fn: () => void) => () => void
  dispatch: (action: GameAction) => void
  addListener: (fn: GameListenerFn) => () => void
}

export type GameListenerFn = (action: GameAction, context: GameListenerContext) => void

export type GameListenerContext = {
  prevState: GameState
  state: GameState
  dispatch: (action: GameAction) => void
  getState: () => GameState
}

export type GameListenerFactory = (deps: {dispatch: (action: GameAction) => void; getState: () => GameState}) => GameListenerFn

export const createGameStore = (port: ConnectionPort, listenerFactories?: GameListenerFactory[]): GameStore => {
  let state = initialGameState;
  const subscribers = new Set<() => void>();
  const actionListeners = new Set<GameListenerFn>();

  const store: GameStore = {
    getState: () => state,
    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    addListener: (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); },
    dispatch: (action: GameAction) => { void action; },
  };

  const baseDispatch = (action: GameAction) => {
    const prevState = state;
    state = gameReducer(state, action);
    subscribers.forEach(fn => fn());
    actionListeners.forEach(fn => fn(action, {prevState, state, dispatch: (a) => store.dispatch(a), getState: () => state}));
  };

  store.dispatch = baseDispatch;

  const listenerDeps = {dispatch: (action: GameAction) => store.dispatch(action), getState: () => state};
  listenerFactories?.forEach(factory => store.addListener(factory(listenerDeps)));

  // Subscribe to connection port events
  // (will be wired in a later task when we extract the game message handler)

  return store;
};
```

- [ ] **Step 5: Create game context, provider, and hook**

These follow the exact same pattern as `src/state/connectionContext.ts` (5 lines), `src/state/ConnectionProvider.tsx` (9 lines), and `src/state/useConnection.ts` (23 lines).

```typescript
// src/game/gameContext.ts
import {createContext} from 'react';
import type {GameStore} from './gameStore';

export const GameContext = createContext<GameStore | null>(null);
```

```typescript
// src/game/GameProvider.tsx
import type {ReactNode} from 'react';
import {GameContext} from './gameContext';
import type {GameStore} from './gameStore';

export const GameProvider = ({store, children}: {store: GameStore; children: ReactNode}) => (
  <GameContext.Provider value={store}>
    {children}
  </GameContext.Provider>
);
```

```typescript
// src/game/useGame.ts
import {useContext, useEffect, useState} from 'react';
import {GameContext} from './gameContext';
import type {GameStore} from './gameStore';
import type {GameState} from './game';

export const useGameStore = (): GameStore => {
  const store = useContext(GameContext);
  if (!store) throw new Error('useGameStore must be used within GameProvider');
  return store;
};

export const useGameState = <T,>(selector: (state: GameState) => T): T => {
  const store = useGameStore();
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), [store, selector]);
  return value;
};
```

**Note:** The existing `useConnection.ts` uses `useRef` + `useLayoutEffect` for the selector. This is tech debt — `useRef` is not allowed per project rules. The new `useGame.ts` avoids `useRef` by depending on `selector` in the effect deps. This works because selectors are stable module-level functions (not inline lambdas). As a follow-up, `useConnection.ts` should be updated to match this pattern.

- [ ] **Step 6: Write game store tests**

Test the game reducer through the store (classicist approach — same as `src/state/p2pGame.test.ts` and the board/AI sections of `src/state/connectionStore.test.ts`).

```typescript
// src/game/gameStore.test.ts
import {createGameStore} from './gameStore';
import {challengePeer, challengeReceived, acceptChallenge, declineChallenge, ...} from './gameActions';
import {selectP2pGame, selectBoard, selectBoardLoading, selectGameView} from './gameSelectors';
import type {ConnectionPort} from '../connections/connectionPort';

const fakePort: ConnectionPort = {
  sendToPeer: vi.fn(),
  sendToServer: vi.fn(),
  subscribe: vi.fn(() => () => {}),
};

const makeStore = () => createGameStore(fakePort);

describe('game store', () => {
  // Mirror all tests from p2pGame.test.ts, adapted for the new store
  // Mirror board/AI game tests from connectionStore.test.ts
  // Add tests for opponentNames tracking via port events
});
```

- [ ] **Step 7: Run tests**

Run: `cd applications/web-client && npm test`
Expected: all existing tests still pass + new game store tests pass

- [ ] **Step 8: Commit**

```bash
git add applications/web-client/src/game/
git commit -m "feat: add game store with reducer, actions, selectors, context, and hooks"
```

---

## Task 3a: Dual-write — wire game store alongside connection store

**Goal:** Create both stores in `App.tsx`, wrap components with both providers. **Both stores receive game actions in parallel** — the connection store keeps handling game state as before, while the game store also processes the same actions. Game components still read from the connection store. No behavior changes. This is a safe intermediate step.

**Files:**
- Modify: `src/App.tsx` — create both stores, wrap with both providers
- Modify: `src/game/game.ts` — add game types (re-exported from connections.ts)
- Modify: `src/state/connections.ts` — re-export game types from game.ts

**Context:** The dual-write phase ensures tests never break. Both stores handle game state simultaneously. We verify the game store produces correct state by adding assertions in game store tests, while existing connection store tests continue to pass unchanged.

### Sub-steps:

- [ ] **Step 1: Move game type definitions to `src/game/game.ts`**

Move `ShotResult`, `GamePhase`, `Shot`, `GameState` (AI), `P2pGamePhase`, `P2pGame`, `GameView` out of `src/state/connections.ts` into `src/game/game.ts`. In `connections.ts`, replace the type definitions with re-exports:

```typescript
// src/state/connections.ts — replace type definitions with re-exports
export type {ShotResult, GamePhase, Shot, P2pGamePhase, P2pGame, GameView} from '../game/game';
// Keep GameState re-export too (currently used as AI game state type)
```

- [ ] **Step 2: Run tests — verify re-exports work**

Run: `cd applications/web-client && npm test`
Expected: all existing tests pass (imports unchanged)

- [ ] **Step 3: Update App.tsx to create both stores and wrap with both providers**

```typescript
// src/App.tsx — add game store alongside connection store
import {createGameStore} from './game/gameStore';
import {GameProvider} from './game/GameProvider';
import {createConnectionPort} from './connections/connectionPort';
```

The game store is created but game components don't read from it yet.

- [ ] **Step 4: Run tests + e2e**

Run: `cd applications/web-client && npm test`
Run: `cd applications/web-client && npm run e2e`
Expected: all pass — no behavior change

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire game store alongside connection store (dual-write)"
```

---

## Task 3b: Switch game components to game store, remove game state from connection store

**Goal:** Game components switch from `useConnectionState`/`useConnectionStore` to `useGameState`/`useGameStore`. Then remove game state from `ConnectionsState`. Existing connection store tests lose game assertions (moved to game store tests). Game component tests render inside `GameProvider`.

**Files:**
- Modify: `src/components/Game.tsx` — switch to game store hooks
- Modify: `src/components/GameLobby.tsx` — switch to game store hooks
- Modify: `src/components/Game.test.tsx` — render with GameProvider
- Modify: `src/components/GameLobby.test.tsx` — render with GameProvider
- Modify: `src/state/connections.ts` — remove `board`, `boardLoading`, `gameState`, `p2pGame` from state
- Modify: `src/state/connectionSelectors.ts` — remove game selectors, add re-exports temporarily
- Modify: `src/state/connectionStore.ts` — remove game cases from handler/signaling listeners
- Modify: `src/state/p2pGame.test.ts` — switch to game store
- Modify: `src/state/connectionStore.test.ts` — remove game assertions
- Modify: `src/state/connectionStore.handler.test.ts` — game assertions move to game store integration tests

**Context:** This is the highest-risk task. Break into micro-steps and run tests between each. The key insight: switch components first (they read from game store), then remove game state from connection store, then update tests. If components switch first, their tests break until updated — so update component tests in the same step.

### Sub-steps:

- [ ] **Step 1: Switch Game.tsx to game store**

Change imports from `useConnectionState`/`useConnectionStore` to `useGameState`/`useGameStore`. Change selector/action imports from `../state/connectionSelectors` to `../game/gameSelectors`, etc.

- [ ] **Step 2: Update Game.test.tsx**

Render with `GameProvider` instead of (or in addition to) `ConnectionProvider`. Dispatch game actions to game store.

- [ ] **Step 3: Switch GameLobby.tsx to game store**

Same import changes. Key change: `selectPeers` (for opponent name) is replaced by game state's `opponentNames`. `selectBoard` reads from game store.

- [ ] **Step 4: Update GameLobby.test.tsx**

- [ ] **Step 5: Run tests — components now read from game store**

Run: `cd applications/web-client && npm test`

- [ ] **Step 6: Move p2pGame.test.ts to use game store**

Change `createConnectionStore()` to `createGameStore(fakePort)`. Keep same assertions.

- [ ] **Step 7: Remove game state from ConnectionsState**

Remove `board`, `boardLoading`, `gameState`, `p2pGame` from `ConnectionsState` and `initialState`. Remove `p2pGameReducer` call from `connectionsReducer`. Remove board/AI game cases from `coreConnectionsReducer`. Add temporary re-exports from connection selectors to game selectors if needed.

**Important:** Do NOT remove game cases from the handler listener or signaling listener yet. Those listeners still need to process game actions until the port forwarding is wired in Tasks 4 and 5. The handler/signaling listeners will temporarily read game state from the game store (passed as a dependency) or continue dispatching game actions that both stores handle.

- [ ] **Step 8: Update connectionStore.test.ts — remove game state assertions**

- [ ] **Step 9: Run all tests**

Run: `cd applications/web-client && npm test`

- [ ] **Step 10: Run e2e tests**

Run: `cd applications/web-client && npm run e2e`
Expected: all 20 e2e tests pass (handler/signaling listeners still process game actions)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: game components use game store, remove game state from connections"
```

---

## Task 4: Extract game message handler

**Goal:** Move all game-specific message decoding out of `connection.handler.ts` into `game/gameMessageHandler.ts`. The connection handler forwards unrecognized data channel messages as `PEER_MESSAGE` through the port.

**Files:**
- Create: `src/game/gameMessageHandler.ts`
- Modify: `src/workers/connection.handler.ts` — remove game decoders and game message handling
- Modify: `src/game/gameStore.ts` — wire game message handler as port subscriber

**Context:** Currently `connection.handler.ts` has game decoders at lines 62-104 and game message handling at lines 408-542 (inside `cbs.onMessage`). After extraction, `cbs.onMessage` handles connection messages (INTRODUCE, TRUST, INTRODUCTION_*, CHAT) and forwards everything else as `PEER_MESSAGE`.

### Sub-steps:

- [ ] **Step 1: Create `src/game/gameMessageHandler.ts`**

Extract from `connection.handler.ts`:
- Game decoders (lines 62-104): `gameChallengeDecoder`, `gameAcceptDecoder`, `gameDeclineDecoder`, `gameCancelDecoder`, `boardReadyDecoder`, `gameFirstTurnDecoder`, `coinFlipCommitDecoder`, `coinFlipRevealDecoder`, `p2pFireDecoder`, `p2pFireResultDecoder`, `gameForfeitDecoder`, `gameOverDecoder`, `gameStateSyncDecoder`
- Game helper functions (lines 106-121): `isFleetSunk`, `resolveP2pShot`
- `pendingCoinFlips` map + coin flip protocol (handler-local state)
- All game message handlers from `cbs.onMessage` (lines 408-542)

The game message handler subscribes to `PEER_MESSAGE` events from the port and dispatches game actions:

```typescript
// src/game/gameMessageHandler.ts
import type {ConnectionPort, ConnectionEvent} from '../connections/connectionPort';
import type {GameState, GameAction} from './game';

type GameMessageDeps = {
  port: ConnectionPort
  dispatch: (action: GameAction) => void
  getState: () => GameState
}

export const createGameMessageHandler = (deps: GameMessageDeps): (() => void) => {
  const pendingCoinFlips = new Map<string, PendingCoinFlip>();

  return deps.port.subscribe((event) => {
    if (event.type === 'PEER_CONNECTED') {
      // Store isOfferer for coin flip
    }
    if (event.type === 'PEER_NAMED') {
      // Store opponent name
    }
    if (event.type === 'PEER_MESSAGE') {
      const {peerId, data} = event;
      // Decode game messages, dispatch actions
      // (same logic as connection.handler.ts lines 408-542)
    }
    if (event.type === 'SERVER_MESSAGE') {
      // Decode persistence responses (BOARD_LOADED, P2P_GAME_LOADED, etc.)
    }
  });
};
```

- [ ] **Step 2: Simplify `connection.handler.ts` — remove game decoders and handlers**

Remove:
- All game decoders (lines 62-104)
- `isFleetSunk`, `resolveP2pShot` (lines 106-121)
- `pendingCoinFlips` (line 254)
- Game message handling from `cbs.onMessage` (lines 408-542)
- Game imports from `connectionActions.ts` and `connectionSelectors.ts` (line 7-8)
- `selectP2pGame`, `selectBoard` usage
- **Fix existing `as` casts** (lines 523, 532-533): replace `msg.board as Board` and `msg.myShots as Shot[]` with proper schemawax decoders in the new game message handler. The board and shot decoders already exist — wire them through.

Replace the removed game decoder chain in `cbs.onMessage` with:

```typescript
// After all connection decoders (.or chains), add fallthrough:
.or(() => {
  // Unrecognized message — forward to port as PEER_MESSAGE
  deps.emitToPort({type: 'PEER_MESSAGE', peerId, data: parsed});
  return maybe(null); // consume the fallthrough
});
```

The handler needs access to `emitToPort` — add it to `Deps`:

```typescript
type Deps = {
  name: string
  emit: (event: PeerEvent) => void
  emitToPort: (event: ConnectionEvent) => void  // NEW
  createPeerConnection: () => RTCPeerConnection
  getState: () => ConnectionsState
  dispatch: (action: ConnectionsAction) => void
}
```

- [ ] **Step 3: Wire game message handler into game store**

In `createGameStore`, subscribe to the port and create the message handler:

```typescript
// In createGameStore, after creating the store:
const unsub = createGameMessageHandler({port, dispatch: store.dispatch, getState: store.getState});
// Store unsub for cleanup if needed
```

- [ ] **Step 4: Update `createHandlerListener` to emit port events**

In `connectionStore.ts`, `makeHandlerEmit` currently dispatches `peerConnected` on `PEER_CONNECTED`. It should also emit to the port:

```typescript
// In makeHandlerEmit:
if (event.type === 'PEER_CONNECTED') {
  dispatch(peerConnected(event.peerId));
  portHandle.emit({type: 'PEER_CONNECTED', peerId: event.peerId, isOfferer: selectOffererPeerIds(getState()).includes(event.peerId)});
  // ... existing reconnect logic
}
if (event.type === 'PEER_NAMED') {
  dispatch(peerNamed(event.peerId, event.name));
  portHandle.emit({type: 'PEER_NAMED', peerId: event.peerId, name: event.name});
}
if (event.type === 'PEER_DISCONNECTED') {
  dispatch(peerDisconnected(event.peerId));
  portHandle.emit({type: 'PEER_DISCONNECTED', peerId: event.peerId});
}
```

- [ ] **Step 5: Run all tests**

Run: `cd applications/web-client && npm test`

- [ ] **Step 6: Run e2e tests**

Run: `cd applications/web-client && npm run e2e`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: extract game message handler from connection handler"
```

---

## Task 5: Split signaling listener

**Goal:** Connection's signaling listener forwards unrecognized server messages through the port as `SERVER_MESSAGE`. Game's store listener decodes them.

**Files:**
- Modify: `src/state/connectionStore.ts` — remove game server event handling from `createSignalingListener`
- Modify: `src/game/gameStore.ts` — add server message decoding in game listener

**Context:** Currently `createSignalingListener` (lines 254-333 of `connectionStore.ts`) handles both connection and game server events. The game events are: `BOARD_SAVED` (line 272), `BOARD_LOADED` (line 273), `BOARD_NOT_FOUND` (line 274), `GAME_STARTED` (line 275), `FIRE_RESULT` (line 276), `GAME_STATE` (line 277), `GAME_NOT_FOUND` (line 278), `P2P_GAME_LOADED` (lines 279-290). Also the sending side: `SAVE_BOARD` (lines 313-314), `LOAD_BOARD` (lines 315-316), `START_GAME` (lines 317-318), `FIRE_SHOT` (lines 319-320), `LOAD_GAME` (lines 321-322), `SAVE_P2P_GAME` (lines 323-328), `LOAD_P2P_GAME` (lines 329-330).

### Sub-steps:

- [ ] **Step 1: Add port emitting to signaling listener**

For game-related server events, emit `SERVER_MESSAGE` through the port instead of dispatching game actions:

```typescript
// In createSignalingListener, replace game event handlers:
else if (event.type === 'BOARD_LOADED') portHandle.emit({type: 'SERVER_MESSAGE', data: {type: 'BOARD_LOADED', board: event.board}});
else if (event.type === 'BOARD_NOT_FOUND') portHandle.emit({type: 'SERVER_MESSAGE', data: {type: 'BOARD_NOT_FOUND'}});
// etc.
```

- [ ] **Step 2: Handle server messages in game message handler**

The game message handler's `SERVER_MESSAGE` handler decodes persistence responses using schemawax decoders (same pattern as the existing signaling listener — no casting):

```typescript
if (event.type === 'SERVER_MESSAGE') {
  // Use schemawax decoders to safely decode server messages
  // e.g. boardLoadedDecoder.decode(event.data) → dispatch boardLoaded
  // No `as` casts — decode or ignore
}
```

- [ ] **Step 3: Move game send actions to game listener**

The game store listener handles game actions that need to send to the server:

```typescript
// In game listener:
if (action.type === 'SAVE_BOARD') port.sendToServer({type: 'SAVE_BOARD', board: JSON.stringify(action.board)});
else if (action.type === 'LOAD_BOARD') port.sendToServer({type: 'LOAD_BOARD'});
// etc.
```

- [ ] **Step 4: Remove game send actions from connection signaling listener**

Remove the `SAVE_BOARD`, `LOAD_BOARD`, `START_GAME`, `FIRE_SHOT`, `LOAD_GAME`, `SAVE_P2P_GAME`, `LOAD_P2P_GAME` cases from `createSignalingListener`.

- [ ] **Step 5: Move P2P game decoder from connectionStore.ts to game**

The schemawax decoders at lines 229-248 of `connectionStore.ts` (`p2pCellDecoder`, `p2pShipDecoder`, `p2pShotDecoder`, `p2pGameStateDecoder`) move to the game message handler or game store.

- [ ] **Step 6: Run all tests + e2e**

Run: `cd applications/web-client && npm test && cd applications/web-client && npm run e2e`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: split signaling listener — game server events flow through port"
```

---

## Task 6: Strip game concerns from Fleet and Alerts, move challenge to game

**Goal:** Fleet.tsx becomes purely social (no challenge buttons, no game imports). Alerts.tsx handles introductions only. A new `ChallengeAlert.tsx` in game handles challenge received.

**Files:**
- Modify: `src/components/Fleet.tsx` — remove `challengePeer`, `cancelChallenge`, `selectP2pGame` imports and usage
- Modify: `src/components/Alerts.tsx` — remove challenge alert rendering
- Create: `src/game/ChallengeAlert.tsx`
- Modify: `src/App.tsx` — render ChallengeAlert
- Modify: test files for Fleet, Alerts

**Context:** Currently `PeerCard` in Fleet.tsx (lines 9-51) renders challenge/cancel buttons and imports `selectP2pGame`, `challengePeer`, `cancelChallenge`. Alerts.tsx (lines 1-49) renders both introduction alerts and challenge-received alerts. After this task, Fleet is connection-only, Alerts is connection-only, and ChallengeAlert is game-only.

### Sub-steps:

- [ ] **Step 1: Create `src/game/ChallengeAlert.tsx`**

```typescript
// src/game/ChallengeAlert.tsx
import {useGameState, useGameStore} from './useGame';
import {selectP2pGame} from './gameSelectors';
import {acceptChallenge, declineChallenge} from './gameActions';

export const ChallengeAlert = () => {
  const store = useGameStore();
  const p2pGame = useGameState(selectP2pGame);
  // Opponent name comes from game state (opponentNames)

  if (p2pGame?.phase !== 'challenge-received') return null;

  return (
    <article className="alerts-alert">
      {opponentName} wants to play you
      <button className="control" onClick={() => store.dispatch(acceptChallenge())}>Accept</button>
      <button className="control" onClick={() => store.dispatch(declineChallenge())}>Decline</button>
    </article>
  );
};
```

- [ ] **Step 2: Remove challenge from Fleet.tsx**

Remove `selectP2pGame`, `challengePeer`, `cancelChallenge` imports. Remove `p2pGame` state and challenge/cancel button rendering from `PeerCard`.

- [ ] **Step 3: Remove challenge from Alerts.tsx**

Remove `selectP2pGame`, `selectPeers`, `acceptChallenge`, `declineChallenge` imports. Remove challenge alert rendering. Keep introduction alerts only.

- [ ] **Step 4: Render ChallengeAlert alongside Alerts**

`Alerts` is currently rendered inside `Comms.tsx` (not App.tsx). Add `<ChallengeAlert/>` next to `<Alerts/>` in `Comms.tsx`. `Comms.tsx` will need to import from the game domain — this is acceptable because `Comms` is a layout component that composes both domains. Alternatively, move the alert rendering out of `Comms` and into `App.tsx` inside the `GameProvider`/`ConnectionProvider`. The implementer should check where it fits the existing CSS grid layout (`hud-comms`).

- [ ] **Step 5: Update tests**

- Fleet tests: remove challenge-related assertions
- Alerts tests: remove challenge-related assertions
- New ChallengeAlert test: render with game store, verify accept/decline

- [ ] **Step 6: Run all tests + e2e**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: extract challenge UI to game domain, Fleet is purely social"
```

---

## Task 7: Move components and protocol files to domain directories

**Goal:** Move game components into `src/game/`, connection components into `src/connections/`, protocol files into `src/connections/`. Update all imports.

**Files:**
- Move: `src/components/Game.tsx` → `src/game/Game.tsx`
- Move: `src/components/GameLobby.tsx` → `src/game/GameLobby.tsx`
- Move: `src/components/BoardSetup.tsx` → `src/game/BoardSetup.tsx`
- Move: `src/components/Fleet.tsx` → `src/connections/Fleet.tsx`
- Move: `src/components/Comms.tsx` → `src/connections/Comms.tsx`
- Move: `src/components/DirectConnect.tsx` → `src/connections/DirectConnect.tsx`
- Move: `src/components/ConnectionStatus.tsx` → `src/connections/ConnectionStatus.tsx`
- Move: `src/components/ConnectionStatus.css` → `src/connections/ConnectionStatus.css`
- Move: `src/components/Alerts.tsx` → `src/connections/Alerts.tsx`
- Move: `src/components/ServiceHealth.tsx` → `src/connections/ServiceHealth.tsx`
- Move: `src/components/DownloadLink.tsx` → `src/connections/DownloadLink.tsx`
- Move: `src/protocol/signaling.ts` → `src/connections/signaling.ts`
- Move: `src/protocol/connection-code.ts` → `src/connections/connectionCode.ts`
- Move: `src/protocol/heartbeat.ts` → `src/connections/heartbeat.ts`
- Move: `src/protocol/config.ts` → `src/connections/config.ts`
- Move: `src/protocol/download.ts` → `src/connections/download.ts`
- Move: `src/protocol/http.ts` → `src/connections/http.ts`
- Move: `src/protocol/platform.ts` → `src/connections/platform.ts`
- Move: `src/state/connectionStore.ts` → `src/connections/connectionStore.ts`
- Move: `src/state/connectionActions.ts` → `src/connections/connectionActions.ts`
- Move: `src/state/connectionSelectors.ts` → `src/connections/connectionSelectors.ts`
- Move: `src/state/connections.ts` → `src/connections/connections.ts`
- Move: `src/state/connectionContext.ts` → `src/connections/connectionContext.ts`
- Move: `src/state/ConnectionProvider.tsx` → `src/connections/ConnectionProvider.tsx`
- Move + fix: `src/state/useConnection.ts` → `src/connections/useConnection.ts` (remove `useRef`/`useLayoutEffect`, match `useGame.ts` pattern)
- Move: `src/workers/connection.handler.ts` → `src/connections/connectionHandler.ts`
- Move: all corresponding test files
- Update: all imports across the entire codebase

**Context:** This is a large mechanical file move. Use `git mv` for each file to preserve history. After each batch of moves, run `npm test` to catch broken imports.

### Sub-steps:

- [ ] **Step 1: Move state files to `src/connections/`**

Use `git mv` for each file. Update imports.

- [ ] **Step 2: Run tests — catch broken imports**

- [ ] **Step 3: Move protocol files to `src/connections/`**

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Move worker file to `src/connections/`**

- [ ] **Step 6: Run tests**

- [ ] **Step 7: Move connection components to `src/connections/`**

- [ ] **Step 8: Run tests**

- [ ] **Step 9: Move game components to `src/game/`**

- [ ] **Step 10: Run tests**

- [ ] **Step 11: Update App.tsx imports**

- [ ] **Step 12: Run full test suite + e2e**

Run: `cd applications/web-client && npm test && cd applications/web-client && npm run e2e`

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: move files into connections/ and game/ domain directories"
```

---

## Task 8: Clean up old directories and re-exports

**Goal:** Remove empty directories, remove re-exports that bridged the migration, update any remaining stale imports.

**Files:**
- Remove: `src/components/` (should be empty)
- Remove: `src/state/` (should be empty)
- Remove: `src/protocol/` (should be empty)
- Remove: `src/workers/` (should be empty)
- Move or inline: `src/types/worker-messages.ts` — move `PeerEvent`/`PeerCommand` types into `src/connections/connectionHandler.ts` (they are only used there) and remove `src/types/`
- Modify: `src/connections/connections.ts` — remove game type re-exports
- Update: any remaining cross-domain re-exports

### Sub-steps:

- [ ] **Step 1: Remove re-exports from connection files**

If `src/connections/connectionActions.ts` still re-exports game actions, remove them. Same for selectors and types.

- [ ] **Step 2: Remove empty directories**

```bash
rm -rf applications/web-client/src/components/
rm -rf applications/web-client/src/state/
rm -rf applications/web-client/src/protocol/
rm -rf applications/web-client/src/workers/
```

- [ ] **Step 3: Run full test suite + e2e**

Run: `cd applications/web-client && npm test && cd applications/web-client && npm run e2e`

- [ ] **Step 4: Verify directory structure matches spec**

```bash
ls -la applications/web-client/src/
# Should show: connections/, game/, lib/, styles/, test/, hooks/, App.tsx, AppShell.tsx, main.tsx
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove old directories, complete DDD restructuring"
```

---

## Post-completion checklist

- [ ] All 416+ vitest tests pass
- [ ] All 20 e2e tests pass
- [ ] `src/connections/` contains only connection-domain code
- [ ] `src/game/` contains only game-domain code
- [ ] No file in `src/connections/` imports from `src/game/`
- [ ] Game components use `useGameStore`/`useGameState`, not connection hooks
- [ ] Connection components have zero game imports
- [ ] Fleet.tsx has no challenge buttons or game selectors
- [ ] Alerts.tsx has no challenge alert rendering
- [ ] `ConnectionPort` is the only interface between domains
