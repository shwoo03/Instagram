# AGENTS.md example: backend API

## Project goal

Build and maintain a backend API service with stable contracts, clear validation,
and safe operational defaults.

## Success criteria

- API tests pass.
- API docs or schema files are updated when endpoints change.
- No secrets are committed.
- New dependencies are recorded in `docs/REFERENCES.md`.

## Working rules

- Ask before changing database schemas, migrations, auth, or deployment.
- Keep request validation, serialization, and error handling consistent.
- Do not add background workers unless the queue or scheduler choice is recorded.
- Prefer small service boundaries over broad shared utility modules.

## Reuse-first policy

Run the reuse-first recipe before implementing:

- auth/session
- migrations
- queues or schedulers
- serializers
- observability/tracing
- SDK/client wrappers

## Validation

- Primary validation command: `pytest` or `<fill in>`
- Secondary checks: `ruff check .` or `<fill in>`
- If validation cannot run, record the reason in `docs/HANDOFF.md`.

## Handoff

Update `docs/HANDOFF.md` with changed endpoints, migrations, dependency changes,
validation evidence, blockers, and next action.

## References

- Record dependency and architecture decisions in `docs/REFERENCES.md`.
- Official links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Security notes

- Never commit secrets, tokens, or production connection strings.
- Treat request input and external service responses as untrusted.
- Confirm before running migrations or destructive database commands.

