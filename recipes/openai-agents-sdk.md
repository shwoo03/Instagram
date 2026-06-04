# OpenAI Agents SDK recipe

Official links: see `templates/links.md`.

## When to use

- The app needs an embedded agent runtime.
- The product needs tools, handoffs, guardrails, state, tracing, or evals.
- Agent behavior is part of application logic.

## When not to use

- You only need coding assistant instructions.
- There is no runtime app or product workflow.
- A simple API call or local script is enough.

## Minimal setup

```text
AGENTS.md
docs/PROJECT_PROFILE.md
docs/HANDOFF.md
docs/SECURITY.md
src/agents/
  instructions/
  tools/
  handoffs/
  evals/
```

## Minimal architecture

Suggested shape:

```text
app/
  agents/
    README.md
    instructions/
    tools/
    handoffs/
    guardrails/
    evals/
  services/
  tests/
```

Repository `AGENTS.md` is for coding agents working in the repository. Runtime
agent instructions belong under `app/agents/instructions/` or the app's
equivalent. Do not mix repository operating instructions with runtime prompts.

## Agent contract template

- Agent name:
- Purpose:
- Inputs:
- Outputs:
- State:
- Tools:
- Human approval points:
- Failure handling:
- Eval cases:

## Responses API vs Agents SDK

- Use Responses API when a simple stateful API interaction is enough.
- Use Agents SDK when the app needs structured orchestration, tools, handoffs,
  guardrails, tracing, or evals.

## Checklist

- Define the agent input/output contract.
- Define the tool allowlist.
- Add guardrails/evals for production paths.
- Keep secrets outside the repository.
- Do not rebuild orchestration in kit scripts.

## Common mistakes

- Mixing repository operating instructions with runtime agent prompts.
- Granting tools broader access than the user flow needs.
- Reimplementing SDK handoffs, tracing, or orchestration.

## Production checklist

- Tool allowlist defined.
- Risky tools require approval.
- Secrets are outside repo.
- Eval cases cover success and failure paths.
- Tracing/observability owner is defined.
- Fallback behavior is defined.
- Dependency/adoption decision recorded in `docs/REFERENCES.md`.

## Example

See `examples/openai-agents-sdk-app/` for a documentation-only project shape.

## Policy sentence

This repo uses the official SDK for agent runtime behavior. The starter kit only
supplies canonical project docs, adapters, recipes, and profiles.
