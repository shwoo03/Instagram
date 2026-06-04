# Claude plugin skeleton

Official links: see `templates/links.md`.

## Conceptual structure

```text
my-plugin/
  .claude-plugin/
    plugin.json
  skills/
    example-skill/
      SKILL.md
  agents/
    security-reviewer.md
  hooks/
    hooks.json
  .mcp.json
  bin/
  settings.json
```

## Minimal manifest

```json
{
  "name": "my-plugin",
  "description": "Reusable Claude Code workflow bundle",
  "version": "0.1.0",
  "author": {
    "name": "Your team"
  }
}
```

## Review checklist

- Are skills concise and documented?
- Are agents bounded by role and tools?
- Are hooks reviewed?
- Are MCP servers reviewed?
- Are binaries necessary?
- Does settings.json change permissions?
- Is uninstall/rollback documented?

