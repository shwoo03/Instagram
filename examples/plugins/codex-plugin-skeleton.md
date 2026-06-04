# Codex plugin skeleton

Official links: see `templates/links.md`.

## Conceptual structure

```text
my-plugin/
  .codex-plugin/
    plugin.json
  skills/
    example-skill/
      SKILL.md
  hooks/
    hooks.json
  .mcp.json
  .app.json
  assets/
```

## Minimal manifest

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Reusable project workflow bundle",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

## Review checklist

- Are bundled hooks necessary?
- Are bundled MCP servers necessary?
- Are skills documented?
- Are permissions narrow?
- Is license/provenance recorded?
- Is uninstall/rollback documented?
- Is this better than a project-local recipe?

