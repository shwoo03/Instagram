# AGENTS.md example: agent runtime app

## Project goal

Build an application that embeds an agent runtime while keeping repository
instructions, runtime prompts, tools, evals, and guardrails clearly separated.

## Success criteria

- Runtime agent contracts are documented.
- Tool allowlists and approval points are documented.
- Evals cover critical success, failure, and safety paths.
- Dependency decisions are recorded in `docs/REFERENCES.md`.

## Working rules

- `AGENTS.md` is for coding agents working in the repository.
- Runtime agent prompts belong in app-owned agent instruction files.
- Tool definitions, guardrails, evals, and handoffs belong in app runtime code or docs.
- Ask before granting tools that mutate files, systems, accounts, or data.

## Reuse-first policy

- Prefer official OpenAI Agents SDK or Claude Agent SDK for runtime loops.
- Run the reuse-first recipe before building agent orchestration, tool execution,
  approvals, state, tracing, or eval infrastructure.
- Record why official SDK or maintained libraries do not fit before custom runtime code.

## Validation

- Primary validation command: runtime test/eval command or `<fill in>`
- Secondary checks: lint/type/security checks or `<fill in>`
- Release gate: critical eval set passes.

## Handoff

Update `docs/HANDOFF.md` with runtime behavior changed, tool permissions changed,
eval results, security notes, and next action.

## References

- Record SDK, dependency, and tool decisions in `docs/REFERENCES.md`.
- Official links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Security notes

- Keep secrets outside the repository.
- Use explicit tool allowlists.
- Require approval for risky or destructive tools.
- Do not mix repository operating rules with runtime agent behavior.

