# Coin Flip Protocol Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the commit-reveal coin flip protocol from `connectionHandler.ts` into a standalone `coinFlipProtocol.ts` module in `src/game/`, completing #83.

**Architecture:** A new `createCoinFlipProtocol` factory creates a self-contained module that owns the entire coin flip lifecycle. It subscribes to the connection port for incoming messages and uses `port.sendToPeer` for outgoing messages. The game store wires it during setup and the game command listener calls `coinFlip.start()` on `CLAIM_FIRST_TURN`.

**Tech Stack:** TypeScript, schemawax (decoders), AsyncResult (ROP), Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-coin-flip-extraction-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/game/coinFlipProtocol.ts` | Create | Standalone coin flip commit-reveal protocol |
| `src/game/coinFlipProtocol.test.ts` | Create | Unit tests for the protocol |
| `src/game/gameStore.ts` | Modify | Wire coin flip to port subscription + command listener |
| `src/game/GameLobby.tsx` | Modify | Dispatch `claimFirstTurn` to game store |
| `src/connections/connectionHandler.ts` | Modify | Remove all coin flip code |
| `src/connections/connectionStore.ts` | Modify | Remove `dispatchGameAction` block |
| `src/connections/connections.ts` | Modify | Remove `CLAIM_FIRST_TURN` from `ConnectionsAction` |
| `src/connections/connectionActions.ts` | Modify | Remove `claimFirstTurn` and `turnOrderDecided` |
| `src/connections/connectionStore.handler.test.ts` | Modify | Remove coin flip tests (moved to new test file) |

All paths relative to `applications/web-client/`.

---

## Codebase Context

**Arrow functions only** — no `function` declarations. **Named exports only** — no default exports. **Frozen objects** — `Object.freeze` on Result/Maybe. **ROP** — `AsyncResult` for async (no raw async/await). **Schemawax** for decoders. **Classicist testing** — fakes over mocks, observe behavior not implementation. Tests go through the store. **No `as` casts** — use type guards, schemawax decoders, or restructure. **No `npx`** — use `npm run` or `npm test`.

**Key patterns to follow:**
- `createGameMessageHandler` in `src/game/gameMessageHandler.ts` — factory that takes deps, subscribes to port, decodes peer messages with schemawax. The coin flip protocol follows this same pattern.
- `createGameCommandListenerFactory` in `src/game/gameStore.ts` — listener factory with `GameCommandHandlers` mapped type. `CLAIM_FIRST_TURN` will be added here.
- `hashValue` in `src/game/hashBoard.ts` — returns `AsyncResult<string, Error>`. Used for SHA-256 hashing.

**Test infrastructure:** `connectionStore.handler.test.ts` has a `makePair()` helper that creates two connected peers (Alice and Bob) with fake WebRTC, connection stores, game stores, and connection ports. The coin flip integration tests should use a similar setup through the game store.

**Offerer peer IDs:** The coin flip uses offerer/answerer roles for tie-breaking. The original code uses `localOffererPeerIds` (a `Set` in the handler closure). After extraction, this comes from `selectOffererPeerIds(gameState)` which returns `string[]`. The `includes()` call is O(n) vs the original O(1) `Set.has()`, but with a handful of peers this is irrelevant.

---

## Task 1: Create `coinFlipProtocol.ts` with unit tests

**Files:**
- Create: `src/game/coinFlipProtocol.ts`
- Create: `src/game/coinFlipProtocol.test.ts`
- Reference: `src/connections/connectionHandler.ts:231-232` (PendingCoinFlip type)
- Reference: `src/connections/connectionHandler.ts:97-98` (decoders)
- Reference: `src/connections/connectionHandler.ts:386-434` (message handling)
- Reference: `src/connections/connectionHandler.ts:560-573` (start coin flip)
- Reference: `src/game/hashBoard.ts:5-9` (hashValue)

- [ ] **Step 1: Write the failing test — normal coin flip flow**

In `src/game/coinFlipProtocol.test.ts`. Type `dispatched` as `GameAction[]` (not `unknown[]`) to avoid casts:

```typescript
import {vi} from 'vitest';
import {createCoinFlipProtocol} from './coinFlipProtocol';
import type {GameAction} from './game';

const makeDeps = () => {
  const sent: {peerId: string; message: Record<string, unknown>}[] = [];
  const dispatched: GameAction[] = [];
  return {
    deps: {
      sendToPeer: (peerId: string, message: unknown) => { sent.push({peerId, message: message as Record<string, unknown>}); },
      getOffererPeerIds: () => [] as string[],
      dispatch: (action: GameAction) => { dispatched.push(action); },
    },
    sent,
    dispatched,
  };
};

describe('coin flip protocol', () => {
  it('initiator commits hash, responder reveals, initiator reveals, turn resolved', async () => {
    const alice = makeDeps();
    const bob = makeDeps();
    const aliceFlip = createCoinFlipProtocol(alice.deps);
    const bobFlip = createCoinFlipProtocol(bob.deps);

    aliceFlip.start('bob');

    await vi.waitFor(() => {
      expect(alice.sent).toHaveLength(1);
      expect(alice.sent[0].message).toMatchObject({type: 'COIN_FLIP_COMMIT'});
    });

    bobFlip.handleMessage('alice', alice.sent[0].message);
    expect(bob.sent).toHaveLength(1);
    expect(bob.sent[0].message).toMatchObject({type: 'COIN_FLIP_REVEAL'});

    aliceFlip.handleMessage('bob', bob.sent[0].message);

    await vi.waitFor(() => {
      expect(alice.dispatched).toHaveLength(1);
      expect(alice.dispatched[0].type).toBe('TURN_ORDER_DECIDED');
    });

    expect(alice.sent).toHaveLength(2);
    expect(alice.sent[1].message).toMatchObject({type: 'COIN_FLIP_REVEAL'});

    bobFlip.handleMessage('alice', alice.sent[1].message);

    await vi.waitFor(() => {
      expect(bob.dispatched).toHaveLength(1);
      expect(bob.dispatched[0].type).toBe('TURN_ORDER_DECIDED');
    });

    // Opposite results — extract iGoFirst via type narrowing
    const aliceResult = alice.dispatched[0];
    const bobResult = bob.dispatched[0];
    if (aliceResult.type !== 'TURN_ORDER_DECIDED' || bobResult.type !== 'TURN_ORDER_DECIDED') throw new Error('unexpected');
    expect(aliceResult.iGoFirst).not.toBe(bobResult.iGoFirst);
  });
});
```

Run: `cd applications/web-client && npm run test:watch -- src/game/coinFlipProtocol.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `coinFlipProtocol.ts`**

Create `src/game/coinFlipProtocol.ts`. Port the protocol from `connectionHandler.ts`:

```typescript
import * as Decoder from 'schemawax';
import {maybe} from '../lib/maybe';
import {hashValue} from './hashBoard';
import {turnOrderDecided} from './gameActions';
import type {GameAction} from './game';

const coinFlipCommitDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_COMMIT'), hash: Decoder.string}});
const coinFlipRevealDecoder = Decoder.object({required: {type: Decoder.literal('COIN_FLIP_REVEAL'), value: Decoder.number}});

type PendingCoinFlip = {
  opponentHash: string
  myValue: number
  myHash: string
  iInitiated: boolean
  revealSent: boolean
}

type CoinFlipDeps = {
  sendToPeer: (peerId: string, message: unknown) => void
  getOffererPeerIds: () => string[]
  dispatch: (action: GameAction) => void
}

export type CoinFlipProtocol = {
  start: (peerId: string) => void
  handleMessage: (peerId: string, data: unknown) => void
}

export const createCoinFlipProtocol = (deps: CoinFlipDeps): CoinFlipProtocol => {
  const pending = new Map<string, PendingCoinFlip>();

  const resolveTurn = (peerId: string, flip: PendingCoinFlip, opponentValue: number) => {
    const merged = flip.myValue ^ opponentValue;
    const isOfferer = deps.getOffererPeerIds().includes(peerId);
    const iGoFirst = isOfferer ? (merged % 2) === 0 : (merged % 2) !== 0;
    deps.dispatch(turnOrderDecided(iGoFirst));
  };

  const handleCommit = (peerId: string, hash: string) => {
    const existing = pending.get(peerId);
    if (existing?.iInitiated) {
      // Simultaneous: both sent COMMIT. Offerer yields initiator role to answerer.
      const iInitiated = !deps.getOffererPeerIds().includes(peerId);
      pending.set(peerId, {...existing, opponentHash: hash, iInitiated, revealSent: true});
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: existing.myValue});
    } else {
      const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
      pending.set(peerId, {opponentHash: hash, myValue, myHash: '', iInitiated: false, revealSent: true});
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: myValue});
    }
  };

  const handleReveal = (peerId: string, value: number) => {
    const flip = pending.get(peerId);
    if (!flip) return;
    pending.delete(peerId);
    if (flip.iInitiated && !flip.revealSent) {
      deps.sendToPeer(peerId, {type: 'COIN_FLIP_REVEAL', value: flip.myValue});
    }
    if (flip.opponentHash) {
      hashValue(value.toString())
        .onSuccess(hash => {
          if (hash !== flip.opponentHash) {
            deps.dispatch(turnOrderDecided(false));
            return;
          }
          resolveTurn(peerId, flip, value);
        })
        .onFailure(() => deps.dispatch(turnOrderDecided(false)));
    } else {
      resolveTurn(peerId, flip, value);
    }
  };

  return {
    start: (peerId) => {
      const myValue = Math.floor(Math.random() * 0xFFFFFFFF);
      // Store synchronously before async hash — a peer's COMMIT can arrive during hash computation
      pending.set(peerId, {opponentHash: '', myValue, myHash: '', iInitiated: true, revealSent: false});
      hashValue(myValue.toString())
        .onSuccess(hash => {
          const existing = pending.get(peerId);
          if (!existing || existing.revealSent) return; // simultaneous already handled
          pending.set(peerId, {...existing, myHash: hash});
          deps.sendToPeer(peerId, {type: 'COIN_FLIP_COMMIT', hash});
        })
        .onFailure(() => { pending.delete(peerId); });
    },
    handleMessage: (peerId, data) => {
      // Silently ignores non-coin-flip messages (port delivers all peer messages)
      maybe(coinFlipCommitDecoder.decode(data))
        .map(msg => handleCommit(peerId, msg.hash))
        .or(() => maybe(coinFlipRevealDecoder.decode(data))
          .map(msg => handleReveal(peerId, msg.value)));
    },
  };
};
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd applications/web-client && npm run test:watch -- src/game/coinFlipProtocol.test.ts`
Expected: PASS

- [ ] **Step 4: Add test — simultaneous flip (both commit)**

Add to the describe block. Use typed sent array and type narrowing instead of casts:

```typescript
it('simultaneous flip — both commit, offerer yields initiator role', async () => {
  const alice = makeDeps();
  alice.deps.getOffererPeerIds = () => ['bob'];
  const bob = makeDeps();
  bob.deps.getOffererPeerIds = () => [];
  const aliceFlip = createCoinFlipProtocol(alice.deps);
  const bobFlip = createCoinFlipProtocol(bob.deps);

  aliceFlip.start('bob');
  bobFlip.start('alice');

  await vi.waitFor(() => {
    expect(alice.sent.length).toBeGreaterThanOrEqual(1);
    expect(bob.sent.length).toBeGreaterThanOrEqual(1);
  });

  aliceFlip.handleMessage('bob', bob.sent[0].message);
  bobFlip.handleMessage('alice', alice.sent[0].message);

  const aliceReveals = alice.sent.filter(s => s.message.type === 'COIN_FLIP_REVEAL');
  const bobReveals = bob.sent.filter(s => s.message.type === 'COIN_FLIP_REVEAL');
  expect(aliceReveals.length).toBeGreaterThanOrEqual(1);
  expect(bobReveals.length).toBeGreaterThanOrEqual(1);

  aliceReveals.forEach(r => bobFlip.handleMessage('alice', r.message));
  bobReveals.forEach(r => aliceFlip.handleMessage('bob', r.message));

  await vi.waitFor(() => {
    expect(alice.dispatched).toHaveLength(1);
    expect(bob.dispatched).toHaveLength(1);
  });

  const aliceResult = alice.dispatched[0];
  const bobResult = bob.dispatched[0];
  if (aliceResult.type !== 'TURN_ORDER_DECIDED' || bobResult.type !== 'TURN_ORDER_DECIDED') throw new Error('unexpected');
  expect(aliceResult.iGoFirst).not.toBe(bobResult.iGoFirst);
});
```

- [ ] **Step 5: Run tests**

Run: `cd applications/web-client && npm run test:watch -- src/game/coinFlipProtocol.test.ts`
Expected: PASS

- [ ] **Step 6: Add test — handleMessage ignores non-coin-flip messages**

```typescript
it('handleMessage ignores non-coin-flip messages', () => {
  const {deps, dispatched, sent} = makeDeps();
  const flip = createCoinFlipProtocol(deps);
  flip.handleMessage('peer', {type: 'GAME_CHALLENGE'});
  flip.handleMessage('peer', {type: 'FIRE', row: 0, col: 0});
  flip.handleMessage('peer', 'not-an-object');
  expect(dispatched).toHaveLength(0);
  expect(sent).toHaveLength(0);
});
```

- [ ] **Step 7: Add test — hash mismatch penalizes cheater**

The cheater (whose revealed value doesn't match their committed hash) gets `their-turn`:

```typescript
it('hash mismatch penalizes the cheater with their-turn', async () => {
  const {deps, dispatched, sent} = makeDeps();
  const flip = createCoinFlipProtocol(deps);

  // Simulate: opponent sent a COMMIT with a bogus hash
  flip.handleMessage('peer', {type: 'COIN_FLIP_COMMIT', hash: 'bogus-hash-that-wont-match'});

  // We responded with a REVEAL (auto-generated value)
  expect(sent).toHaveLength(1);
  expect(sent[0].message).toMatchObject({type: 'COIN_FLIP_REVEAL'});

  // Opponent reveals their value — hash won't match 'bogus-hash-that-wont-match'
  flip.handleMessage('peer', {type: 'COIN_FLIP_REVEAL', value: 42});

  await vi.waitFor(() => {
    expect(dispatched).toHaveLength(1);
  });
  // Mismatch penalty: we get their-turn (iGoFirst = false)
  const result = dispatched[0];
  if (result.type !== 'TURN_ORDER_DECIDED') throw new Error('unexpected');
  expect(result.iGoFirst).toBe(false);
});
```

- [ ] **Step 8: Run tests**

Run: `cd applications/web-client && npm run test:watch -- src/game/coinFlipProtocol.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add applications/web-client/src/game/coinFlipProtocol.ts applications/web-client/src/game/coinFlipProtocol.test.ts
git commit -m "feat: #83 standalone coin flip protocol module with unit tests"
```

---

## Task 2: Wire coin flip into game store

**Files:**
- Modify: `src/game/gameStore.ts:30-46` (add coinFlip to deps/config types)
- Modify: `src/game/gameStore.ts:105-154` (add CLAIM_FIRST_TURN to command handlers)
- Modify: `src/game/gameStore.ts:171-208` (wire coin flip in createGameStore)

- [ ] **Step 1: Add CLAIM_FIRST_TURN to game command listener**

In `src/game/gameStore.ts`, add `coinFlip` to `ListenerFactoryDeps`:

```typescript
type ListenerFactoryDeps = {
  dispatch: Dispatch
  getState: () => GameState
  port?: ConnectionPort
  dispatchToConnection?: (action: ConnectionsAction) => void
  getPeerToSignaling?: () => Record<string, string>
  coinFlip?: CoinFlipProtocol
}
```

In `createGameCommandListenerFactory`, destructure `coinFlip` and add the handler after `TAKE_FIRST_TURN`:

```typescript
export const createGameCommandListenerFactory: GameListenerFactory = ({dispatch, port, dispatchToConnection, getPeerToSignaling, coinFlip}) => {
```

Add to the `handlers` object:

```typescript
CLAIM_FIRST_TURN: (_, prevGame) => {
  if (!prevGame) return;
  coinFlip?.start(prevGame.opponentId);
},
```

Add imports at the top:

```typescript
import {createCoinFlipProtocol} from './coinFlipProtocol';
import type {CoinFlipProtocol} from './coinFlipProtocol';
```

- [ ] **Step 2: Reorder `createGameStore` to create coin flip before listener factories**

**Critical ordering:** The listener factories are currently invoked at line 193, before the port block at line 195. Since `createGameCommandListenerFactory` destructures `coinFlip` at factory invocation time, the coin flip must exist before the factories run.

Reorder `createGameStore` so the port block (coin flip creation + game message handler) runs **before** the listener factory invocation:

```typescript
export const createGameStore = (config?: GameStoreConfig): GameStore => {
  let state = initialGameState;
  const subscribers = new Set<() => void>();
  const actionListeners = new Set<GameListenerFn>();

  const store: GameStore = {
    getState: () => state,
    subscribe: (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); },
    addListener: (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); },
    dispatch: (action: GameAction) => { /* replaced below */ void action; },
  };

  const baseDispatch: Dispatch = (action) => {
    const prevState = state;
    state = gameReducer(state, action);
    subscribers.forEach(fn => fn());
    actionListeners.forEach(fn => fn(action, {prevState, state, dispatch: (a) => store.dispatch(a), getState: () => state}));
  };

  store.dispatch = baseDispatch;

  let coinFlip: CoinFlipProtocol | undefined;

  if (config?.port) {
    coinFlip = createCoinFlipProtocol({
      sendToPeer: config.port.sendToPeer,
      getOffererPeerIds: () => selectOffererPeerIds(state),
      dispatch: (action) => store.dispatch(action),
    });
    config.port.subscribe((event) => {
      if (event.type === 'PEER_MESSAGE') coinFlip!.handleMessage(event.peerId, event.data);
    });

    const gameMessageHandler = createGameMessageHandler({
      dispatch: (action) => store.dispatch(action),
      getP2pGame: () => selectP2pGame(state),
      getBoard: () => selectBoard(state),
      getOffererPeerIds: () => selectOffererPeerIds(state),
      sendToPeer: config.port.sendToPeer,
      translatePeerId: config.translatePeerId,
    });
    config.port.subscribe(gameMessageHandler);
  }

  // Listener factories invoked AFTER coin flip exists so they can capture it
  const listenerDeps: ListenerFactoryDeps = {dispatch: (action) => store.dispatch(action), getState: () => state, port: config?.port, dispatchToConnection: config?.dispatchToConnection, getPeerToSignaling: config?.getPeerToSignaling, coinFlip};
  config?.listenerFactories?.forEach(factory => store.addListener(factory(listenerDeps)));

  return store;
};
```

- [ ] **Step 3: Run all game store tests**

Run: `cd applications/web-client && npm run test:watch -- src/game/gameStore.test.ts`
Expected: PASS (existing tests should not break)

- [ ] **Step 4: Commit**

```bash
git add applications/web-client/src/game/gameStore.ts
git commit -m "feat: #83 wire coin flip protocol into game store"
```

---

## Task 3: Update GameLobby to dispatch to game store

**Files:**
- Modify: `src/game/GameLobby.tsx:1-3,48`

- [ ] **Step 1: Change the "Flip coin" button**

In `GameLobby.tsx`:
- Remove the import of `claimFirstTurn` from `../connections/connectionActions` (line 2)
- Add `claimFirstTurn` to the `gameActions` import (line 3): `import {takeFirstTurn, p2pBoardReady, claimFirstTurn} from './gameActions';`
- Change line 48 from `store.dispatch(claimFirstTurn())` to `gameStore.dispatch(claimFirstTurn())`
- Remove `import {useConnectionStore} from '../connections/useConnection';` (line 1) if no longer used
- Remove `const store = useConnectionStore();` (line 16) if no longer used

- [ ] **Step 2: Run GameLobby tests**

Run: `cd applications/web-client && npm run test:watch -- src/game/GameLobby.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add applications/web-client/src/game/GameLobby.tsx
git commit -m "feat: #83 GameLobby dispatches claimFirstTurn to game store"
```

---

## Task 4: Remove coin flip from connection layer

**Files:**
- Modify: `src/connections/connectionHandler.ts:24,97-98,231-232,386-434,560-573` (remove coin flip)
- Modify: `src/connections/connectionStore.ts:127-174` (remove dispatchGameAction block + dead code)
- Modify: `src/connections/connections.ts:118-119` (remove from ConnectionsAction)
- Modify: `src/connections/connectionActions.ts:89-90` (remove action creators)

- [ ] **Step 1: Remove coin flip from connectionHandler.ts**

Remove these pieces:
1. `| { type: 'START_COIN_FLIP'; peerId: string }` from `PeerCommand` (line 24)
2. `coinFlipCommitDecoder` and `coinFlipRevealDecoder` (lines 97-98)
3. `PendingCoinFlip` type and `pendingCoinFlips` map (lines 231-232)
4. The `.or(() => maybe(coinFlipCommitDecoder.decode(parsed))` block (lines 386-398)
5. The `.or(() => maybe(coinFlipRevealDecoder.decode(parsed))` block (lines 400-434)
6. The `case 'START_COIN_FLIP':` block (lines 560-573)
7. Remove `hashValue` from the import at line 45
8. Remove `turnOrderDecided` from the import at line 46

- [ ] **Step 2: Remove dispatchGameAction and dead code from connectionStore.ts**

In `createHandlerListener` (lines 127-174), the `dispatchGameAction` block and supporting code become dead after this extraction. Remove:

1. Lines 160-172: the `if (dispatchHandlerCommand(action)) return;` + `getGame()` + `opponentId` + `dispatchGameAction` block
2. Replace with just: `dispatchHandlerCommand(action);`
3. Line 133: `const getGame = () => getGameState ? selectGameStoreP2pGame(getGameState()) : null;` — only used by the removed block. **Remove it.**
4. The `getGameState` parameter in `HandlerListenerConfig` — check if used elsewhere in the file. If only used by `getGame`, remove it from the config type and the destructuring.
5. The `selectGameStoreP2pGame` import — if only used by `getGame`, remove it.
6. The `TURN_ORDER_DECIDED` import from `connectionActions` if only used by the removed block.

After these removals, `createHandlerListener` should no longer need game state access — it handles only transport commands and peer lifecycle events.

- [ ] **Step 3: Remove from connections.ts**

Remove from `ConnectionsAction` union (lines 118-119):

```typescript
  | {type: 'CLAIM_FIRST_TURN'}
  | {type: 'TURN_ORDER_DECIDED'; iGoFirst: boolean}
```

- [ ] **Step 4: Remove from connectionActions.ts**

Remove lines 89-90:

```typescript
export const claimFirstTurn = () => ({type: 'CLAIM_FIRST_TURN' as const});
export const turnOrderDecided = (iGoFirst: boolean) => ({type: 'TURN_ORDER_DECIDED' as const, iGoFirst});
```

- [ ] **Step 5: Run TypeScript type check + lint**

Run: `cd applications/web-client && npm run lint`
Expected: No errors. If there are type errors from removed references, fix them (check for remaining imports of `claimFirstTurn` or `turnOrderDecided` from `connectionActions`).

- [ ] **Step 6: Commit**

```bash
git add applications/web-client/src/connections/connectionHandler.ts applications/web-client/src/connections/connectionStore.ts applications/web-client/src/connections/connections.ts applications/web-client/src/connections/connectionActions.ts
git commit -m "feat: #83 remove coin flip protocol from connection layer"
```

---

## Task 5: Remove coin flip tests from connection store + add integration test

**Files:**
- Modify: `src/connections/connectionStore.handler.test.ts:447-545` (remove coin flip describe block)
- Modify: `src/game/coinFlipProtocol.test.ts` (add integration test through game store)

- [ ] **Step 1: Remove coin flip describe block from handler test**

Remove the `describe('coin flip', ...)` block (approximately lines 447-545 — read the file to verify exact boundaries). These tests dispatch `claimFirstTurn()` via the connection store, which no longer handles it.

Keep the `describe('direct turn claim', ...)` block (approximately lines 548-599) — those test `TAKE_FIRST_TURN` which already lives in the game store.

- [ ] **Step 2: Remove unused imports from handler test**

Remove `claimFirstTurn` from the import on line 5 if no other tests use it. Check `turnOrderDecided` too — it may still be used by other tests (grep the file).

- [ ] **Step 3: Add integration test through game store**

Add an integration test to `coinFlipProtocol.test.ts` (or `gameStore.test.ts`) that exercises the full round-trip through a real game store with a connection port — similar to how `makePair()` works in the handler tests. This replaces the lost integration coverage. The test should:

1. Create a game store with a real connection port and the coin flip listener
2. Set up a P2P game in `selecting-turn` phase
3. Dispatch `claimFirstTurn()` to the game store
4. Simulate the peer's response through the port
5. Verify `TURN_ORDER_DECIDED` reaches the game state

- [ ] **Step 4: Run full test suite**

Run: `cd applications/web-client && npm test`
Expected: tsc, eslint, and vitest all pass.

- [ ] **Step 5: Commit**

```bash
git add applications/web-client/src/connections/connectionStore.handler.test.ts applications/web-client/src/game/coinFlipProtocol.test.ts
git commit -m "feat: #83 move coin flip tests to game module"
```

---

## Task 6: Verify and push

- [ ] **Step 1: Run full test suite one more time**

Run: `cd applications/web-client && npm test`
Expected: All pass (tsc + eslint + vitest)

- [ ] **Step 2: Run e2e tests**

Build the backend jar first, then run e2e:

```bash
./gradlew :applications:signaling-server:bootJar
cd applications/web-client && npm run e2e
```

Expected: All e2e tests pass.

- [ ] **Step 3: Push and watch CI**

```bash
git push
```

Watch the CI run to completion. If it fails, diagnose and fix.
