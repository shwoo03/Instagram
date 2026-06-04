# Codex workflow recipe

Official links: see `templates/links.md`.

## When to use

- Codex is the primary coding agent.
- The project needs reusable project instructions, not a custom runtime.
- Work is mostly code editing, review, refactoring, testing, or local validation.

## When not to use

- The application needs an embedded agent runtime.
- The project needs product-level tool orchestration, tracing, or handoffs.

## Minimal setup

```text
AGENTS.md
docs/PROJECT_PROFILE.md
docs/HANDOFF.md
docs/SECURITY.md
docs/REFERENCES.md
```

## Checklist

- Fill `AGENTS.md`.
- Fill `docs/PROJECT_PROFILE.md`.
- Set one primary validation command.
- Update `docs/HANDOFF.md` before stopping.
- Generate extra Codex notes only when the project needs them.

## Common mistakes

- Duplicating long rules in multiple files.
- Leaving stale generated adapters.
- Putting secrets in `AGENTS.md`.
- Adding a local workflow CLI before repeated work proves it helps.

