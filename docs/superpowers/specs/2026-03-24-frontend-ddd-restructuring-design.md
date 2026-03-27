# Frontend DDD Restructuring Design

## Goal

Reorganize the web-client frontend from technical-layer directories (`components/`, `state/`, `protocol/`, `workers/`) into domain-driven bounded contexts (`connections/`, `game/`), each with their own store, so that domain boundaries are structural rather than conventional.

## Problem

The frontend currently scatters each domain concept across multiple directories:

- **Game** spans `game/`, `components/Game.tsx`, `components/GameLobby.tsx`, `components/BoardSetup.tsx`, `state/connections.ts` (p2pGame reducer embedded inside), `state/connectionActions.ts` (~37 game actions mixed with ~57 connection actions), `state/connectionSelectors.ts` (6 game selectors mixed with 15 connection selectors), `workers/connection.handler.ts` (~193 lines of game protocol interleaved with ~342 lines of connection protocol), and `state/connectionStore.ts` (game dispatch block inside handler listener, game decoder in store file, game persistence in signaling listener).

- **Connections** owns peer discovery, trust, introductions, chat, email sharing, and the WebRTC transport — but game concerns bleed into every layer: the handler decodes challenges and coin flips, the store listener routes game commands, and `Fleet.tsx` renders challenge buttons.

This makes it impossible to understand one domain without reading the other. Adding a new feature to either domain requires touching files owned by both.

## Design

### Bounded Contexts

Two domains, each fully self-contained:

**Connections** — the social layer. Peers, trust, introductions, chat, email sharing, online/previous peers, signaling, ICE restart, and the data channel as transport. Connections never knows what travels over the channels it provides.

**Game** — battleship gameplay. Board placement, challenges, turns, firing, coin flip, AI opponent, game-over, board verification, reconnect/resume. Game has a single-player mode (AI) and a multiplayer mode (P2P over connections). Both modes share the same board, firing, and game-over concepts.

### ConnectionPort — The Integration Contract

Game depends on connections through one interface:

```typescript
type ConnectionEvent =
  | { type: 'PEER_CONNECTED'; peerId: string; isOfferer: boolean }
  | { type: 'PEER_NAMED'; peerId: string; name: string }
  | { type: 'PEER_DISCONNECTED'; peerId: string }
  | { type: 'PEER_MESSAGE'; peerId: string; data: unknown }
  | { type: 'SERVER_MESSAGE'; data: unknown }

type ConnectionPort = {
  sendToPeer: (peerId: string, message: unknown) => void
  sendToServer: (message: unknown) => void
  subscribe: (listener: (event: ConnectionEvent) => void) => () => void
}
```

- `sendToPeer` — serializes and sends through the data channel connections owns
- `sendToServer` — sends through the signaling WebSocket connections owns
- `subscribe` — returns an unsubscribe function; delivers connection events and forwarded messages
- `PEER_CONNECTED` includes `isOfferer` so game can store it locally for coin flip direction. Does **not** include `name` — name is not yet known when the data channel opens (name exchange happens after connect)
- `PEER_NAMED` — emitted after name exchange completes. Game stores the opponent name for display
- `PEER_MESSAGE` carries raw parsed JSON — game decodes what it recognizes, ignores the rest
- `SERVER_MESSAGE` carries raw parsed JSON — game decodes persistence responses (board loaded, game loaded)

Connections never imports from game. Game depends only on `ConnectionPort`, not connection internals. A future domain (e.g., file sharing) would consume the same port.

### Store Architecture

Two independent stores, each following the existing custom store pattern (reducer + middleware + listeners).

**Connection store** — created first. Owns signaling, WebRTC, peer state (peers, trust, chat, introductions, online/previous peers, handler state). Exposes `ConnectionPort`.

**Game store** — created second, receives `ConnectionPort`. Subscribes to connection events. Dispatches game actions based on peer messages and server responses. Owns all game state: `board`, `boardLoading`, `gameState` (AI game), `p2pGame`. These fields move out of `ConnectionsState` into `GameState`.

```typescript
// Startup in App
const connectionStore = createConnectionStore(middleware, listeners);
const port = createConnectionPort(connectionStore);
const gameStore = createGameStore(port, middleware, listeners);
```

Two React contexts, two providers:

```tsx
<ConnectionProvider store={connectionStore}>
  <GameProvider store={gameStore}>
    {children}
  </GameProvider>
</ConnectionProvider>
```

Components use `useConnectionStore()` or `useGameStore()`. A component needing both consumes both hooks explicitly, making cross-domain coupling visible.

### Connection Handler as Transport

The current `connection.handler.ts` (690 lines) splits into:

**`connections/connectionHandler.ts`** — keeps WebRTC lifecycle: SDP negotiation, data channels, trust exchange, name exchange, introductions, ICE restart. When a data channel message arrives that it doesn't recognize (no matching decoder), it emits `PEER_MESSAGE { peerId, data }` through the port. When `port.sendToPeer()` is called, it serializes and sends through the data channel.

**`game/gameMessageHandler.ts`** — subscribes to `PEER_MESSAGE` events via the port. Contains game-specific decoders (challenge, board ready, coin flip commit/reveal, fire, forfeit, game-over, state sync, board reveal). Decodes messages and dispatches game actions. Contains `pendingCoinFlips` map, `resolveP2pShot`, `isFleetSunk`, `hashBoard` verification — all game protocol logic. Receives `getState` and `dispatch` from the game store (same dependency injection pattern as the current handler) because it needs to read board state to resolve incoming shots and check fleet sunk status.

The connection handler's signaling listener similarly forwards unrecognized server messages as `SERVER_MESSAGE`. Game's listener decodes persistence responses (`BOARD_LOADED`, `BOARD_NOT_FOUND`, `BOARD_SAVED`, `P2P_GAME_LOADED`, `GAME_STARTED`, `FIRE_RESULT`, etc.).

### Persistence — Opaque to Components

Game persistence (save/load) flows through `ConnectionPort.sendToServer()`. Components never know whether an action triggers persistence. The game store's listener layer defines explicit save triggers:

```typescript
const SAVE_TRIGGERS = ['TURN_ORDER_DECIDED', 'P2P_FIRE_RESULT', 'OPPONENT_FIRED', 'P2P_GAME_OVER'];

// In game listener, after reducer runs:
if (SAVE_TRIGGERS.includes(action.type)) {
  port.sendToServer({ type: 'SAVE_P2P_GAME', gameState });
}
```

Adding or removing save points is a one-line change to the array. No component modifications.

**AI game persistence** also flows through `ConnectionPort.sendToServer()`. The current signaling listener handles `GAME_STARTED`, `FIRE_RESULT`, `GAME_STATE`, and `GAME_NOT_FOUND` server responses for AI games. After the split, these become `SERVER_MESSAGE` events decoded by the game store's listener, just like P2P persistence. Board persistence (`SAVE_BOARD`, `LOAD_BOARD`, `BOARD_LOADED`, `BOARD_NOT_FOUND`, `BOARD_SAVED`) follows the same pattern — shared between AI and P2P modes.

### Component Decomposition

**Connections domain:**

| Component | Notes |
|-----------|-------|
| `Fleet.tsx` | Peer list, trust, introductions, disconnect, reconnect. Challenge buttons removed — Fleet is purely social. |
| `Comms.tsx` | Chat between peers. |
| `DirectConnect.tsx` | Offer/answer code exchange. |
| `ConnectionStatus.tsx` | Connection state display. |
| `ServiceHealth.tsx` | Heartbeat status. |
| `DownloadLink.tsx` | Installer download link. |
| `Alerts.tsx` | Introduction alerts only (received/resolved). |

**Game domain:**

| Component | Notes |
|-----------|-------|
| `Game.tsx` | Firing UI, tracking board, fleet board, game-over. Currently imports `useConnectionState`/`useConnectionStore` and game selectors/actions from connection-named files — all game-domain concepts that will move to `game/`. |
| `GameLobby.tsx` | Board ready confirmation, turn selection, coin flip. Currently reads `selectPeers` for opponent name — will instead receive opponent name from game state (populated via `PEER_NAMED` event). Also reads `selectBoard` — board moves to game state. |
| `BoardSetup.tsx` | Ship placement grid. Already has zero state imports. |
| `ChallengeAlert.tsx` | New component. Challenge received, accept/decline. Extracted from current `Alerts.tsx`. |

**Challenge UI:** The challenge action currently lives on peer cards in Fleet. After the split, game provides its own challenge UI separate from Fleet. The exact UI design is deferred — the domain separation doesn't depend on where the button renders.

### Directory Structure

```
src/
├── connections/
│   ├── connectionPort.ts              ← ConnectionPort type + createConnectionPort factory
│   ├── connectionStore.ts             ← store factory, middleware, listeners
│   ├── connectionActions.ts           ← ~57 connection actions
│   ├── connectionSelectors.ts         ← ~15 connection selectors
│   ├── connections.ts                 ← reducer + ConnectionsState (peers, trust, chat, handler)
│   ├── connectionHandler.ts           ← WebRTC lifecycle, data channels as transport
│   ├── ConnectionProvider.tsx          ← React context + provider
│   ├── useConnection.ts               ← hooks
│   ├── Alerts.tsx                      ← introduction alerts only
│   ├── Comms.tsx
│   ├── DirectConnect.tsx
│   ├── ConnectionStatus.tsx
│   ├── Fleet.tsx                       ← peers, trust, introductions (no game knowledge)
│   ├── ServiceHealth.tsx
│   ├── DownloadLink.tsx
│   ├── signaling.ts                   ← signaling WebSocket client
│   ├── heartbeat.ts
│   ├── connectionCode.ts              ← SDP compress/encrypt
│   ├── config.ts                      ← runtime config loader
│   ├── download.ts
│   ├── http.ts
│   └── platform.ts
│
├── game/
│   ├── gameStore.ts                   ← store factory, receives ConnectionPort
│   ├── gameActions.ts                 ← ~37 game actions (board, AI, and P2P)
│   ├── gameSelectors.ts               ← 6 game selectors (including gameView)
│   ├── game.ts                        ← reducer + GameState (board, AI game, P2P game)
│   ├── gameMessageHandler.ts          ← subscribes to port, decodes game protocol
│   ├── GameProvider.tsx               ← React context + provider
│   ├── useGame.ts                     ← hooks
│   ├── ChallengeAlert.tsx             ← challenge received, accept/decline
│   ├── Game.tsx                       ← firing UI, tracking/fleet boards
│   ├── GameLobby.tsx                  ← board ready, turn selection
│   ├── BoardSetup.tsx                 ← ship placement
│   ├── board.ts                       ← board logic (placement, validation, occupiedCells)
│   └── hashBoard.ts                   ← SHA-256 board and value hashing
│
├── lib/                               ← Result, Maybe, AsyncResult (cross-cutting)
├── styles/                            ← reset.css, base.css, layout.css (cross-cutting)
└── test/                              ← fakePeerConnection, stubServer, makeWebSocket
```

### Data Flow Examples

**Startup:**
1. App creates connection store → starts signaling → creates ConnectionPort
2. App creates game store with port → game subscribes to connection events
3. Both providers wrap the component tree

**Challenge flow:**
1. User clicks challenge in game UI → game dispatches `challengePeer(peerId)`
2. Game listener calls `port.sendToPeer(peerId, { type: 'GAME_CHALLENGE' })`
3. Connection handler serializes, sends over data channel
4. Remote connection handler doesn't recognize `GAME_CHALLENGE` → emits `PEER_MESSAGE`
5. Remote game message handler decodes → dispatches `challengeReceived(peerId)`
6. `ChallengeAlert` renders

**Fire flow:**
1. User clicks cell → game dispatches `p2pFire(row, col)`
2. Game listener sends `{ type: 'P2P_FIRE', row, col }` via `port.sendToPeer`
3. Remote game message handler receives, resolves shot against board, sends result back
4. Game listener sees `P2P_FIRE_RESULT` (a save trigger) → calls `port.sendToServer({ type: 'SAVE_P2P_GAME', ... })`
5. Components re-render from game state — never aware of the save

**Reconnect flow:**
1. Connection detects peer reconnected → emits `PEER_CONNECTED { peerId, isOfferer }`
2. Name exchange completes → emits `PEER_NAMED { peerId, name }`
3. Game subscriber receives both events → stores isOfferer and opponent name, dispatches `peerConnected`
4. Game listener sends `{ type: 'LOAD_P2P_GAME', opponentId }` via `port.sendToServer`
5. Connection's signaling listener receives server response, doesn't recognize it → emits `SERVER_MESSAGE`
6. Game subscriber decodes `P2P_GAME_LOADED` → dispatches, game resumes

### Migration Strategy

This restructuring is a pure refactor — no behavior changes, no new features. All 416 unit tests and 20 e2e tests must continue to pass at every step. The migration should proceed incrementally:

1. Create `ConnectionPort` type and factory — wire it alongside the existing store without changing behavior
2. Extract game reducer, actions, selectors into `game/` — still consumed by the single store
3. Create game store — game state moves out of connection state
4. Extract game message handler — connection handler stops decoding game messages
5. Split signaling listener — connection forwards unrecognized server messages through port
6. Move components — game components into `game/`, strip game concerns from connection components
7. Move protocol files into `connections/`
8. Remove old directories (`workers/`, empty `state/` files, etc.)

Each step is independently committable and testable.

### Testing

Existing test strategy (classicist, fakes over mocks, test through the store) applies to both domains:

- **Game store tests** — create a game store with a fake `ConnectionPort`. Simulate peer messages by calling the subscriber directly. Assert game state transitions.
- **Connection store tests** — existing tests continue to work, minus game assertions that move to game tests.
- **Integration tests** — create both stores wired together. Verify end-to-end flows (challenge → accept → play → disconnect → reconnect).
- **E2e tests** — unchanged. They test through the browser UI. The restructuring is invisible to Playwright.

### What This Doesn't Cover

- **UI redesign for challenge button placement** — the challenge action needs a new home outside Fleet. The domain separation doesn't depend on the specific UI choice. Deferred.
- **Further decomposition of `connections/`** — the signaling package could eventually split (signaling vs. peer management). Not needed at current size.
- **New domains** — file sharing, screen sharing, etc. would follow the same pattern: own store, consume `ConnectionPort`, own components.
