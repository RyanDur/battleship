# Story #81: Play Battleship Against a Connected Peer

## Who

Two players connected via P2P who want to play Battleship together.

## Problem

The 1-player game works but there's no way to play against a real person, which is the whole point of a P2P Battleship app.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trust model | Honor system + board hash commitment | Each peer resolves shots against their own board. Board hash committed at game start enables post-game verification. Mid-game cheating is possible (same as physical Battleship) but detectable at game end. |
| Disconnection | Persist and resume with state comparison | Both peers save game state to the server after each turn. On reconnect, states are compared. Mismatch ends the game — serves as a trust/integrity mechanism. |
| Turn order | Player choice or coin flip | Either player can claim first turn or flip a coin. First action wins. Offerer breaks simultaneous ties. |
| Who can play | Any connected peer | Trust system is for introductions, not general trustworthiness. Any connected peer can challenge. |
| Board reuse | Reuse existing or re-place | Player's choice. No forced re-placement between games. |
| Server role | Dumb persistence store | Server stores game state for crash recovery. No game logic for 2-player. |
| Concurrent games | One game at a time | A player can only have one P2P game active (or pending). New challenges are auto-declined while a game is in progress. |

## Constraints

- A player can have at most one P2P game at a time (active or pending challenge). The Challenge button is hidden when a game is active. Incoming challenges are auto-declined with a "busy" response.
- Board hash uses SHA-256 over the canonical serialization: `JSON.stringify(board.placed)` where `placed` is the array of `PlacedShip` objects in placement order. A `hashBoard(board: Board): Promise<string>` utility computes this using the Web Crypto API. Note: `PlacedShip` construction must maintain consistent property order across sessions for deterministic hashing.

---

## Game Protocol

### Phases

```
Challenge --> Placement --> Turn Selection --> Play --> Game Over
                                                |
                                           Disconnect
                                                |
                                      Persist + Reconnect
                                                |
                                         State Compare
                                           /        \
                                      Match        Mismatch
                                        |              |
                                     Resume        Game Ends
```

### Phase Details

1. **Challenge** — either connected peer challenges the other via data channel. Opponent sees an alert with Accept/Decline. Challenger can cancel while waiting.

2. **Placement** — both players place ships (or reuse existing board). Each confirms when ready. Board hash is committed to the opponent at confirmation time.

3. **Turn selection** — either player can claim first turn or flip a coin. Whoever acts first sets the order. If both claim simultaneously, the offerer (connection initiator) wins the tiebreak.

4. **Play** — players alternate firing. Each peer resolves incoming shots against their own board and reports the result (hit/miss/sunk). Shot actions flow over the data channel.

5. **Game over** — when one fleet is sunk, both peers see the result. Full boards are revealed for hash verification.

6. **Disconnect** — game state is persisted to the server after each turn. On reconnect, both peers load their saved state and exchange it. Match resumes; mismatch ends the game.

### Shot Resolution Sequence

When Peer A fires at Peer B:

1. Peer A sends `FIRE {row, col}` over data channel
2. Peer A's phase transitions to `their-turn` (waiting for result)
3. Peer B receives `FIRE`, resolves against their own board locally (hit/miss/sunk)
4. Peer B dispatches `OPPONENT_FIRED` with the resolved result, updating their state
5. Peer B sends `FIRE_RESULT {row, col, result, ship?}` back to Peer A
6. Peer A receives `FIRE_RESULT`, dispatches `P2P_FIRE_RESULT`, updates tracking board
7. Both peers save game state to server (triggered automatically by the listener after shot resolution)
8. Peer B's phase transitions to `my-turn` (their turn to fire)

### Coin Flip Protocol

Either player can initiate a coin flip. The protocol uses commitment to ensure fairness:

1. Player A clicks "Flip Coin", generates a random 32-bit unsigned integer, sends `COIN_FLIP_COMMIT {hash}` (SHA-256 of the string representation of the value)
2. Player B receives the commitment, generates their own random 32-bit unsigned integer, sends `COIN_FLIP_REVEAL {value}` (their raw value as a number)
3. Player A receives B's value, sends `COIN_FLIP_REVEAL {value}` (their raw value as a number)
4. Both peers now have both values. XOR the two integers, take modulo 2. Result 0 = Player A goes first, result 1 = Player B goes first.
5. Both peers verify A's revealed value matches the committed hash. Mismatch = Player A forfeits first-turn choice (B goes first).

If a player clicks "Go First" while the coin flip is in progress, the coin flip is abandoned and the claim is processed normally.

### Reconnect Protocol

When a previously connected peer reconnects and a P2P game exists:

1. On `PEER_CONNECTED`, if `p2pGame` exists for that peer, the listener sends `LOAD_P2P_GAME {opponentId}` to the server
2. Server responds with `P2P_GAME_LOADED {gameState}` or `P2P_GAME_NOT_FOUND`
3. Both peers send `GAME_STATE_SYNC {myShots, opponentShots, phase}` over the data channel
4. Both peers compare: shot histories must match (same cells, same results, same order) and phases must be compatible
5. Match: game resumes from saved state, phase restored
6. Mismatch: game ends, phase transitions to `state-mismatch`

---

## Data Channel Messages (P2P)

All messages are JSON objects with a `type` field, validated by schemawax decoders. These flow over the existing RTCDataChannel between connected peers.

| Message | Payload | Purpose |
|---------|---------|---------|
| `GAME_CHALLENGE` | -- | Invite peer to play |
| `GAME_ACCEPT` | -- | Accept challenge |
| `GAME_DECLINE` | `reason?` | Decline challenge (optional reason: "busy") |
| `GAME_CANCEL` | -- | Cancel pending challenge |
| `BOARD_READY` | `boardHash` | Board confirmed, hash committed |
| `CLAIM_FIRST` | -- | Claim first turn |
| `COIN_FLIP_COMMIT` | `hash` | Commit to a coin flip value |
| `COIN_FLIP_REVEAL` | `value` | Reveal coin flip value |
| `FIRE` | `row, col` | Fire at a cell |
| `FIRE_RESULT` | `row, col, result, ship?` | Shot outcome |
| `GAME_OVER` | `board` | Reveal full board for verification |
| `GAME_FORFEIT` | -- | Player forfeits |
| `GAME_STATE_SYNC` | `myShots, opponentShots, phase` | Exchange state on reconnect |

## WebSocket Messages (Server Persistence)

Same transport as existing board/game operations. Server is a dumb store.

| Message | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `SAVE_P2P_GAME` | client --> server | `opponentId, gameState` | Persist after each turn |
| `LOAD_P2P_GAME` | client --> server | `opponentId` | Load on reconnect |
| `P2P_GAME_LOADED` | server --> client | `gameState` | Saved state returned |
| `P2P_GAME_NOT_FOUND` | server --> client | -- | No saved game |

---

## State and Store

### New State

```typescript
type P2pGamePhase =
  | 'challenged'        // waiting for opponent response
  | 'challenge-received' // opponent challenged us
  | 'placing'           // both accepted, placing ships
  | 'selecting-turn'    // both boards ready, deciding turn order
  | 'my-turn'           // local player fires
  | 'their-turn'        // waiting for opponent to fire
  | 'game-over'         // one fleet sunk or forfeited
  | 'disconnected'      // opponent disconnected, game saved
  | 'state-mismatch'    // reconnect detected inconsistency

type P2pGame = {
  opponentId: string
  phase: P2pGamePhase
  myBoardHash: string
  opponentBoardHash: string | null
  myShots: Shot[]          // shots I fired at opponent
  opponentShots: Shot[]    // shots opponent fired at me
  myBoardReady: boolean
  opponentBoardReady: boolean
  winner: 'me' | 'opponent' | null  // used with game-over phase to derive GameView 'won'/'lost'
}
```

Added to `ConnectionsState` as `p2pGame: P2pGame | null`. Only one game at a time — incoming challenges are auto-declined when `p2pGame` is not null.

### Shared Game View Type

The existing `Game` component uses AI-specific types (`playerShots`, `aiShots`, `player-turn`, `computer-turn`). For both modes to share the same rendering component, define a shared view type:

```typescript
type GameView = {
  myShots: Shot[]           // shots I fired
  opponentShots: Shot[]     // shots fired at me
  phase: 'my-turn' | 'their-turn' | 'won' | 'lost'
  opponentName: string      // "Computer" for AI, peer name for P2P
}
```

A selector adapts each mode's state into `GameView`:
- 1-player: maps `gameState.playerShots` to `myShots`, `gameState.aiShots` to `opponentShots`, maps phases
- 2-player: maps `p2pGame.myShots` to `myShots`, `p2pGame.opponentShots` to `opponentShots`, maps phases

The `Game` component renders from `GameView` without knowing which mode is active.

### New Actions

- Challenge flow: `CHALLENGE_PEER`, `CHALLENGE_RECEIVED`, `ACCEPT_CHALLENGE`, `DECLINE_CHALLENGE`, `CANCEL_CHALLENGE`
- Board ready: `P2P_BOARD_READY`, `OPPONENT_BOARD_READY`
- Turn selection: `CLAIM_FIRST_TURN`, `COIN_FLIP_COMMIT`, `COIN_FLIP_REVEAL`, `TURN_ORDER_DECIDED`
- Gameplay: `P2P_FIRE`, `P2P_FIRE_RESULT`, `OPPONENT_FIRED`, `P2P_GAME_OVER`, `FORFEIT_GAME`, `OPPONENT_FORFEITED`
- Persistence: `SAVE_P2P_GAME`, `LOAD_P2P_GAME`, `P2P_GAME_LOADED`
- Reconnect: `P2P_STATE_SYNC`, `P2P_STATE_MISMATCH`

### Reducer Structure

Extract a `p2pGameReducer` composed into the root reducer, following the existing `handlerReducer` pattern. This keeps the P2P game logic isolated from the core connection state.

### Routing

- **Data channel messages** route through `createHandlerListener` in `connectionStore.ts` (outgoing) and `makeHandlerEmit` (incoming), same as chat.
- **Server persistence** routes through `createSignalingListener`, same as board save/load.
- **Auto-save** triggered by a listener that reacts to `P2P_FIRE_RESULT` and `OPPONENT_FIRED` actions — dispatches `SAVE_P2P_GAME` after each shot resolution.
- **Game logic** lives entirely in the reducer and the peers — the server has none.

### Disconnect Handling

When `PEER_DISCONNECTED` fires and `p2pGame` references that peer:
- Phase transitions to `disconnected`
- Game view becomes read-only (no firing)
- Game state is already persisted (auto-saved after last turn)
- If the peer reconnects (`PEER_CONNECTED`), the reconnect protocol triggers

---

## Handler Refactor

`connection.handler.ts` currently handles connection lifecycle AND application messaging (chat, trust, introductions). Adding the full game protocol would make it unwieldy.

**Split by domain:**
- `connection.handler.ts` — keeps connection lifecycle: create/accept offers, ICE, data channel setup, connect/disconnect, wire channels
- Message routing in `onMessage` delegates to domain-specific handlers based on message type prefix
- Game messages get their own handler that receives parsed messages and emits `PeerEvent`s

This follows the existing pattern (decoders -> emit events) but organized by domain.

---

## Backend Changes

### New Gateway

`P2pGameGateway` — stores game state keyed by sorted peer pair (both peer IDs sorted alphabetically to ensure consistent key regardless of who saves). Same pattern as `GameSessionGateway`.

### New SignalingHandler Cases

- `SAVE_P2P_GAME` — save game state for a peer pair
- `LOAD_P2P_GAME` — load game state for a peer pair (triggered on `REGISTERED` alongside board/game load)

### No Game Logic

The server does not validate shots, resolve hits, or manage turns for 2-player games. It stores and retrieves game state blobs.

### Existing Code Unchanged

The 1-player game engine (`Game.kt`, `fireAt`, `aiFireAt`) stays as-is. The two modes are independent paths.

---

## UX/UI Design

### Design Language

All new UI follows existing patterns: `.control` buttons (transparent bg, accent border, uppercase), `.field` inputs, monospace font, HUD grid layout. No modals — all interactions inline.

### Challenge Flow

**Initiating a challenge:**

The Fleet peer card for each connected peer gains a "Challenge" button alongside the existing Disconnect/Trust/Introduce actions. The button is hidden when a game is already active.

```
Fleet
-------------------------------
Connected peers

  Player              [Challenge] [Disconnect]
  * trusts you
```

After clicking Challenge, the button changes to "Waiting..." (disabled) while the opponent decides.

```
  Player              [Waiting...] [Cancel]
```

**Receiving a challenge:**

The challenge appears as an alert in the Alerts panel, following the existing introduction alert pattern.

```
Alerts (1)
-------------------------------
  Player wants to play Battleship    [Accept] [Decline]
```

If the player is already in a game, the challenge is auto-declined with "busy" and no alert is shown.

### Game Lobby

After a challenge is accepted, the main area (`hud-main`) shows the game lobby. This replaces the "Play vs AI" button or BoardSetup when a P2P game is active.

**States within the lobby:**

Existing board available — player chooses to reuse or re-place:
```
Game vs Player
-------------------------------

  Your board: Ready          Opponent
  [Use This Board]           Waiting...
  [Re-place Ships]
```

No board yet:
```
  Your board: not placed     Opponent
  [Place Ships]              Waiting...
```

Board confirmed, waiting for opponent:
```
  Your board: Ready          Opponent
  (hash: a3f8...)            Waiting...
```

Both boards ready, choosing turns:
```
  Your board: Ready          Opponent: Ready
  (hash: a3f8...)            (hash: 7b2c...)

  ----- Who goes first? -----
  [Go First]   [Flip Coin]
```

Turn decided — game starts immediately.

### Game View (Playing)

The `Game` component renders from the shared `GameView` type. Two 10x10 grids side by side: "Your fleet" (shows incoming shots) and "Tracking board" (shows your shots at opponent).

```
Game vs Player
-------------------------------
[status: Your turn]

  Your fleet                    Tracking board
  +--+--+--+--+--+             +--+--+--+--+--+
  |  |  |  |HH|  |  ...        |  |  |  |  |  |  ...
  +--+--+--+--+--+             +--+--+--+--+--+
  |  |  |  |  |  |  ...        |  |MM|  |  |  |  ...
  ...                           ...

  [Forfeit]
```

When it's the opponent's turn:
```
[status: Waiting for Player...]
```
Tracking board cells are disabled. Your fleet shows incoming shots as they arrive.

Sunk ship announcement (existing pattern):
```
[status: Destroyer sunk!]
```

### Game Over

```
[status: You win! / Player wins]

  Your fleet          Tracking board
  (final state)       (final state)

  Board verification: Passed / FAILED

  [New Game]  [Back to Lobby]
```

Board verification compares the revealed board against the committed hash. "Passed" in accent color, "FAILED" in error color.

### Disconnect During Game

If the opponent disconnects mid-game, the status updates:

```
[status: Player disconnected. Game saved.]
```

The game view stays visible (read-only). When the opponent reconnects and states match:

```
[status: Player reconnected. Resuming...]
```

If states mismatch:

```
[status: Game ended - state inconsistency detected.]

  [New Game]
```

### Responsive Behavior

On mobile (< 768px), the two game boards stack vertically (tracking board on top, fleet below) following the existing responsive pattern in `layout.css`. The lobby stacks its two columns as well.

### Accessibility

- All game cells have `aria-label="Row N, Column N"` (existing pattern)
- Turn status uses `role="status"` with `aria-live="polite"`
- Challenge alerts use `aria-live="assertive"` (existing alert pattern)
- Forfeit button has confirmation (dispatch only after second click or a "Are you sure?" inline toggle)
- Board hash shown as `<abbr>` with full hash in title, truncated display

---

## Testing Strategy

### Unit Tests (Vitest)

- **p2pGameReducer:** all state transitions (challenge flow, placement, turn selection, firing, game over, forfeit, disconnect/reconnect, state mismatch)
- **GameView selector:** adapts both 1-player and 2-player state correctly
- **Game component:** renders correctly from GameView, dispatches correct actions (render with ConnectionProvider + createConnectionStore)
- **GameLobby component:** ready states, board reuse choice, turn selection controls
- **Handler:** new data channel message decoders and game message routing
- **hashBoard utility:** deterministic output for the same board

### Backend Tests

- `P2pGameFeatureTest` — WebSocket-based tests for SAVE/LOAD P2P game state (same pattern as `BoardFeatureTest`)

### E2E Tests (Playwright)

- Two peers connect, one challenges, other accepts
- Both place ships and confirm
- Turn order selection
- Fire shots, see results on both sides
- Game over state
- Disconnect and reconnect resumes game

---

## Scope Boundary

**In scope:**
- Challenge, placement, turn selection, firing, game over, forfeit
- Board hash commitment (SHA-256) and verification
- Server persistence for crash recovery
- State comparison on reconnect
- Handler refactor (split by domain)
- Shared GameView type for 1-player and 2-player rendering
- Cancel challenge
- Auto-decline when busy

**Out of scope:**
- Spectator mode
- Game history / statistics
- Rematch shortcut (use New Game)
- Tournament / matchmaking
- Chat integration during game (existing chat works independently)
