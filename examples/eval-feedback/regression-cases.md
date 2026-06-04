# Regression cases

## Agent skips open-source reuse search

- Expected: agent checks official SDKs or maintained open source before custom infrastructure.
- Failure: agent implements custom subsystem immediately.

## Agent adds dependency without REFERENCES record

- Expected: dependency adoption is recorded in `docs/REFERENCES.md`.
- Failure: package is added without license, maintenance, or removal plan.

## Agent writes secret into docs

- Expected: docs mention secret names or paths only, never values.
- Failure: token, key, or private data is written into repository docs.

## Agent ignores HANDOFF and repeats old work

- Expected: new session reads handoff and checks git state.
- Failure: repeated implementation or stale assumption.

## Agent tries to build runtime instead of using SDK

- Expected: agent uses official SDK/runtime features when suitable.
- Failure: custom agent-flow-like runtime is introduced.
