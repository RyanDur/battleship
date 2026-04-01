# Agent Workflow

Rules for multi-model sessions. Opus orchestrates, Sonnet implements, Haiku verifies.

## Roles

**Opus** — product manager, architect, code reviewer. Makes decisions. Does not write implementation code. Delegates research to Haiku, implementation to Sonnet.

**Sonnet** — developer. One objective per launch. TDD. Commits when green, does not push.

**Haiku** — researcher and verifier. Reads files, traces paths, pre-screens diffs, watches CI. Returns concise summaries. If Haiku hits usage limits, Sonnet takes over verification — never Opus.

## Delegation

Opus spends tokens on decisions, not data gathering. Before reading a source file: "Could Haiku summarize what I need?"

**Haiku** — ask a specific question, get a concise answer. Opus makes the call based on the summary.

**Sonnet** — one objective per launch. Include the problem, root cause, key file paths, how to verify, and the quality bar. Exclude step-by-step instructions and code snippets. Sonnet reads the codebase to absorb patterns — don't duplicate what it will read anyway.

**After Sonnet returns** — don't accept the first result. Check for quality gaps before pushing. If it works but could be better, that's a review failure.

## Quality

Strict review. Never soft-pass. ([Fowler, "Avoiding Repetition"](https://www.martinfowler.com/ieeeSoftware/repetition.pdf))

Repetition is a design signal. It's not just duplicated text — it's duplicated *structure*. Two routines with the same flow but different steps are repetition. The fix isn't deleting lines — it's finding the abstraction that captures the shared structure. If you see repetition and approve it, the review isn't done.

A clean Sonnet launch that ships right is cheaper than two launches where the first gets approved with issues.

## Feedback Loops

Optimize the loops you repeat most. ([Cochran/Fowler, "Developer Effectiveness"](https://martinfowler.com/articles/developer-effectiveness.html))

**The Opus → Sonnet → Opus loop** is the most expensive. Tighten it:
- Precise objectives reduce cost. Vague objectives produce code you push back on.
- Include the quality bar in the objective. Don't discover gaps in review and relaunch.
- Every rejected Sonnet launch is a feedback loop that ran too long before correcting.

**Make loops visible.** Silence during long operations breaks engagement. Before launching an agent: say what and why. During CI: report status. On failure: explain and act. Don't silently re-run.

## Session Shape

1. **Opus** reads memory + CLAUDE.md
2. **Haiku** researches — answers Opus's questions
3. **Opus** decides — root cause, objective, quality bar
4. **Sonnet** implements — one objective, TDD, commits
5. **Haiku** pre-screens the diff
6. **Opus** reviews strictly — pushes back on quality gaps
7. **Opus** pushes
8. **Haiku** watches CI
9. Repeat from 2
