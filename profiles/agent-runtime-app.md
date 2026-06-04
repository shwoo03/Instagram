# Agent Runtime App Profile

Use this profile when the application itself includes an agent workflow.

## Copy

- All solo-small templates.
- `templates/canonical/REFERENCES.md`.

## Add

```text
src/agents/
  instructions/
  tools/
  handoffs/
  evals/
```

## Recommended Recipes

- `recipes/openai-agents-sdk.md`
- `recipes/claude-agent-sdk.md`
- `recipes/mcp-connection.md`
- `recipes/security-permissions.md`
- `recipes/hook-policy.md`
- `recipes/plugin-packaging.md`
- `recipes/session-continuity.md`
- `recipes/eval-feedback-loop.md`

## Decision Rule

- Use OpenAI Agents SDK when building a product runtime with tools, handoffs,
  tracing, and streaming.
- Use Claude Agent SDK when you need Claude Code-style local automation or
  hooks in a programmatic workflow.

## Runtime Policy

- Do not build a custom agent runtime unless official SDKs are insufficient.
- Prefer OpenAI Agents SDK or Claude Agent SDK for runtime loops.
- Prefer official SDK runtime over hook/plugin-driven runtime.
- Hooks/plugins may assist validation or packaging, but must not become the runtime.
- Use official SDK sessions/conversation state where runtime memory is needed.
- Use `recipes/eval-feedback-loop.md` for behavior changes.
- Record runtime memory design and tool boundaries.
- Use MCP only when external tools/data need a standard interface.
- Record tool allowlist and security boundary.
- Put app-specific logic in the app, not in the starter kit.
