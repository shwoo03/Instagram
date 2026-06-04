# Project memory

Use this optional file for stable project facts that should survive sessions.

Do not use it as a raw activity log.

## Stable facts

- The project is a starter kit, not an agent runtime.
- Official links are centralized in `templates/links.md`.
- Community systems are reference-only unless a project records adoption.

## Non-obvious setup

- Scaffold helpers are optional and only copy/generate Markdown surfaces.
- Harness adapters are generated from canonical instructions.

## Recurring pitfalls

- Do not add runtime logs, proposal queues, or agent-flow-like workflows.
- Do not copy examples into new projects by default.

## Successful commands / recipes

- `python3 -m py_compile tools/scaffold/*.py`
- `recipes/open-source-reuse.md`
- `recipes/session-continuity.md`

## Important decisions

- Runtime memory belongs to official SDKs/frameworks when building agent apps.
- Project memory is documentation, not product memory.

## Open questions

- Which dogfood findings repeat across multiple real projects?

## Promotion rules

- If this becomes a rule, move it to `AGENTS.md`.
- If this becomes project scope, move it to `docs/PROJECT_PROFILE.md`.
- If this is about security or permissions, move it to `docs/SECURITY.md`.
- If this is source/adoption evidence, move it to `docs/REFERENCES.md`.
- If this is detailed research, move it to `research/`.

## Hygiene

- No secrets.
- No private tokens.
- No customer data.
- Review stale entries periodically.
