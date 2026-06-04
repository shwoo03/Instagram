# OpenAI Agents SDK app example

Use this shape when the application itself embeds an OpenAI Agents SDK runtime.
This is a documentation structure, not runnable code.

Official links live in `templates/links.md`.

Separation of concerns:

- kit docs: project operating instructions for coding agents
- SDK runtime: app code owned by the product
- runtime agent prompts: app-specific instructions, not repository `AGENTS.md`

See `recipes/openai-agents-sdk.md` before adding runtime code.

Suggested shape:

```text
AGENTS.md
docs/
  PROJECT_PROFILE.md
  SECURITY.md
  REFERENCES.md
app/
  agents/
    README.md
    agent-contract.md
    tool-allowlist.md
    eval-plan.md
    handoff-policy.md
```

