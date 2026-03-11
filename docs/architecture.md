# Battleship P2P Platform — Architecture

## Current State

```mermaid
graph TB
    subgraph "applications/signaling-server"
        HC[HealthController<br/>GET /health]
        HH[HealthHandler<br/>WS /ws/health<br/>Heartbeat every N ms]
        WC[WebSocketConfig<br/>Origin + Token Auth]
        AH[AuthHandshakeInterceptor<br/>Result pipeline validation]
        SH[SignalingHandler<br/>Relay messages to peer]
        SR[SessionRegistry<br/>Max 2 sessions]
        ES["@EnableScheduling<br/>Heartbeat timer"]
    end

    subgraph "components/signaling-protocol"
        RT[Result of S and F<br/>map / flatMap / or / either]
        SM[SignalingMessage<br/>Offer / Answer / ICE / Error]
    end

    subgraph "applications/web-client"
        APP[App<br/>Lifts heartbeat state<br/>Derives download action]
        SHC[ServiceHealth<br/>Display component<br/>online / reconnecting / offline]
        DL[DownloadLink<br/>Download / Upgrade / hidden<br/>GitHub API asset lookup]
        HB[startHeartbeat<br/>WS state machine<br/>reconnect + retry]
        RS[Result / Maybe<br/>Frozen immutable types]
        DC[SignalingMessage Decoder<br/>schemawax runtime validation]
        CH[ConnectionHandler<br/>State machine / WebRTC]
        CS[ConnectionStatus<br/>UI component]
        WT[Worker Message Types<br/>WorkerCommand / WorkerEvent]
        PL[Platform Detection<br/>macOS / Windows / Linux]
        DLProto[Download Protocol<br/>GitHub API + schemawax decoder]
    end

    WC --> AH --> SR
    WC --> HH
    SH --> SR
    AH -.->|uses| RT
    SR -.->|uses| RT
    ES -.->|drives| HH
    APP --> SHC
    APP --> DL
    APP -.->|calls| HB
    HB -.->|connects to| HH
    DL -.->|uses| DLProto

    style HC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style HH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style WC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style AH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SR fill:#2e7d32,stroke:#1b5e20,color:#fff
    style ES fill:#2e7d32,stroke:#1b5e20,color:#fff
    style RT fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SM fill:#2e7d32,stroke:#1b5e20,color:#fff
    style APP fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SHC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style DL fill:#2e7d32,stroke:#1b5e20,color:#fff
    style HB fill:#2e7d32,stroke:#1b5e20,color:#fff
    style RS fill:#2e7d32,stroke:#1b5e20,color:#fff
    style DC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style CH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style CS fill:#2e7d32,stroke:#1b5e20,color:#fff
    style WT fill:#2e7d32,stroke:#1b5e20,color:#fff
    style PL fill:#2e7d32,stroke:#1b5e20,color:#fff
    style DLProto fill:#2e7d32,stroke:#1b5e20,color:#fff
```

> **Status:** Backend signaling complete. Health endpoint serves both HTTP (for readiness probes) and WebSocket heartbeat (for live status). Frontend has heartbeat state machine with reconnect/retry, conditional Download/Upgrade link via GitHub API, platform detection, Result/Maybe types, schemawax decoders, connection handler, and ConnectionStatus component. WebWorker thread and React hook not yet wired.
> Green = implemented and tested.

---

## Proposed Architecture

### System Overview

```mermaid
graph TB
    subgraph "GitHub Infrastructure"
        GHP[GitHub Pages<br/>React + Vite App]
        GHR[GitHub Releases<br/>Native Installers]
        GHA[GitHub Actions<br/>CI / CD]
    end

    subgraph "Player A Machine"
        subgraph "Browser A"
            UI_A[React UI]
            WW_A[WebWorker]
        end
        LS_A[Local Service<br/>Spring Boot<br/>127.0.0.1:8080]
    end

    subgraph "Player B Machine"
        subgraph "Browser B"
            UI_B[React UI]
            WW_B[WebWorker]
        end
        LS_B[Local Service<br/>Spring Boot<br/>127.0.0.1:8080]
    end

    GHP -->|serves| UI_A
    GHP -->|serves| UI_B
    GHR -->|installer download| LS_A
    GHR -->|installer download| LS_B

    UI_A <-->|postMessage| WW_A
    UI_B <-->|postMessage| WW_B

    WW_A <-->|WebSocket<br/>ws://localhost:8080| LS_A
    WW_B <-->|WebSocket<br/>ws://localhost:8080| LS_B

    WW_A <====>|WebRTC<br/>Data Channel| WW_B

    GHA -->|deploy| GHP
    GHA -->|build + release| GHR
```

> **Differences from current state:**
> - WebWorker bridges UI ↔ local service (currently App connects directly)
> - WebRTC data channel between players (not yet implemented)
> - Connection flow via signaling relay (signaling handler exists, not yet wired to frontend)

### Connection Flow

```mermaid
sequenceDiagram
    participant A_UI as Player A<br/>React UI
    participant A_WW as Player A<br/>WebWorker
    participant A_LS as Player A<br/>Local Service
    participant B_UI as Player B<br/>React UI
    participant B_WW as Player B<br/>WebWorker
    participant B_LS as Player B<br/>Local Service

    Note over A_UI, B_LS: 1. Both players connect to their local service

    A_UI->>A_WW: CONNECT { token, serviceUrl }
    A_WW->>A_LS: WebSocket open
    A_LS-->>A_WW: connected
    A_WW-->>A_UI: CONNECTED

    B_UI->>B_WW: CONNECT { token, serviceUrl }
    B_WW->>B_LS: WebSocket open
    B_LS-->>B_WW: connected
    B_WW-->>B_UI: CONNECTED

    Note over A_UI, B_LS: 2. Player A creates a game (generates WebRTC offer)

    A_UI->>A_WW: CREATE_OFFER
    A_WW->>A_WW: new RTCPeerConnection()<br/>createOffer()<br/>gather ICE candidates
    A_WW-->>A_UI: OFFER_CREATED { sdp }
    A_UI->>A_UI: Display offer code to copy

    Note over A_UI, B_LS: 3. Player A shares offer code with Player B (out-of-band)

    A_UI-->>B_UI: Copy/paste offer code

    Note over A_UI, B_LS: 4. Player B joins (accepts offer, generates answer)

    B_UI->>B_WW: ACCEPT_OFFER { sdp }
    B_WW->>B_WW: new RTCPeerConnection()<br/>setRemoteDescription(offer)<br/>createAnswer()<br/>gather ICE candidates
    B_WW-->>B_UI: ANSWER_CREATED { sdp }
    B_UI->>B_UI: Display answer code to copy

    Note over A_UI, B_LS: 5. Player B shares answer code with Player A (out-of-band)

    B_UI-->>A_UI: Copy/paste answer code

    Note over A_UI, B_LS: 6. Player A accepts answer, WebRTC connects

    A_UI->>A_WW: ACCEPT_ANSWER { sdp }
    A_WW->>A_WW: setRemoteDescription(answer)

    A_WW->>B_WW: WebRTC Data Channel established
    B_WW->>A_WW: WebRTC Data Channel established

    A_WW-->>A_UI: PEER_CONNECTED
    B_WW-->>B_UI: PEER_CONNECTED
```

> **Differences from current state:** This entire flow is proposed. Currently the frontend connects to the heartbeat endpoint but does not yet establish signaling or WebRTC connections.

### Component Responsibilities

```mermaid
graph LR
    subgraph "Frontend — Current"
        RC_C[App + ServiceHealth + DownloadLink<br/>Heartbeat-driven UI]
        HB_C[startHeartbeat<br/>WS state machine]
        PT_C[Protocol Types<br/>schemawax decoders]
    end

    subgraph "Frontend — Proposed"
        RC[React Components<br/>UI + Game Board]
        HK[useConnectionWorker<br/>Hook]
        WK[WebWorker<br/>WS + WebRTC Bridge]
    end

    subgraph "Backend — Current"
        HC[HealthController + HealthHandler<br/>HTTP + WS health]
        WC[WebSocketConfig<br/>Origin + Token Auth]
        SH[SignalingHandler<br/>Message Relay]
        SR[SessionRegistry<br/>Track Connections]
        SP[Shared Protocol<br/>SignalingMessage sealed class]
    end

    RC --> HK --> WK
    WK --> PT_C
    SH --> SR
    SH --> SP
    WC --> SH

    style RC_C fill:#2e7d32,stroke:#1b5e20,color:#fff
    style HB_C fill:#2e7d32,stroke:#1b5e20,color:#fff
    style PT_C fill:#2e7d32,stroke:#1b5e20,color:#fff
    style HC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style WC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SR fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SP fill:#2e7d32,stroke:#1b5e20,color:#fff
    style RC fill:#fff3e0,stroke:#e65100,color:#000
    style HK fill:#fff3e0,stroke:#e65100,color:#000
    style WK fill:#fff3e0,stroke:#e65100,color:#000
```

> Green = implemented. Orange = proposed / not yet built.

### Security

```mermaid
graph TD
    subgraph "Security Layers"
        O[Origin Validation<br/>Only GH Pages + localhost]
        T[Token Authentication<br/>Generated on service start]
        B[Bind to 127.0.0.1<br/>Not accessible externally]
        S[Single Connection<br/>Max 2 WS sessions]
        G[Game Integrity<br/>Never send ship positions<br/>Only hit/miss responses]
    end

    O --> T --> B --> S --> G
```
