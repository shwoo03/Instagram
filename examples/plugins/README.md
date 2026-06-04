# Plugin examples

Plugins package reusable agent extensions.

Use these examples only after reading `recipes/plugin-packaging.md`.

Plugins are not copied into scaffolded projects by default.

## Use plugins when

- a reviewed extension bundle is reused across projects
- skills/hooks/agents/MCP need versioned packaging
- the team has an owner and rollback path

## Do not use plugins when

- one local skill is enough
- a short recipe is enough
- the plugin hides hooks, MCP, or shell permissions
- there is no maintenance owner

