# Coin Flip Cryptographic Commitment & Fire Guard Fixes

Code review identified two Important issues in the P2P game implementation. This spec addresses both.

## Issue 1: Coin Flip Commitment Is Not Cryptographically Secure

### Problem

The coin flip commit-reveal protocol sends `value.toString(16)` as the "hash" — the hex representation of the raw integer. This is trivially reversible, so a malicious peer can compute the outcome before revealing. The reveal handler also never verifies that the revealed value matches the commitment.

### Fix

Use SHA-256 (via `crypto.subtle`, available in Web Workers) to hash the value for the COMMIT phase. On REVEAL, verify the opponent's value hashes to their commitment. Fall back to "opponent goes first" on verification failure.

### Design

#### New helper: `hashValue`

Add to `src/game/hashBoard.ts` (rename consideration: could become `src/game/crypto.ts`, but keeping it in `hashBoard.ts` avoids file churn for a small addition):

```typescript
export const hashValue = (value: string): AsyncResult<string, Error> =>
  asyncTryCatch(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
  );
```

Same pattern as `hashBoard` — returns `AsyncResult<string, Error>`.

#### Protocol changes in `connection.handler.ts`

**`START_COIN_FLIP` command (initiator, line 641-646):**

1. Generate `myValue = Math.floor(Math.random() * 0xFFFFFFFF)`
2. `hashValue(myValue.toString())` → on success, store `{opponentHash: '', myValue, myHash: hash, iInitiated: true, revealSent: false}` in `pendingCoinFlips` and send `{type: 'COIN_FLIP_COMMIT', hash}`
3. On hash failure, do not send (flip silently fails; opponent times out or retries)

**`COIN_FLIP_COMMIT` handler (non-initiator receiving commit, line 436-449):**

- **Normal case (no existing flip):** Generate `myValue`, hash it, store in `pendingCoinFlips`, send `COIN_FLIP_REVEAL` with raw value. The hashing is async so the reveal send moves into the `.onSuccess` callback.
- **Simultaneous case (existing flip with `iInitiated`):** Same as today — use hash string comparison for deterministic role assignment, send reveal. Hashes are now real SHA-256 digests so comparison is fair.

**`COIN_FLIP_REVEAL` handler (receiving opponent's raw value, line 451-463):**

1. Look up `pendingCoinFlips` entry, delete it
2. If initiator and haven't sent reveal yet, send own reveal
3. **New: verify opponent's value.** `hashValue(msg.value.toString())` → compare result against stored `opponentHash`
4. On **match**: XOR values, mod 2, assign turns (same logic as today)
5. On **mismatch or hash failure**: opponent goes first (graceful fallback — `dispatch(turnOrderDecided(false))`)

#### `PendingCoinFlip` type

No structural change. `myHash` and `opponentHash` become real SHA-256 hex strings instead of trivially reversible hex values.

#### Non-initiator flow change

Currently the non-initiator sends `COIN_FLIP_REVEAL` (raw value) immediately upon receiving `COIN_FLIP_COMMIT`. This is correct per the commit-reveal protocol — the non-initiator doesn't need to commit because the initiator already committed and can't change their value. The non-initiator just picks a value and reveals it.

However, hashing is now required for the simultaneous case (where the non-initiator discovers they also sent a COMMIT). The normal non-initiator path does NOT need to hash — they only need to store `opponentHash` and reveal their raw value.

## Issue 2: Missing Sender-Side Phase Guard on P2P_FIRE

### Problem

The outgoing `P2P_FIRE` handler in `connectionStore.ts` (line 166-171) checks for duplicate shots but not the current phase. Rapid clicks before a `FIRE_RESULT` arrives could send multiple FIRE messages for different cells in the same turn.

The receiver guards against this (line 469: `if (game.phase !== 'their-turn') return;`), but defense-in-depth on the sender side prevents unnecessary network traffic and makes the intent explicit.

### Fix

Add a phase check before the duplicate-shot check in the `connectionStore.ts` listener:

```typescript
else if (action.type === 'P2P_FIRE') {
  const prevGame = selectP2pGame(prevState);
  if (prevGame?.phase !== 'my-turn') return;
  if (!prevGame.myShots.some(s => s.cell.row === action.row && s.cell.col === action.col)) {
    send({type: 'FIRE', row: action.row, col: action.col});
  }
}
```

## Testing

### Coin flip tests (in `connectionStore.handler.test.ts`)

- Initiator sends SHA-256 hash (not raw hex value) in COMMIT message
- Non-initiator reveals raw value, stores opponent's hash
- On REVEAL, initiator verifies opponent's value against committed hash
- On hash mismatch at reveal, opponent goes first
- Simultaneous COMMIT uses SHA-256 hashes for role assignment

### Fire guard test (in `connectionStore.handler.test.ts` or `p2pGame.test.ts`)

- Dispatching `P2P_FIRE` when phase is `their-turn` does not send a FIRE message

## Files Changed

- `src/game/hashBoard.ts` — add `hashValue` helper
- `src/workers/connection.handler.ts` — async coin flip commit, reveal verification
- `src/state/connectionStore.ts` — phase guard on P2P_FIRE listener
- `src/state/connectionStore.handler.test.ts` — coin flip and fire guard tests
