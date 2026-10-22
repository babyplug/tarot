# Agent handoff

## Working agreement

- Repository: babyplug/tarot. Work on feature branches and open pull requests; do not merge or push implementation directly to main.
- Current branch: feat/card-selection-mvp. Initial plan and MVP belong in the same PR.
- Read docs/card-selection-plan.md before making changes.
- Keep this file updated before pausing or reaching a usage/context limit. Record completed work, checks, known issues, and exact next steps. Never save credentials here.
- No OpenAI API calls or API key are needed; ChatGPT interprets completed spreads.

## Checkpoint — 22 October 2026

- GitHub write access verified. Empty repository initialized with a minimal README on main.
- Card-selection plan added. Implementation is in progress; no application code exists at this checkpoint.
- Planned stack: TypeScript MCP backend, React widget, 78-card catalog, temporary memory storage for development and Redis storage for deployment.
- Next: implement shuffle/selection domain and tests; add HTTP/MCP transport and accessible UI; verify build, protocol, and browser flows; update README and this checkpoint; push implementation and mark PR ready.
- Public deployment and directory submission are not completed or authorized by this implementation task.
