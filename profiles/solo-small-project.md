# Solo Small Project Profile

Use this profile for small personal projects, prototypes, scripts, and small
apps.

## Copy

- `templates/canonical/AGENTS.md` -> `AGENTS.md`
- `templates/canonical/PROJECT_PROFILE.md` -> `docs/PROJECT_PROFILE.md`
- `templates/canonical/HANDOFF.md` -> `docs/HANDOFF.md`
- `templates/canonical/SECURITY.md` -> `docs/SECURITY.md`

## Optional

- `templates/canonical/REFERENCES.md` -> `docs/REFERENCES.md`

## Do Not Add By Default

- custom agent orchestration CLI
- activity log JSONL
- proposal queues
- feature tier systems
- specialist ledgers
- MCP servers
- skills directory
- hooks
- plugins

## Recommended Harness

Use Codex or Claude Code directly. Keep the project instructions short.

## Reuse Policy

- Implement tiny helpers directly.
- For infrastructure-like features, run `recipes/open-source-reuse.md`.
- Record only the selected/rejected decision in `docs/REFERENCES.md`.
- Do not add heavy dependency gates by default.
- Avoid hooks/plugins by default.
- Use normal validation commands before lifecycle automation.
- Use `docs/HANDOFF.md` only for continuity.
- Do not add `docs/PROJECT_MEMORY.md`, `research/`, evals, or worktrees unless friction appears.
