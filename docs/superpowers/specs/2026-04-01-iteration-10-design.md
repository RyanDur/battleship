# Iteration 10: UX Polish & Release Pipeline

## Story 1: Game boards are readable during gameplay

**Who** — a player in a game

**Problem** — The game boards during gameplay are unreadable. Cells render as unstyled inline buttons with no grid structure, no visual distinction between hits and misses, and no axis labels to orient the player.

**Behaviors:**
- Both boards (Your fleet, Tracking board) display as a 10×10 grid with clear cell boundaries
- Column letters (A–J) label the top; row numbers (1–10) label the left side
- Hits, misses, and sunk cells are visually distinct from empty cells
- The placement board also gains axis labels for consistency across all boards
- The revealed opponent board at game over uses the same grid treatment

**Notes:** The placement board already has grid styles (`.board-setup-grid`, `.board-setup-cell` in `layout.css`). The game boards should follow the same CSS pattern. Axis labels require markup changes — the grid expands to include a header row and label column.

---

## Story 2: Ship placement has preview and intuitive rotation

**Who** — a player placing ships on their board

**Problem** — The rotate button exists but isn't discoverable. There's no visual feedback about where a ship will land before clicking. Players expect to see where the ship will go and rotate it naturally.

**Behaviors:**
- When a ship is selected and the player hovers over a cell, a translucent preview shows where the ship would occupy
- If the preview overlaps an existing ship or extends off the board, the preview appears in a warning color
- Clicking an invalid preview location has no effect
- The player can rotate the preview by pressing R or by clicking the existing rotate button
- Arrow keys move focus between cells; Enter places the ship at the focused cell in the current orientation
- The rotate button remains visible as a labeled control

**Notes:** Preview is visual-only — the translucent cells are not separate clickable elements. Rotation changes orientation state, which updates where the preview renders on hover. Collision detection compares preview cells against placed ships and board boundaries. Keyboard navigation leverages the existing button grid.

---

## Story 3: Release pipeline deploys tested artifacts without rebuilding

**Who** — a developer releasing a new version

**Problem** — The release pipeline re-runs CI as a reusable workflow, rebuilding and retesting the frontend. This is redundant when the commit has already passed CI, and risks deploying a different build than what was tested.

**Behaviors:**
- Pushing changes to main triggers CI (test, build, upload artifact) — no change from today
- Pushing a tag triggers the release workflow, which waits for CI to complete on that commit (if still running), then downloads and deploys the tested frontend artifact — no frontend rebuild
- Pushing changes and a tag together triggers CI first, then release deploys the tested artifact
- If CI fails for the tagged commit, the release does not deploy

**Notes:** The golden artifact applies to the frontend dist — built once in CI, tested in e2e, deployed in release. Native installers (jpackage) are OS-specific and built in the release workflow, not CI — that doesn't change. The current release workflow calls CI via `workflow_call` which re-runs everything; this should change to downloading the artifact CI already uploaded.
