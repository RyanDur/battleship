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
- **Trunk-based development** — commit directly to main, no pull requests. The pre-push hook gates quality.
- **Agile/XP** — small incremental stories, continuous integration, simple design.

### Code Style

**Mixed paradigm** — message passing from OOP, immutability and referential transparency from functional.

- **Minimize mutation** — use discriminated unions and state machines over mutable objects. A single `let` binding for state is acceptable when the alternatives are worse.
- **Result types for error handling** — `map`, `flatMap`, `or`, `either`. No exceptions for expected failures. No `mapFailure` — if we fail, we handle it.
- **Maybe for nullable boundaries** — `maybe()` wraps `T | null` into a chainable type. Used to bridge schemawax decoder results.
- **Semantic naming within the domain** — `peer` not `getOther`, `signalingMessage` not `parseData`. Names should convey intent and meaning.
- **No generic names** — no `common/`, `util/`, `shared/`, or single-letter aliases. Name things for what they are.
- **Frozen objects** — `Object.freeze` on Result and Maybe instances. Immutability enforced at runtime.

### Frontend (TypeScript)

- **HTML5 standard elements** for content — no component libraries.
- **Raw CSS in separate files** — structural CSS close to the component, shared styles in reusable folders.
- **schemawax** for runtime decoding at untrusted boundaries (WebSocket messages). Types derived from decoders via `Decoder.Output`.
- **Dependency injection for testability** — factories and handlers accept their dependencies, no global state.
- **ESLint** must pass before push.

### Backend (Kotlin)

- **Sealed classes** for algebraic types — `Result<S, F>`, `SignalingMessage`, `RegistrationError`.
- **`either()` for side effects** on Result, not `onSuccess`/`onFailure`. The bare Result is pure.
- **kotlinx-serialization** with `@SerialName` for JSON discriminators.
- **Feature-based packages** — everything for signaling lives in `signaling/`, not scattered across `config/`, `handlers/`, `services/`.

### Testing

- **Feature tests** define the external contract (what the system does).
- **Unit tests** drive the internal implementation (how it does it).
- **Test packages differ from source packages** to enforce encapsulation — tests should only use the public API.
- **Mocks via dependency injection** — no monkey-patching, no test-only seams in production code.

### Quality Gates

A **pre-push hook** runs before every push:

1. Gradle tests (signaling-server + signaling-protocol)
2. ESLint (web-client)
3. Vitest (web-client)

If any step fails, the push is rejected.

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

### Testing

```bash
# All Kotlin tests
./gradlew test

# All frontend tests
cd applications/web-client
npm test

# Frontend lint
cd applications/web-client
npx eslint .
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript 5.9, Vitest 4 |
| Backend | Kotlin 2.3.10, Spring Boot 3.4.1, JVM 21 |
| Serialization | kotlinx-serialization (Kotlin), schemawax (TypeScript) |
| Networking | WebSocket (signaling), WebRTC (P2P data channels) |
| CI/CD | GitHub Actions, GitHub Pages, GitHub Releases |
| Build | Gradle 9.4 (Kotlin), npm (TypeScript) |
