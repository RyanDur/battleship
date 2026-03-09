# Battleship P2P Platform — Architecture

## Current State

```mermaid
graph TB
    subgraph "Backend (Spring Boot - Kotlin)"
        HC[HealthController<br/>GET /health]
        WC[WebSocketConfig<br/>Origin + Token Auth]
        AH[AuthHandshakeInterceptor<br/>Result pipeline validation]
        SH[SignalingHandler<br/>Relay messages to peer]
        SR[SessionRegistry<br/>Max 2 sessions]
    end

    subgraph "Shared (Kotlin)"
        RT[Result of S and F<br/>map / flatMap / either]
        SM[SignalingMessage<br/>Offer / Answer / ICE / Error]
    end

    subgraph "Frontend (React + Vite)"
        APP[App scaffold<br/>Vitest configured]
        PT[Protocol Types<br/>TS mirror of SignalingMessage]
        WT[Worker Message Types<br/>WorkerCommand / WorkerEvent]
    end

    WC --> AH --> SR
    SH --> SR
    AH -.->|uses| RT
    SR -.->|uses| RT

    style HC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style WC fill:#2e7d32,stroke:#1b5e20,color:#fff
    style AH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SH fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SR fill:#2e7d32,stroke:#1b5e20,color:#fff
    style RT fill:#2e7d32,stroke:#1b5e20,color:#fff
    style SM fill:#2e7d32,stroke:#1b5e20,color:#fff
    style APP fill:#2e7d32,stroke:#1b5e20,color:#fff
    style PT fill:#2e7d32,stroke:#1b5e20,color:#fff
    style WT fill:#2e7d32,stroke:#1b5e20,color:#fff
```

> **Status:** Backend signaling complete (Stories #1-5). Frontend scaffolded with type definitions. WebWorker and React UI not yet implemented.
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

### Component Responsibilities

```mermaid
graph LR
    subgraph "Frontend (React + Vite)"
        RC[React Components<br/>UI + Status Display]
        HK[useConnectionWorker<br/>Hook]
        WK[WebWorker<br/>WS + WebRTC Bridge]
        PT[Protocol Types<br/>TS message definitions]
    end

    subgraph "Backend (Spring Boot)"
        HC[HealthController<br/>GET /health]
        WC[WebSocketConfig<br/>Origin + Token Auth]
        SH[SignalingHandler<br/>Message Relay]
        SR[SessionRegistry<br/>Track Connections]
        SP[Shared Protocol<br/>SignalingMessage sealed class]
    end

    RC --> HK --> WK
    WK --> PT
    SH --> SR
    SH --> SP
    WC --> SH
```

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
