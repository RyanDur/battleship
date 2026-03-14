# Battleship

A peer-to-peer Battleship game platform. Battleship is the first app — the architecture supports future apps over the same P2P infrastructure.

## Architecture

The project follows the [App Continuum](https://www.appcontinuum.io/) style — organized by bounded contexts, not technical layers.

```
battleship/
├── applications/
│   ├── signaling-server/      # Kotlin Spring Boot — local WebSocket relay
│   └── web-client/            # React + Vite + TypeScript — browser UI
├── components/
│   └── signaling-protocol/    # Kotlin — SignalingMessage types, Result type
├── databases/                 # (empty — no persistence yet)
└── docs/                      # Architecture diagrams
```

- **signaling-server** — runs locally on each player's machine, relays WebRTC signaling between browser and peer
- **web-client** — hosted on GitHub Pages, connects to the local service via WebWorker
- **signaling-protocol** — shared Kotlin types consumed by the signaling server

The web client maintains its own TypeScript types (Result, Maybe, SignalingMessage decoders). This is intentional — the browser is a separate bounded context with its own technology stack. No shared code across the Kotlin/TypeScript boundary.

See [docs/architecture.md](docs/architecture.md) for detailed diagrams and connection flow.

## Values and Practices

### Development Process

- **TDD** — tests come first, always. Feature-level tests define the contract, unit tests drive the implementation.
- **Trunk-based development** — commit directly to main, no pull requests. The pre-push hook gates quality. No force pushing — main is shared history.
- **Agile/XP** — small incremental stories, continuous integration, simple design.
- **[12-factor app](https://12factor.net/)** — config in the environment, explicit dependencies, strict build/release/run separation, logs to stdout.

### Code Style

**Mixed paradigm** — message passing from OOP, immutability and referential transparency from functional.

- **Minimize mutation** — use discriminated unions and state machines over mutable objects. A single `let` binding for state is acceptable when the alternatives are worse.
- **Railway Oriented Programming** — the Result type follows the [two-track model](https://fsharpforfunandprofit.com/rop/). Functions stay on the railway as long as possible:
  - `map` — transform the success track
  - `andThen` — bind on the success track (returns Result)
  - `or` — bind on the failure track, the dual of `andThen` (returns Result)
  - `onSuccess` — side effects on the success track, returns self
  - `onFailure` — side effects on the failure track, returns self
  - `either` — bind on both tracks (returns Result)
  - `mapEither` — terminal fold, the only off-ramp from the railway
  - `tryCatch` — bridges exception-throwing code into the two-track model
  - `AsyncResult` — `Promise<Result<S, F>>` with the same pipeline API, lifting the railway into async
  - No exceptions for expected failures. No `mapFailure` — if we fail, we handle it.
- **Maybe for nullable boundaries** — `maybe()` wraps `T | null` into a chainable type. Used to bridge schemawax decoder results.
- **Semantic naming within the domain** — `peer` not `getOther`, `signalingMessage` not `parseData`. Names should convey intent and meaning.
- **No generic names** — no `common/`, `util/`, `shared/`, or single-letter aliases. Name things for what they are.
- **Frozen objects** — `Object.freeze` on Result and Maybe instances. Immutability enforced at runtime.

### Frontend (TypeScript)

- **HTML5 standard elements** for content — no component libraries.
- **Raw CSS in separate files** — structural CSS close to the component, shared styles in reusable folders.
- **schemawax** for runtime decoding at untrusted boundaries (WebSocket messages). Types derived from decoders via `Decoder.Output`.
- **Dependency injection for testability** — factories and handlers accept their dependencies, no global state.
- **Arrow functions only** — no `function` declarations or expressions. Enforced by ESLint.
- **Named exports only** — no default exports. Enforced by ESLint.
- **ESLint** must pass before push.

### Backend (Kotlin)

- **Sealed classes** for algebraic types — `Result<S, F>`, `SignalingMessage`, `RegistrationError`.
- **`mapEither()` for terminal folds**, **`either()` for compositional branching** — both tracks handled explicitly, no `onSuccess`/`onFailure`. The bare Result is pure.
- **kotlinx-serialization** with `@SerialName` for JSON discriminators.
- **Feature-based packages** — everything for signaling lives in `signaling/`, not scattered across `config/`, `handlers/`, `services/`.

### Testing

- **Feature tests** define the external contract (what the system does).
- **Unit tests** drive the internal implementation (how it does it).
- **Test packages differ from source packages** to enforce encapsulation — tests should only use the public API.
- **Mocks via dependency injection** — no monkey-patching, no test-only seams in production code.
- **No `act()` warnings** — every test must let all state updates settle before asserting. Synchronous assertions after render are a bug when the component has effects. Use `waitFor` to wait for async state. See [Fix the "not wrapped in act" warning](https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning).
- **React Testing Library best practices** — query by role/label (not test IDs), avoid `container.querySelector`, use `screen` for queries. See [Common mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library).

### Quality Gates

A **pre-push hook** runs before every push:

1. Gradle tests (signaling-server + signaling-protocol)
2. ESLint (web-client)
3. Vitest (web-client)

If any step fails, the push is rejected.

**CI pipeline** (GitHub Actions) runs on every push to main:

1. Unit tests (Gradle + Vitest + ESLint)
2. End-to-end tests (Playwright against real backend on port 8081)

**Release pipeline** (triggered by version tags `v*`):

1. CI tests pass
2. Build native installers (dmg, msi, deb) via jpackage
3. Deploy frontend to GitHub Pages
4. Create GitHub Release with installer assets

Frontend and backend deploy atomically — a new frontend never goes live without a matching installer available.

## Development

### Prerequisites

- JDK 21 (auto-provisioned via foojay if not installed)
- Node 24 LTS
- Gradle 9.4 (via wrapper)
- direnv (optional, for automatic Node version switching)

### Setup

```bash
# Clone and enter the project
git clone https://github.com/RyanDur/battleship.git
cd battleship

# Optional: set up direnv for automatic Node version
cp .envrc.example .envrc
direnv allow

# Install frontend dependencies
cd applications/web-client
npm install
```

### Running

```bash
# Backend
./gradlew :applications:signaling-server:bootRun

# Frontend
cd applications/web-client
npm run dev
```

### Configuration

Environment variables are managed via [direnv](https://direnv.net/). Copy `.envrc.example` to `.envrc` and run `direnv allow`.

| Variable | Default | Used by | Purpose |
|----------|---------|---------|---------|
| `SERVER_ADDRESS` | `localhost` | Backend | Bind address (localhost only for security) |
| `SERVER_PORT` | `8080` | Backend | HTTP/WebSocket port |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | Backend | CORS allowed origins (comma-separated) |
| `HEARTBEAT_INTERVAL` | `5000` | Backend | Heartbeat send interval in milliseconds |
| `LOG_LEVEL` | `INFO` | Backend | Logging level (DEBUG, INFO, WARN, ERROR) |
| `VITE_SERVICE_URL` | `http://localhost:8080` | Frontend | Local service URL for health checks |
| `VITE_APP_VERSION` | `dev` | Frontend | Expected backend version (set from git tag at release) |

### Testing

```bash
# All Kotlin tests
./gradlew test

# All frontend tests
cd applications/web-client
npm test

# Frontend lint
cd applications/web-client
npm run lint

# End-to-end tests (requires backend jar built first)
./gradlew :applications:signaling-server:bootJar
cd applications/web-client
npm run e2e
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript 5.9, Vitest 4, Playwright |
| Backend | Kotlin 2.3.10, Spring Boot 3.4.1, JVM 21 |
| Serialization | kotlinx-serialization (Kotlin), schemawax (TypeScript) |
| Networking | WebSocket (signaling), WebRTC (P2P data channels) |
| CI/CD | GitHub Actions, GitHub Pages, GitHub Releases |
| Build | Gradle 9.4 (Kotlin), npm (TypeScript) |
