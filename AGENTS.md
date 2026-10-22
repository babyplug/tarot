# Agent handoff

## Working agreement

- Repository: babyplug/tarot. Work on feature branches and open pull requests; do not merge or push implementation directly to main.
- Current branch: feat/card-selection-mvp. Pull request: https://github.com/babyplug/tarot/pull/1.
- Initial plan and implementation belong in this PR. Read docs/card-selection-plan.md and README.md when resuming.
- Update this checkpoint before pausing or hitting a context/usage limit. Record completed work, exact checks, blockers, and next steps. Never save credentials.
- No OpenAI API calls or API key are needed. ChatGPT interprets completed spreads.
- Use Node 24, npm ci, npm run check, and npm run test:e2e. Keep lockfile changes committed.

## Checkpoint — 22 October 2026 — implementation verification in progress

Completed:

- Empty repository initialized with a minimal README on main. Plan and initial checkpoint opened in draft PR #1.
- TypeScript domain: 78-card bilingual catalog, four spreads, secure shuffle, locked selections, deterministic retry keys, revisions, and immutable completion.
- Memory and Redis stores; shared-store compare-and-set transitions, two-hour idle and 24-hour maximum TTL, capability-based session access.
- Stateless HTTP MCP service and embedded React widget; manual and automatic draws, original SVG art, English/Thai controls, pagination, restart confirmation, refresh recovery, and interpretation/copy handoff.
- Production configuration rejects memory storage, insecure origin, and preview enabled. Anonymous development preview is opt-in.

Verification at this checkpoint:

- npm run check: passed, including 24 domain/service/MCP/HTTP tests, TypeScript, and widget/backend build.
- Playwright desktop/mobile checks: running; do not claim they passed until results are recorded.
- Redis adapter: real-server integration check still to run. Do not claim production Redis validation yet.
- Real signed-in ChatGPT host, production hosting, and public directory submission: not verified or performed.

Next steps:

1. Finish Playwright checks and inspect desktop/mobile layout; fix any failures.
2. Add Docker/Compose, CI, Redis integration checks, and deployment/submission notes.
3. Review session isolation, expiry, retry behavior, host handoff, and documentation accuracy.
4. Commit the implementation to the existing PR branch, update this handoff and PR description, and mark the PR ready once required checks pass.

Environment note: the standard Playwright browser download was unavailable here. A transient npm-packaged Chromium was extracted outside the repository for local browser checks; this is not an application dependency. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed Chromium if the standard download is unavailable.
