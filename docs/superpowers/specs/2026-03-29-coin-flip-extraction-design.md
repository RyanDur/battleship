# Coin Flip Protocol Extraction

## Problem

The commit-reveal coin flip protocol (~80 lines) lives in `connectionHandler.ts` — a transport module. It's a game mechanic (decides turn order) that should live in `src/game/`. Extracting it completes #83 and removes the last game logic from the connection layer.

## Design

### New module: `src/game/coinFlipProtocol.ts`

A standalone module that owns the entire coin flip lifecycle.

**Factory signature:**

```typescript
type CoinFlipDeps = {
  sendToPeer: (peerId: string, message: unknown) => void
  getOffererPeerIds: () => string[]
  dispatch: (action: GameAction) => void
}

type CoinFlipProtocol = {
  start: (peerId: string) => void
  handleMessage: (peerId: string, data: unknown) => void
}

export const createCoinFlipProtocol: (deps: CoinFlipDeps) => CoinFlipProtocol
```

**Internal state:** `pendingCoinFlips: Map<string, PendingCoinFlip>` in the closure.

**`start(peerId)`:** Stores the pending entry **synchronously** with `iInitiated: true` and `revealSent: false` before hashing — this is critical because a peer's COMMIT can arrive while our hash is still computing. Then calls `hashValue` (which returns `AsyncResult`) asynchronously; on success, guards against the simultaneous case (`if (!existing || existing.revealSent) return`) before sending `COIN_FLIP_COMMIT` via `sendToPeer`.

**`handleMessage(peerId, data)`:** Attempts to decode as `COIN_FLIP_COMMIT` or `COIN_FLIP_REVEAL` using schemawax decoders. **Silently returns (no-op) if neither decoder matches** — the port subscription delivers all peer messages, not just coin flip messages. Implements the same commit-reveal protocol currently in connectionHandler:
- On COMMIT: if simultaneous (existing initiated entry), offerer yields initiator role. Otherwise generate value and reveal immediately.
- On REVEAL: verify hash if opponent committed one. XOR values, use offerer/answerer role for direction. Dispatch `turnOrderDecided(iGoFirst)`.

**Concurrent flips:** The `pendingCoinFlips` map is keyed by peerId, so concurrent flips with different peers are naturally isolated.

### Wiring in `createGameStore`

The coin flip protocol is created during game store setup and wired two ways:

1. **Port subscription** — subscribes to `port.subscribe` for `PEER_MESSAGE` events, calls `coinFlip.handleMessage(peerId, data)` for each.
2. **Game command listener** — `CLAIM_FIRST_TURN` handler calls `coinFlip.start(prevGame.opponentId)`.
3. **Dependencies** — `sendToPeer` comes from `port.sendToPeer` (routes through the handler's `SEND_TO_PEER` command, functionally equivalent to direct channel access). `getOffererPeerIds` comes from `selectOffererPeerIds(store.getState())` (already tracked in game state).

### Removals from connection layer

1. **connectionHandler.ts:**
   - Remove `START_COIN_FLIP` from `PeerCommand` union type
   - Remove `coinFlipCommitDecoder` and `coinFlipRevealDecoder`
   - Remove `PendingCoinFlip` type and `pendingCoinFlips` map
   - Remove `COIN_FLIP_COMMIT` and `COIN_FLIP_REVEAL` handling from `onMessage`
   - Remove `START_COIN_FLIP` case from `handleCommand` switch
   - Remove `hashValue` and `turnOrderDecided` imports

2. **connectionStore.ts:**
   - Remove `CLAIM_FIRST_TURN` handler from `dispatchGameAction` dispatch map
   - Remove `TURN_ORDER_DECIDED` handler from `dispatchGameAction` dispatch map
   - Remove `dispatchGameAction` entirely (empty after above)

3. **connections.ts:**
   - Remove `CLAIM_FIRST_TURN` from `ConnectionsAction` union type

4. **connectionActions.ts:**
   - Remove `claimFirstTurn` action creator (game version in `gameActions.ts` already exists)
   - Remove `turnOrderDecided` action creator (game version in `gameActions.ts` already exists)

### UI change

**GameLobby.tsx:** "Flip coin" button dispatches `claimFirstTurn()` from `gameActions` to `gameStore` instead of from `connectionActions` to `connectionStore`.

### Tests

- **New test file:** `coinFlipProtocol.test.ts` — unit tests for the protocol:
  - Normal flow: initiator commits, responder reveals, initiator reveals, turn resolved
  - Simultaneous flip: both commit, offerer yields initiator role
  - Hash mismatch: cheater gets second turn as penalty
  - Hash computation failure: falls back to opponent goes first
  - Disconnect during pending flip: stale entry overwritten on new flip (document behavior)

- **Existing tests:** `connectionStore.handler.test.ts` has coin flip tests in the `describe('coin flip')` block (~lines 478-545). These should be adapted to test through the game store instead. The separate `describe('direct turn claim')` tests (~lines 548-599) test `TAKE_FIRST_TURN` which already lives in `gameStore` — not part of this extraction.

## Non-goals

- Transport module extraction (iteration 9)
- Changing the coin flip protocol itself (same commit-reveal mechanics)
