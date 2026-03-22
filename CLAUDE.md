# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run everything (dev server on port 8082, Vite on port 5173)
make start

# Stop dev servers
make stop

# Run all tests (Gradle + ESLint + Vitest)
make test

# Backend tests only
./gradlew :applications:signaling-server:test

# Frontend tests only (includes tsc + eslint + vitest)
cd applications/web-client && npm test

# Single Vitest file
cd applications/web-client && npx vitest run src/state/connectionStore.test.ts

# Frontend lint only
cd applications/web-client && npm run lint

# E2e tests (builds frontend, starts backend jar + vite preview, runs Playwright)
./gradlew :applications:signaling-server:bootJar
cd applications/web-client && npm run e2e

# Single Playwright test
cd applications/web-client && npx playwright test e2e/acceptance.test.ts
```

## Architecture

P2P Battleship game following [App Continuum](https://www.appcontinuum.io/) — organized by bounded context, not technical layer.

**signaling-server** (Kotlin/Spring Boot) — local WebSocket relay for peer discovery, SDP exchange, email sharing. H2 database. Packaged as native installer via jpackage.

**web-client** (React/Vite/TypeScript) — hosted on GitHub Pages. WebRTC P2P connections with signaling mediated through the server. Chat, trust, introductions over direct data channels.

**signaling-protocol** (Kotlin) — shared Result type (ROP) used by the backend.

The web client maintains its own TypeScript Result/Maybe/AsyncResult types. No shared code crosses the Kotlin/TypeScript boundary — separate bounded contexts.

### Frontend State Architecture

Custom store (not Redux) in `src/state/`:
- **`connections.ts`** — reducer + state shape (`ConnectionsState`, `ConnectionsAction`)
- **`connectionStore.ts`** — store factory with middleware (wraps dispatch) and listener factories (post-reducer side effects)
- **`connectionSelectors.ts`** — named selector functions for all state access (never access state properties inline)
- **`connectionActions.ts`** — action creators
- **`ConnectionProvider.tsx`** — React context provider; `useConnection.ts` — hook to consume it

State flows: action → middleware → reducer → listeners → subscribers.

### Frontend Key Patterns

- **`src/lib/`** — Result, Maybe, AsyncResult types (frozen, ROP-style pipelines)
- **`src/protocol/`** — external boundary code: config loading, signaling WebSocket, connection code encode/decode, heartbeat, platform detection
- **`src/workers/`** — WebRTC connection handler (peer connection lifecycle)
- **`src/styles/`** — `reset.css` (global resets), `base.css` (design tokens), `layout.css` (HUD grid + all component styles)
- Config loaded at runtime from `config.json` via schemawax decoder, defaults to `localhost:8080` if missing

### Backend Key Patterns

- **`PeerRelationshipGateway`** — interface for persistence; `JpaPeerRelationshipGateway` — JPA implementation. Wired via `RelationshipConfig` bean.
- **`PeerRegistry`** — in-memory peer tracking + delegates persistence to gateway
- **`SignalingHandler`** — WebSocket message handler (REGISTER, RELAY_OFFER, RELAY_ANSWER, etc.)
- Gateway methods that write use find-first-then-update pattern for idempotency

### Config & Environment

Config is 12-factor: env vars with defaults in `application.yml`. direnv manages dev overrides via `.envrc`.

direnv sets dev defaults: port 8082, DB at `~/.battleship/dev-data` (separate from installed app on port 8080 with `~/.battleship/data`). `make start` reads `SERVER_PORT` from the environment for the frontend `config.json`.

E2e tests use port 8081 via Playwright config.

### CI/CD

- **Golden artifact**: CI builds dist once, uploads artifact. E2e downloads it, writes `config.json`, tests it. Release deploys the exact tested bytes.
- **Release**: triggered by tag push (`v*`), calls CI as reusable workflow, builds native installers, deploys frontend to GitHub Pages.
- **Pre-push hook**: runs Gradle tests + ESLint + Vitest before every push.

## Code Style

- **Arrow functions only** — no `function` declarations/expressions
- **Named exports only** — no default exports
- **CSS classes** — first class = component name, successive = sharable adjectives; sharable classes at top of file. No direct element selectors in layout.
- **Frozen objects** — `Object.freeze` on Result/Maybe instances
- **ROP** — `map`, `andThen`, `or`, `onSuccess`, `onFailure`, `either`, `mapEither`, `tryCatch`. No exceptions for expected failures. `AsyncResult` for async pipelines (no raw `async/await` or `void` promises in public APIs).
- **Classicist testing** — fakes over mocks, observe behavior not implementation. Test through the store (reducer + middleware together), not layers in isolation. `waitFor` for components with effects — never dismiss `act()` warnings.
- **Gateway suffix** — interfaces wrapping external resources use `Gateway` with domain name (not Repository)
- **No `npx`** — use `npm run <script>` or `npm test`
