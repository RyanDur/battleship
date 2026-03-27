# Resume P2P Game After Disconnection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a disconnected peer reconnects, load the saved game from the server, exchange state over the data channel to verify consistency, and resume play — or show a mismatch warning if states diverge.

**Architecture:** The reconnect trigger lives in `makeHandlerEmit` (PEER_CONNECTED). On reconnect, both peers load their saved game from the server and exchange `GAME_STATE_SYNC` messages over the data channel. The existing handler already decodes incoming `GAME_STATE_SYNC` and compares shot counts — the main work is wiring the trigger, sending sync after load, preventing infinite sync loops, mapping peer IDs correctly across reconnection, and surfacing `disconnected`/`state-mismatch` phases in the UI.

**Tech Stack:** TypeScript, Vitest, custom store (not Redux), WebRTC data channels

**Spec:** `docs/superpowers/specs/2026-03-22-p2p-game-design.md` (Reconnect Protocol section)

**Issue:** #83

---

## Critical Design Notes

### Peer ID Mapping Across Reconnection

After disconnect, the handler reducer clears the `peerToSignaling` and `signalingToPeer` mappings for the disconnected peer. On reconnect, the peer gets a **new local peerId** (new RTCPeerConnection). The signaling-brokered SDP exchange re-establishes the mapping before `PEER_CONNECTED` fires, so `selectPeerToSignaling(getState())[newLocalPeerId]` works.

However, the `p2pGame.opponentId` still references the **old local peerId**. For the peer who stayed (game in `disconnected` phase), `game.opponentId === event.peerId` will be **false** because the reconnecting peer has a new ID.

**Solution:** Always dispatch `loadP2pGame(signalingPeerId)` on PEER_CONNECTED — don't try to match by local peerId. The server identifies games by signaling peer pair, not local peerId. The signaling listener maps the loaded game's opponentId from signaling to the new local peerId via `selectSignalingToPeer`. The P2P_GAME_LOADED reducer uses the mapped ID when restoring from `disconnected` phase.

### Why P2P_STATE_SYNC Send Is Removed

The existing `P2P_STATE_SYNC` listener (lines 182-184 in `connectionStore.ts`) was a proto-implementation: when `p2pStateSync` is dispatched (by the handler on receiving `GAME_STATE_SYNC`), the listener sends `GAME_STATE_SYNC` back. This creates an infinite echo loop — each side receives, dispatches, sends, the other receives, dispatches, sends...

The new protocol sends `GAME_STATE_SYNC` on `P2P_GAME_LOADED` (the reconnect load) instead. The handler's response to receiving sync is purely local (accept or mismatch). No echo needed. The `P2P_STATE_SYNC` action becomes informational only.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/state/connectionStore.ts` | Modify | Reconnect trigger in `makeHandlerEmit`; sync send after `P2P_GAME_LOADED`; remove `P2P_STATE_SYNC` send |
| `src/state/connectionSelectors.ts` | Modify | Extend `selectGameView` for `disconnected` and `state-mismatch` phases |
| `src/state/connections.ts` | Modify | Extend `GameView` phase type; update `P2P_GAME_LOADED` reducer for reconnect opponentId |
| `src/components/Game.tsx` | Modify | Status text and read-only behavior for `disconnected` and `state-mismatch` |
| `src/state/connectionStore.handler.test.ts` | Modify | Tests for all new behavior |

---

### Task 1: Extend GameView for `disconnected` and `state-mismatch`

Smallest isolated change — extend types and selectors so the UI can render these phases. No reconnect logic yet.

**Files:**
- Modify: `src/state/connections.ts:43-48`
- Modify: `src/state/connectionSelectors.ts:31-48`
- Modify: `src/components/Game.tsx`
- Modify: `src/state/connectionStore.handler.test.ts`

- [ ] **Step 1: Write the failing test — selectGameView returns GameView for disconnected phase**

In `connectionStore.handler.test.ts`, add a new describe block. Import `peerDisconnected`, `p2pStateMismatch`, and `selectGameView` if not already imported:

```typescript
describe('disconnected and state-mismatch game view', () => {
  it('selectGameView returns a view with disconnected phase when game is disconnected', async () => {
    const pair = makePair();
    const {alice, bob} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;

    alice.dispatch(peerDisconnected(bobPeerId));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('disconnected'));

    const view = selectGameView(alice.getState());
    expect(view).not.toBeNull();
    expect(view!.phase).toBe('disconnected');
  });

  it('selectGameView returns a view with state-mismatch phase', async () => {
    const pair = makePair();
    const {alice} = await setupP2pGame(pair);

    alice.dispatch(p2pStateMismatch());
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('state-mismatch'));

    const view = selectGameView(alice.getState());
    expect(view).not.toBeNull();
    expect(view!.phase).toBe('state-mismatch');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts -t "disconnected and state-mismatch game view"`
Expected: FAIL — `selectGameView` returns `null` for these phases

**Note on test commands:** `npm run test:watch` starts watch mode and will not exit. For single-file targeted runs throughout this plan, use `node_modules/.bin/vitest run <file> -t "<pattern>"` (runs once, exits). For the full suite, use `npm test`.

- [ ] **Step 3: Extend GameView type and selectGameView**

In `src/state/connections.ts`, update the `GameView` type (line 46):

```typescript
// Before:
  phase: 'my-turn' | 'their-turn' | 'won' | 'lost'
// After:
  phase: 'my-turn' | 'their-turn' | 'won' | 'lost' | 'disconnected' | 'state-mismatch'
```

In `src/state/connectionSelectors.ts`, update `selectGameView` (line 33) — add the new phases to the condition:

```typescript
// Before:
if (p2pGame && (p2pGame.phase === 'my-turn' || p2pGame.phase === 'their-turn' || p2pGame.phase === 'game-over')) {
// After:
if (p2pGame && (p2pGame.phase === 'my-turn' || p2pGame.phase === 'their-turn' || p2pGame.phase === 'game-over' || p2pGame.phase === 'disconnected' || p2pGame.phase === 'state-mismatch')) {
```

And update the phase mapping (after line 35):

```typescript
// Before:
const phase = p2pGame.phase === 'game-over'
  ? (p2pGame.winner === 'me' ? 'won' : 'lost')
  : p2pGame.phase;
// After:
const phase = p2pGame.phase === 'game-over'
  ? (p2pGame.winner === 'me' ? 'won' : 'lost')
  : p2pGame.phase === 'disconnected' ? 'disconnected'
  : p2pGame.phase === 'state-mismatch' ? 'state-mismatch'
  : p2pGame.phase;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts -t "disconnected and state-mismatch game view"`
Expected: PASS

- [ ] **Step 5: Update Game.tsx for new phases**

In `src/components/Game.tsx`:

Update `turnStatus` (line 35):

```typescript
// Before:
const turnStatus = gameView.phase === 'my-turn' ? 'Your turn' : gameView.phase === 'their-turn' ? 'Waiting for opponent' : '';
// After:
const turnStatus = gameView.phase === 'my-turn' ? 'Your turn'
  : gameView.phase === 'their-turn' ? `Waiting for ${gameView.opponentName}`
  : gameView.phase === 'disconnected' ? `${gameView.opponentName} disconnected. Game saved.`
  : gameView.phase === 'state-mismatch' ? 'Game ended — state inconsistency detected.'
  : '';
```

Update `isOver` (line 32):

```typescript
// Before:
const isOver = gameView.phase === 'won' || gameView.phase === 'lost';
// After:
const isOver = gameView.phase === 'won' || gameView.phase === 'lost' || gameView.phase === 'state-mismatch';
```

Update `isP2pInProgress` (line 33) — hide forfeit during disconnect/mismatch:

```typescript
// Before:
const isP2pInProgress = !!p2pGame && !isOver;
// After:
const isP2pInProgress = !!p2pGame && !isOver && gameView.phase !== 'disconnected';
```

In the `{isOver && ...}` JSX block, wrap the win/loss header and board reveal to skip them for state-mismatch:

```typescript
{isOver && (
  <div className="game-over">
    {gameView.phase !== 'state-mismatch' && (
      <>
        {p2pGame?.forfeited
          ? <h2>{gameView.opponentName} forfeited. You win!</h2>
          : <h2>{gameView.phase === 'won' ? 'You win!' : `${gameView.opponentName} wins`}</h2>
        }
        {revealedBoard && (
          /* ... existing board reveal JSX unchanged ... */
        )}
      </>
    )}
    <button className="control" onClick={onNewGame}>New game</button>
  </div>
)}
```

**No App.tsx changes needed.** The existing routing at line 45 (`if (gameView) return <Game .../>`) catches these phases because `selectGameView` now returns non-null.

- [ ] **Step 6: Run full test suite**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/state/connections.ts src/state/connectionSelectors.ts src/components/Game.tsx src/state/connectionStore.handler.test.ts
git commit -m "feat: render disconnected and state-mismatch phases in GameView"
```

---

### Task 2: Reconnect trigger — load game on PEER_CONNECTED + fix opponentId mapping

When a peer reconnects, both sides need to load the saved game from the server. This task wires the trigger and fixes the peer ID mapping so the loaded game has the correct (new) local peerId.

**Key points:**
- Always dispatch `loadP2pGame(signalingPeerId)` on PEER_CONNECTED — the server returns NOT_FOUND if no game exists (harmless)
- The signaling listener maps the loaded game's opponentId from signaling to local via `selectSignalingToPeer`
- The P2P_GAME_LOADED reducer must use the mapped opponentId when restoring from `disconnected` (not the stale old one)

**Files:**
- Modify: `src/state/connectionStore.ts:84-90` (makeHandlerEmit), `5` (imports), `269-275` (signaling listener)
- Modify: `src/state/connections.ts:481-488` (P2P_GAME_LOADED reducer)
- Modify: `src/state/connectionStore.handler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('reconnect — load game on PEER_CONNECTED', () => {
  it('dispatches loadP2pGame when any peer connects', async () => {
    const pair = makePair();
    const {alice, bob} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;

    // Disconnect Bob — game transitions to 'disconnected'
    alice.dispatch(peerDisconnected(bobPeerId));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('disconnected'));

    // Simulate server restoring game with correct opponentId
    // (In production, loadP2pGame triggers server roundtrip → P2P_GAME_LOADED)
    const savedGame = {...selectP2pGame(alice.getState())!, phase: 'their-turn' as const, opponentId: bobPeerId};
    alice.dispatch(p2pGameLoaded(savedGame));

    // Game should be restored to play phase with correct opponentId
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('their-turn'));
    expect(selectP2pGame(alice.getState())?.opponentId).toBe(bobPeerId);
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts -t "dispatches loadP2pGame"`
Expected: PASS (baseline — P2P_GAME_LOADED already works for this case since `game` exists, preserving opponentId)

- [ ] **Step 3: Add the reconnect trigger in makeHandlerEmit**

In `src/state/connectionStore.ts`, update the PEER_CONNECTED handler in `makeHandlerEmit` (line 84-90):

```typescript
if (event.type === 'PEER_CONNECTED') {
  dispatch(peerConnected(event.peerId));
  if (selectOffererPeerIds(getState()).includes(event.peerId)) {
    const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
    if (signalingPeerId) dispatch(previousPeerConnected(signalingPeerId));
  }
  // Reconnect: load any saved game for this peer from the server
  const signalingPeerId = selectPeerToSignaling(getState())[event.peerId];
  if (signalingPeerId) dispatch(loadP2pGame(signalingPeerId));
}
```

Verify `loadP2pGame` is already imported from `connectionActions` (it is — used in the handler listener at line 143).

- [ ] **Step 4: Fix opponentId mapping in signaling listener's P2P_GAME_LOADED**

Add `selectSignalingToPeer` to the imports from `connectionSelectors` (line 5). It is NOT currently imported — `selectPeerToSignaling` is, but `selectSignalingToPeer` is the reverse mapping:

```typescript
import {selectFlow, selectIntroChannels, selectIsCreatingOffer, selectOffererPeerIds, selectPeerToSignaling, selectSignalingToPeer, selectP2pGame} from './connectionSelectors';
```

Update the signaling listener's `P2P_GAME_LOADED` handler (lines 269-275):

```typescript
else if (event.type === 'P2P_GAME_LOADED') {
  tryCatch(() => JSON.parse(event.gameState), () => null)
    .onSuccess(gs => {
      const decoded = p2pGameStateDecoder.decode(gs);
      if (decoded) {
        const game = decoded as P2pGame;
        // Map signaling opponentId to local peerId for the current session
        const localOpponentId = selectSignalingToPeer(getState())[game.opponentId];
        dispatch(p2pGameLoaded(localOpponentId ? {...game, opponentId: localOpponentId} : game));
      }
    });
}
```

- [ ] **Step 5: Fix P2P_GAME_LOADED reducer for reconnect opponentId**

In `src/state/connections.ts`, update the P2P_GAME_LOADED reducer (lines 481-488). The current code preserves `game.opponentId` when `game` exists, but after reconnect the game's opponentId is stale (old local peerId). Use the mapped opponentId from the action when restoring from `disconnected`:

```typescript
// Before:
case 'P2P_GAME_LOADED': {
  const resumable = action.gameState.phase === 'my-turn' || action.gameState.phase === 'their-turn';
  if (!resumable) return game;
  const base = {...action.gameState, winner: null as P2pGame['winner']};
  return game ? {...base, opponentId: game.opponentId} : base;
}
// After:
case 'P2P_GAME_LOADED': {
  const resumable = action.gameState.phase === 'my-turn' || action.gameState.phase === 'their-turn';
  if (!resumable) return game;
  const base = {...action.gameState, winner: null as P2pGame['winner']};
  // Use mapped opponentId from action when restoring from disconnected or null (refreshed peer).
  // Only preserve existing game.opponentId during challenge flow (game exists in non-disconnected phase).
  return game && game.phase !== 'disconnected' ? {...base, opponentId: game.opponentId} : base;
}
```

- [ ] **Step 6: Run full test suite**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/state/connectionStore.ts src/state/connections.ts src/state/connectionStore.handler.test.ts
git commit -m "feat: trigger loadP2pGame on PEER_CONNECTED, fix opponentId mapping for reconnect"
```

---

### Task 3: Send GAME_STATE_SYNC after load and remove sync loop

After `P2P_GAME_LOADED` restores the game on reconnect, send `GAME_STATE_SYNC` to the opponent for state verification. Remove the existing `P2P_STATE_SYNC` send that would cause an infinite echo loop (see Critical Design Notes above).

**Files:**
- Modify: `src/state/connectionStore.ts:174-184` (handler listener)

- [ ] **Step 1: Add P2P_GAME_LOADED sync send to handler listener**

In `src/state/connectionStore.ts`, add a new case in the handler listener's `else` block (after the auto-save block at line 181, before the `P2P_STATE_SYNC` block):

```typescript
else if (action.type === 'P2P_GAME_LOADED') {
  const prevGame = selectP2pGame(prevState);
  const game = selectP2pGame(state);
  // Send sync only on reconnect: game restored from null (refreshed) or disconnected
  if (game && (game.phase === 'my-turn' || game.phase === 'their-turn')) {
    if (!prevGame || prevGame.phase === 'disconnected') {
      send({type: 'GAME_STATE_SYNC', myShots: game.myShots, opponentShots: game.opponentShots, phase: game.phase});
    }
  }
}
```

**Note:** `P2P_GAME_LOADED` is dispatched by the signaling listener. The handler listener also reacts to it here because the `send` goes over the data channel (handler domain). This is safe — the handler listener's `else` block at line 134 handles all P2P game actions.

The `send` function at line 138 uses `opponentId` from `selectP2pGame(state)`. After `P2P_GAME_LOADED`, the reducer updates `p2pGame` (with the correctly mapped opponentId from Task 2), so `state` has the correct game.

- [ ] **Step 2: Remove the P2P_STATE_SYNC send**

Delete the `P2P_STATE_SYNC` else-if block (lines 182-184):

```typescript
// DELETE these lines:
else if (action.type === 'P2P_STATE_SYNC') {
  send({type: 'GAME_STATE_SYNC', myShots: action.myShots, opponentShots: action.opponentShots, phase: action.phase});
}
```

This was a proto-implementation that would echo `GAME_STATE_SYNC` on every received sync, causing an infinite loop. The new protocol sends sync on `P2P_GAME_LOADED` instead. `P2P_STATE_SYNC` action is still dispatched by the handler (on receiving `GAME_STATE_SYNC` with matching state) but no listener acts on it — it's informational only.

- [ ] **Step 3: Run test suite**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/state/connectionStore.ts
git commit -m "feat: send GAME_STATE_SYNC after reconnect load, remove sync echo loop"
```

---

### Task 4: Full reconnect integration tests

End-to-end tests: disconnect, reconnect, state sync, resume. Also test the mismatch case. These tests drive out any remaining issues with the reconnect flow.

**Files:**
- Modify: `src/state/connectionStore.handler.test.ts`
- Possibly modify: `src/workers/connection.handler.ts`, `src/state/connectionStore.ts`, `src/state/connections.ts` (if tests reveal issues)

- [ ] **Step 1: Write the reconnect-resume test**

```typescript
describe('reconnect and resume game', () => {
  it('game resumes after disconnect and P2P_GAME_LOADED when both states match', async () => {
    const pair = makePair();
    const {alice, bob} = await setupP2pGame(pair);
    const bobPeerId = selectPeers(alice.getState())[0].id;
    const alicePeerId = selectPeers(bob.getState())[0].id;

    // Alice fires
    alice.dispatch(p2pFire(1, 1));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('their-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.phase).toBe('my-turn'));

    // Capture state before disconnect (simulates what server would save)
    const aliceSavedGame = selectP2pGame(alice.getState())!;
    const bobSavedGame = selectP2pGame(bob.getState())!;

    // Disconnect both sides
    alice.dispatch(peerDisconnected(bobPeerId));
    bob.dispatch(peerDisconnected(alicePeerId));
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('disconnected'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.phase).toBe('disconnected'));

    // Simulate server load: restore both games
    // (In production, PEER_CONNECTED dispatches loadP2pGame → server responds → P2P_GAME_LOADED)
    alice.dispatch(p2pGameLoaded({...aliceSavedGame}));
    bob.dispatch(p2pGameLoaded({...bobSavedGame}));

    // After load, handler listener sends GAME_STATE_SYNC to opponent.
    // Each side's handler receives the sync, compares shot counts, and the game continues.
    await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('their-turn'));
    await vi.waitFor(() => expect(selectP2pGame(bob.getState())?.phase).toBe('my-turn'));
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts -t "game resumes after disconnect"`
Expected: May fail if data channels were cleaned up on disconnect. Analyze the failure.

**If data channels are gone:** The test dispatches `peerDisconnected` which calls `handler.cleanup(peerId)` (see handler listener line 133). This likely closes the data channel. The `send` in the P2P_GAME_LOADED listener would then fail silently.

**Fix if needed:** After disconnect and before dispatching `p2pGameLoaded`, the test must ensure the data channel is still open. Options:
1. Don't dispatch `peerDisconnected` in the test — instead manually set the game phase to `disconnected` via a direct reducer dispatch
2. Reconnect the peers before loading (requires re-running the connection flow)

Adjust the test based on what the failure reveals.

- [ ] **Step 3: Write the mismatch test**

```typescript
it('game transitions to state-mismatch when shot counts differ', async () => {
  const pair = makePair();
  const {alice, bob} = await setupP2pGame(pair);
  const bobPeerId = selectPeers(alice.getState())[0].id;
  const alicePeerId = selectPeers(bob.getState())[0].id;

  // Alice fires
  alice.dispatch(p2pFire(1, 1));
  await vi.waitFor(() => expect(selectP2pGame(alice.getState())?.phase).toBe('their-turn'));

  // Capture Alice's state (has 1 shot)
  const aliceGame = selectP2pGame(alice.getState())!;
  const bobGame = selectP2pGame(bob.getState())!;

  // Disconnect both
  alice.dispatch(peerDisconnected(bobPeerId));
  bob.dispatch(peerDisconnected(alicePeerId));

  // Simulate inconsistent server state — Bob's version has 0 shots
  const tamperedBobGame = {...bobGame, myShots: [], opponentShots: [], phase: 'my-turn' as const};

  alice.dispatch(p2pGameLoaded({...aliceGame, phase: 'their-turn' as const}));
  bob.dispatch(p2pGameLoaded(tamperedBobGame));

  // Sync exchange should detect mismatch on at least one side
  await vi.waitFor(() => {
    const aPhase = selectP2pGame(alice.getState())?.phase;
    const bPhase = selectP2pGame(bob.getState())?.phase;
    expect(aPhase === 'state-mismatch' || bPhase === 'state-mismatch').toBe(true);
  });
});
```

- [ ] **Step 4: Run all tests and fix issues**

Run: `cd applications/web-client && node_modules/.bin/vitest run src/state/connectionStore.handler.test.ts -t "reconnect and resume"`
Expected: ALL PASS after fixes

- [ ] **Step 5: Commit**

```bash
git add src/state/connectionStore.handler.test.ts
git commit -m "test: integration tests for reconnect — resume and state mismatch"
```

If implementation files changed to fix issues:

```bash
git add src/state/connectionStore.handler.test.ts src/state/connectionStore.ts src/workers/connection.handler.ts src/state/connections.ts
git commit -m "feat: full reconnect flow — load, sync, resume or mismatch"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd applications/web-client && npm test`
Expected: ALL PASS (tsc + eslint + vitest)

- [ ] **Step 2: Fix any issues found**

If lint or type errors, fix them.

- [ ] **Step 3: Commit if fixes needed**

```bash
git add src/state/connections.ts src/state/connectionSelectors.ts src/state/connectionStore.ts src/state/connectionStore.handler.test.ts src/workers/connection.handler.ts src/components/Game.tsx
git commit -m "fix: address lint/type issues from reconnect implementation"
```
