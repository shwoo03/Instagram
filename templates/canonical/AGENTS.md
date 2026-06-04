# AGENTS.md

This file is the canonical instruction source for coding agents in this project.

## Project goal

- <one sentence>

## Success criteria

- <what must be true before this task/project is considered done>

## Working rules

- Confirm the goal before large changes.
- Prefer the smallest useful change.
- Do not add secrets, credentials, or production tokens to the repository.
- Ask before destructive, irreversible, deployment, or dependency-heavy changes.

## Reuse-first policy

- Before implementing a non-trivial subsystem, search for official SDKs, maintained libraries, or mature open-source projects.
- Prefer using an existing SDK, dependency, wrapper, or adapter over writing custom infrastructure.
- Record selected/rejected options in `docs/REFERENCES.md`.
- If implementing from scratch, briefly record why existing options do not fit.
- Do not copy source code into this repository unless license, provenance, copied files, modifications, and maintenance ownership are recorded.
- Run `recipes/open-source-reuse.md` before building: agent runtime, MCP integration, workflow engine, auth/session, parser/serializer, queue/scheduler, observability/tracing, or plugin systems.

## Validation

- Primary validation command: <fill in>
- Secondary checks: <fill in or "none">
- If validation cannot be run, record why in the handoff.

## Handoff

- Update `docs/HANDOFF.md` before stopping work.
- Include current state, next action, blockers, and evidence.

## References

- Project references live in `docs/REFERENCES.md`.
- Official docs live in `templates/links.md` in the source kit.
