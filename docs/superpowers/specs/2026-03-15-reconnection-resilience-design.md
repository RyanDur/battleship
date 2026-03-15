# Reconnection Resilience — Design Spec

## Problem

Peers lose all connections on page refresh or network disruption. There is no way to reconnect without manually exchanging codes again. This makes the experience fragile — an accidental refresh destroys an in-progress game.

## Solution

Evolve the signaling server into a peer registry and SDP relay. Peers connect through the server automatically (no copy/paste), reconnect after refresh via cookie-based identity, and recover from network disruptions via ICE restart with the signaling server as a side channel.

## User Experience

### Initial Connection

1. Both peers open the app. Each connects to the signaling server via WebSocket.
2. Server assigns a `peerId` via HTTP cookie on the WebSocket upgrade. Cookie persists across refresh.
3. Each peer registers with a name and optional email.
4. Both peers see each other in an online peers list.
5. Alice clicks "Connect" next to Bob. Server brokers SDP exchange. Bob's client answers automatically — no user prompt. WebRTC data channel established.

### Page Refresh

1. Alice refreshes. Her WebRTC connections die. Bob sees Alice disconnect.
2. Alice's page reloads. Browser sends cookie on WebSocket reconnect. Server recognizes her.
3. Alice's UI shows her previous peers. Bob is online — "Reconnect" button appears.
4. Alice clicks Reconnect. Server brokers fresh SDP exchange. Connection re-established.

### Network Disruption (WiFi drop, sleep/wake)

1. Alice's WiFi drops. ICE connection state goes to `disconnected` or `failed`.
2. UI shows "reconnecting..." for that peer.
3. Handler calls `restartIce()` on the existing `RTCPeerConnection` (which must not be closed — ICE state changes are separate from data channel close). Handler then calls `createOffer({ iceRestart: true })`, waits for full ICE gather, and sends the renegotiation SDP through the signaling server.
4. Remote peer receives the restart offer, sets it as remote description, creates an answer (full ICE gather), and sends the answer back through the signaling server. Connection re-establishes. UI returns to normal.
5. If ICE restart fails after retries, peer moves to the previous peers list with Reconnect button.

### Offline Peer Invitation

1. Alice refreshes. Bob is offline (closed browser).
2. Alice sees Bob in her previous peers list as "Offline."
3. If Alice has Bob's email (he shared it, or she entered it previously), "Invite" button opens `mailto:` pre-filled.
4. If Alice doesn't have Bob's email, "Invite" opens `mailto:` with empty "to" field. Whatever she types is saved server-side for next time.
5. Bob receives email, opens app, reconnects.

### Email Sharing

- A peer can enter their own email and choose to share it with connected peers.
- Shared emails are stored server-side, associated with the relationship.
- A peer can stop sharing at any time — recipients lose the email.
- A peer can manually enter another peer's email via the Invite flow — saved server-side for that relationship.

### Forgetting a Peer

- A peer can "Forget" a previous peer from their reconnect list.
- The forgotten peer can no longer see them as a previous peer or reconnect to them.
- This is a one-sided action — the other peer may still have you in their list, but reconnection attempts will be rejected by the server.
- Forgetting only blocks reconnection (server-brokered re-connection of a previous relationship). It does not block initial connection — if Bob forgets Alice, Alice can still see Bob in the online peers list and click "Connect" to start a fresh connection.

### Copy/Paste Fallback

The existing manual code exchange (Create/Join with passphrase) remains unchanged. It is the fallback for peers not connected to the same signaling server (different machines, different networks).

## Server Protocol

All messages are JSON over WebSocket at `/ws/signaling`.

### Client to Server

| Message | Fields | Purpose |
|---------|--------|---------|
| `REGISTER` | `name`, `email?` | Announce identity (peerId from cookie) |
| `UPDATE_EMAIL` | `email?` | Change or remove your email |
| `SHARE_EMAIL` | `targetPeerId` | Share your email with a specific peer |
| `STOP_SHARING_EMAIL` | `targetPeerId` | Revoke email sharing with a peer |
| `SAVE_PEER_EMAIL` | `targetPeerId`, `email` | Manually save an email for a peer |
| `RELAY_OFFER` | `targetPeerId`, `sdp` | Forward SDP offer |
| `RELAY_ANSWER` | `targetPeerId`, `sdp` | Forward SDP answer |
| `RELAY_ICE_RESTART` | `targetPeerId`, `sdp` | Forward ICE restart offer |
| `RELAY_ICE_RESTART_ANSWER` | `targetPeerId`, `sdp` | Forward ICE restart answer |
| `FORGET_PEER` | `targetPeerId` | Remove a peer from your reconnect list |

### Server to Client

| Message | Fields | Purpose |
|---------|--------|---------|
| `REGISTERED` | `peerId`, `name` | Confirms identity |
| `PEERS` | `peers: [{peerId, name}]` | Full online peer list on connect |
| `PEER_JOINED` | `peerId`, `name` | A peer came online |
| `PEER_LEFT` | `peerId` | A peer went offline |
| `PREVIOUS_PEERS` | `peers: [{peerId, name, online, email?}]` | Peers you were previously connected to |
| `OFFER_RECEIVED` | `fromPeerId`, `name`, `sdp` | Someone wants to connect |
| `ANSWER_RECEIVED` | `fromPeerId`, `sdp` | Response to your offer |
| `ICE_RESTART_RECEIVED` | `fromPeerId`, `sdp` | Renegotiation offer from a peer |
| `ICE_RESTART_ANSWER_RECEIVED` | `fromPeerId`, `sdp` | Answer to a renegotiation offer |
| `EMAIL_SHARED` | `fromPeerId`, `email` | A peer shared their email with you |
| `EMAIL_REVOKED` | `fromPeerId` | A peer revoked their email |

## Server Design

### New Components

**`SessionController`** — `GET /session` — sets the `peerId` cookie if absent, returns 200. Called by the client before WebSocket connection to ensure the cookie exists for cross-origin upgrades.

**`SignalingHandler`** — WebSocket handler for `/ws/signaling`. Reads `peerId` from cookie on upgrade. Routes messages between clients.

**`PeerRegistry`** — In-memory data structure tracking:
- `Map<peerId, WebSocketSession>` — active connections
- `Map<peerId, String>` — peer names
- `Map<peerId, String?>` — peer emails
- `Map<peerId, Set<peerId>>` — peer relationships (bidirectional: who has been connected to whom)
- `Map<(peerId, peerId), String?>` — per-relationship email (manually saved or shared)
- `Set<(peerId, peerId)>` — forgotten peer pairs

State is persisted to a database so it survives server restarts. Peer names, relationships, emails, and forgotten-peer pairs are durable. When the server restarts, a returning peer with a valid cookie is recognized — their identity, relationships, and peers are restored.

### Cookie

The client and server are on different origins (GitHub Pages serves the frontend, Spring Boot serves the backend). Cross-origin WebSocket upgrades do not send `SameSite=Strict` or `SameSite=Lax` cookies. The cookie must use `SameSite=None; Secure` (requires HTTPS).

The cookie is set via an HTTP endpoint (`GET /session`) before the WebSocket connection. The client fetches this endpoint with `credentials: 'include'` on startup. The server generates a `peerId` (UUID) if no cookie is present and sets it on the response: `HttpOnly`, `SameSite=None`, `Secure`. Subsequent WebSocket upgrades to `/ws/signaling` include the cookie automatically.

In development (localhost), the client and server share the same origin (Vite proxy), so `SameSite` restrictions do not apply.

`CorsConfig` must add `.allowCredentials(true)` for the credentialed `GET /session` request to succeed cross-origin. Without this, the browser silently blocks the response even if origin and method are allowed.

### Registration

The client calls `GET /session` on startup (with `credentials: 'include'`). The server reads the `peerId` cookie — if absent, generates a new UUID and sets the cookie. Then the client opens a WebSocket to `/ws/signaling`. The server reads the `peerId` from the cookie on upgrade and maps it to the session.

On `REGISTER`, the server responds with three messages in order:
1. `REGISTERED` — confirms identity
2. `PEERS` — full list of currently online peers (excludes the registering peer)
3. `PREVIOUS_PEERS` — peers this client was previously connected to (if any)

When a peer receives `PEER_LEFT` for a peer they were previously connected to, that peer moves into the client's previous peers list with their last-known online status set to offline. This is a client-side state change driven by the server message — no additional server round-trip needed.

## Client Design

### New: `signaling.ts`

A signaling service module that manages the WebSocket connection to `/ws/signaling`.

**Interface:**
- `startSignaling(config): SignalingHandle` — connects WebSocket, sends `REGISTER`, returns a handle
- `SignalingHandle.send(message)` — send a client-to-server message
- `SignalingHandle.stop()` — close the WebSocket
- `onEvent` callback — receives all server-to-client messages (same pattern as `startHeartbeat`'s `onStateChange`)

The store creates the signaling service on startup and subscribes to its events. Signaling events like `OFFER_RECEIVED` are translated into store actions that delegate to the peer handler.

### Identity Reconciliation

The signaling server and the peer handler use separate peerId spaces. The signaling server assigns a persistent `peerId` via cookie (stable across sessions). The peer handler generates a local `peerId` via `crypto.randomUUID()` for each `RTCPeerConnection` (ephemeral, per-connection).

The store maintains the mapping between them. When Alice connects to Bob via signaling:
1. Store knows Bob's signaling peerId (from `PEERS` message)
2. Store sends `CONNECT_VIA_SERVER` command to the handler
3. Handler creates the offer and emits an event containing both the local peerId and SDP
4. Store maps: signaling peerId (Bob) ↔ local peerId (from the emitted event)

This mapping is needed for reconnection: when the server says "Bob is back" (signaling peerId), the store knows which local connection was Bob.

### Changed: `connection.handler.ts`

- Listens to `iceconnectionstatechange` on each `RTCPeerConnection`
- On `disconnected`/`failed`: emits `PEER_CONNECTION_UNSTABLE`. Only the original offerer (the peer who sent the initial `RELAY_OFFER` for this connection) initiates ICE restart — this prevents both sides from racing to send restart offers simultaneously. The answerer waits for an incoming restart offer instead.
- On recovery: emits `PEER_CONNECTION_RESTORED`
- After N failed restart attempts: emits `PEER_DISCONNECTED`
- ICE restart is self-initiated by the handler on `iceconnectionstatechange` — it is not an external command from the store. The handler calls `restartIce()`, creates the offer, and emits an event for the store to relay through the signaling server.
- New commands: `CONNECT_VIA_SERVER`, `RECONNECT_VIA_SERVER` — create offer and send through signaling instead of emitting code for copy/paste
- New events: `SERVER_OFFER_RECEIVED`, `SERVER_ANSWER_RECEIVED`, `ICE_RESTART_SDP` (handler requests store to relay restart offer/answer via signaling) — SDP arrived from or destined for signaling server

### Changed: `connectionStore.ts`

- Integrates with signaling service
- New actions: `connectToPeer(peerId)`, `reconnectToPeer(peerId)`, `forgetPeer(peerId)`, `shareEmail(peerId)`, `updateEmail(email)`, `savePeerEmail(peerId, email)`
- Tracks online peers and previous peers from server messages

### Changed: `connections.ts` (reducer)

New state:
- `onlinePeers: {peerId, name}[]` — peers on the signaling server
- `previousPeers: {peerId, name, online, email?}[]` — peers you were previously connected to
- `peerConnectionHealth: Map<peerId, 'stable' | 'unstable'>` — ICE connection health per peer

### Changed: `Connections.tsx`

- Online peers section with "Connect" button
- Previous peers section with "Reconnect" (online) / "Invite" (offline) / grayed out (offline, no email)
- Invite opens `mailto:` link, saves manually entered email
- "Forget" option per previous peer
- "Share email" / "Stop sharing" controls
- Connection health indicator per peer (stable/reconnecting)
- Existing Create/Join flow unchanged

### Changed: `worker-messages.ts`

New PeerCommand types: `CONNECT_VIA_SERVER`, `RECONNECT_VIA_SERVER`, `ICE_RESTART_RECEIVED`, `ICE_RESTART_ANSWER_RECEIVED`
New PeerEvent types: `SERVER_OFFER_RECEIVED`, `SERVER_ANSWER_RECEIVED`, `ICE_RESTART_SDP`, `PEER_CONNECTION_UNSTABLE`, `PEER_CONNECTION_RESTORED`

ICE restart is self-initiated by the handler (not an external command). The handler emits `ICE_RESTART_SDP` for the store to relay via signaling. Incoming restart offers/answers arrive as commands from the store: `ICE_RESTART_RECEIVED`, `ICE_RESTART_ANSWER_RECEIVED`.

## What Does Not Change

- Copy/paste connection flow (Create/Join with passphrase)
- Introduction flow (trusted peer relay)
- Trust model (grant/revoke)
- Heartbeat/health monitoring
- Encryption of manual connection codes

## Vertical Slices

### Slice 1: Signaling server + automatic connection
Server gains `/ws/signaling`, cookie identity, peer registry, SDP relay. Client gains signaling service, online peer list, Connect button. Peers connect without copy/paste.

### Slice 2: Reconnection after refresh
Server tracks peer relationships. Client shows previous peers on reconnect. Reconnect button brokers fresh SDP exchange.

### Slice 3: ICE restart on network disruption
Handler monitors ICE state, calls `restartIce()`, relays renegotiation SDP through signaling server. UI shows reconnecting state.

### Slice 4: Email invitations
Registration collects optional email. Peers can share email or manually enter peer emails. Invite button opens `mailto:`. Forget peer removes from reconnect list.
