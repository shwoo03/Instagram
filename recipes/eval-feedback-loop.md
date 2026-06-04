# Eval feedback loop recipe

Official links: see `templates/links.md`.

## Purpose

Use evals and traces to improve agent workflows, prompts, recipes, and examples.

This kit does not implement eval tooling. It provides a planning structure.

## When to use

Use this for:

- agent-runtime-app profile
- SDK-based agent apps
- repeated agent failures
- prompt/skill/subagent changes
- tool/MCP changes
- model upgrades
- safety-sensitive behavior

## When not to use

Do not create evals for:

- one-off documentation changes
- tiny helpers
- early exploration with no stable behavior
- cases where a simple unit test is enough

## Minimal eval loop

1. Define expected behavior.
2. Collect small representative cases.
3. Include positive and negative cases.
4. Run current behavior.
5. Record failure categories.
6. Improve prompt/tool/recipe/code.
7. Re-run.
8. Promote repeated lessons to docs.

## Eval plan template

- Behavior:
- User-visible goal:
- Test cases:
- Positive cases:
- Negative cases:
- Edge cases:
- Safety cases:
- Expected outputs:
- Failure categories:
- Regression trigger:
- Owner:
- Review date:

## Trace review template

- Session/run:
- Goal:
- Tools used:
- Where it went wrong:
- Missing context:
- Bad instruction:
- Bad tool permission:
- Bad source/research:
- Proposed fix:
- Promote to:
  - AGENTS.md
  - recipe
  - example
  - PROJECT_PROFILE
  - SECURITY
  - REFERENCES
  - no change

## Common failure categories

- ignored `AGENTS.md`
- skipped reuse-first search
- failed to record REFERENCES decision
- overused custom implementation
- stale handoff
- broad tool permission
- missing eval case
- wrong SDK/runtime boundary
- MCP tool boundary unclear

## Anti-patterns

- Using evals as decoration.
- Running evals without acting on failures.
- Making eval tooling a default dependency.
- Replacing normal software tests with LLM evals.
- Saving private traces without sanitization.
