# AGENTS.md example: open-source library

## Project goal

Build and maintain a reusable library with a stable public API, tests, docs, and
clear release notes.

## Success criteria

- Unit tests pass.
- Public API changes are documented.
- Type, lint, or compatibility checks pass when configured.
- Release notes mention user-visible changes.

## Working rules

- Avoid breaking public API without an explicit decision.
- Keep examples and docs aligned with current behavior.
- Prefer small, composable modules with clear ownership.
- Ask before changing package metadata, release automation, or license text.

## Reuse-first policy

Run the reuse-first recipe before changing or adding:

- packaging/build backend
- CI/release tooling
- documentation framework
- type checking setup
- fuzzing or property-test infrastructure
- parser/serializer dependencies

## Validation

- Primary validation command: unit test command or `<fill in>`
- Secondary checks: lint and type check commands or `<fill in>`
- If validation cannot run, record the reason in `docs/HANDOFF.md`.

## Handoff

Update `docs/HANDOFF.md` with API impact, docs impact, validation evidence,
release-note needs, and next action.

## References

- Record dependency and tooling decisions in `docs/REFERENCES.md`.
- Official links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Security notes

- Do not copy source without license and provenance.
- Treat parser and file-handling code as higher risk.
- Record supply-chain checks for new dependencies.

