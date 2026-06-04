# Plugin packaging recipe

Official links: see `templates/links.md`.

## Purpose

Plugins package reusable agent extensions such as skills, hooks,
agents/subagents, MCP config, app config, commands, assets, or settings.

Use plugins only when a project or team needs to share a reviewed extension
bundle.

## When to use a plugin

Use a plugin when:

- The same skill/hook/agent/MCP setup is reused across multiple projects.
- A team wants a reviewed bundle instead of copying files manually.
- The extension has a clear owner, version, changelog, and rollback path.
- The plugin can be tested independently.

## When not to use a plugin

Do not create a plugin when:

- A single project-local skill is enough.
- A short `AGENTS.md` rule is enough.
- The feature is experimental and not reviewed.
- The bundle would hide hooks, MCP servers, or shell tools.
- There is no owner to maintain it.
- You are only avoiding writing documentation.

## Codex plugin shape

Example conceptual structure:

```text
my-plugin/
  .codex-plugin/
    plugin.json
  skills/
    <skill-name>/
      SKILL.md
  hooks/
    hooks.json
  .mcp.json
  .app.json
  assets/
```

Notes:

- `.codex-plugin/plugin.json` is the manifest.
- Keep skills, hooks, assets, `.mcp.json`, and `.app.json` at plugin root.
- Do not place them inside `.codex-plugin/`.

## Claude plugin shape

Example conceptual structure:

```text
my-plugin/
  .claude-plugin/
    plugin.json
  skills/
    <skill-name>/
      SKILL.md
  agents/
    <agent-name>.md
  hooks/
    hooks.json
  .mcp.json
  .lsp.json
  monitors/
  bin/
  settings.json
```

Notes:

- `.claude-plugin/plugin.json` is the manifest.
- Keep skills, agents, hooks, MCP config, binaries, settings, and assets at
  plugin root.
- Do not place them inside `.claude-plugin/`.

## Plugin adoption checklist

Before installing or recommending a plugin:

- Source URL:
- Publisher/owner:
- License:
- Version/commit:
- Components included:
  - skills
  - hooks
  - agents/subagents
  - MCP servers
  - commands
  - binaries
  - settings
  - monitors/background jobs
- Files/directories written:
- Network access:
- Secret handling:
- Tool permissions:
- Hook behavior:
- MCP behavior:
- Uninstall/rollback path:
- Update policy:
- Security review:
- Adoption mode:
  - reference-only | concept-only | direct-dependency | adapter | fork | vendored-source | rejected

## Safety rules

- Do not install plugins globally by default.
- Prefer project-local testing first.
- Only load plugin archives/URLs you control or trust.
- Review bundled hooks before enabling.
- Review bundled MCP servers before enabling.
- Review bundled binaries before enabling.
- Avoid plugins that silently add broad shell/filesystem/network access.
- Avoid plugins without license/provenance.
- Record plugin adoption in `docs/REFERENCES.md`.

## Common mistakes

- Treating community plugins as official recommendations.
- Installing plugin packs before checking their components.
- Copying plugin files without recording license/provenance.
- Letting plugin hooks duplicate project hooks.
- Keeping both standalone `.claude/` or `.codex/` files and plugin-provided
  equivalents, causing duplicate behavior.
- Turning the starter kit into a plugin manager.

