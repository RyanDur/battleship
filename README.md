# Battleship

A peer-to-peer Battleship game that runs in the browser and connects players directly via WebRTC.

## Architecture

- **Frontend** — React + Vite, hosted on GitHub Pages
- **Backend** — Kotlin Spring Boot service, runs locally on each player's machine
- **Networking** — WebRTC data channels for direct P2P communication between players
- **WebWorker** — bridges the React UI to the local service (WebSocket) and the other player (WebRTC)

See [docs/architecture.md](docs/architecture.md) for detailed diagrams.

## How It Works

1. Each player installs and runs the local service
2. Both players visit the website
3. One player creates a game and shares a connection code
4. The other player joins using that code
5. A direct WebRTC connection is established — no server in between

## Project Structure

```
battleship/
├── frontend/   # React + Vite + TypeScript
├── backend/    # Kotlin Spring Boot
├── shared/     # Protocol definitions
└── docs/       # Architecture diagrams
```

## Development

### Prerequisites

- JDK 17+
- Node 24 LTS (`nvm use`)
- Gradle (via wrapper)

### Backend

```bash
./gradlew :backend:bootRun
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Tests

```bash
./gradlew test          # backend + shared
cd frontend && npm test # frontend
```
