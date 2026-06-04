# AGENTS.md example: OpenAI Agents SDK app

## Project goal

Build an application that uses the official OpenAI Agents SDK for runtime agent
behavior.

## Success criteria

- Runtime agent contracts are documented.
- Tool allowlists and approval points are reviewed.
- Evals cover critical success, failure, and safety paths.
- SDK and dependency decisions are recorded in `docs/REFERENCES.md`.

## Working rules

- Keep repository instructions separate from runtime agent prompts.
- Put runtime prompts under `app/agents/instructions/` or the app's equivalent.
- Do not rebuild SDK orchestration, handoffs, tracing, or eval features in local
  helper scripts.
- Ask before expanding tool permissions or adding external data access.

## Reuse-first policy

Use the official SDK for runtime behavior when it fits. Run
`recipes/open-source-reuse.md` before custom orchestration, tool execution,
state, approval, tracing, or eval infrastructure.

## Validation

- Primary validation command: `<runtime test/eval command>`
- Secondary checks: `<lint/type/security command>`

## Handoff

Update `docs/HANDOFF.md` or the project handoff with runtime behavior changed,
tool permissions changed, eval results, blockers, and next action.

## References

- Project decisions live in `docs/REFERENCES.md`.
- Official links live in the source kit's `templates/links.md`.

## Security notes

- Keep secrets outside the repository.
- Require approval for risky tools.
- Redact private user data from traces, handoffs, and examples.

