# Claude Code workflow recipe

Official links: see `templates/links.md`.

## When to use

- Claude Code is the primary local coding harness.
- The project benefits from Claude-specific adapters, hooks, subagents, skills, or MCP.

## When not to use

- The project only needs generic instructions consumed by multiple harnesses.
- Hooks/subagents would add hidden automation without clear value.

## Minimal setup

```text
AGENTS.md          # canonical
CLAUDE.md          # generated adapter
docs/PROJECT_PROFILE.md
docs/HANDOFF.md
docs/SECURITY.md
```

## Checklist

- Generate `CLAUDE.md` from `AGENTS.md`.
- Enable hooks only for explicit lifecycle checks, guardrails, or audit/control.
- Use plugins only for packaging reviewed reusable skills/hooks/agents/MCP.
- Define subagents only when scope, permissions, or context separation is needed.
- Keep skills as reusable workflows, not one-off prompts.
- Keep MCP config reviewed and secret-safe.
- Do not include hooks or plugins in default project setup.

## Common mistakes

- Using hooks as hidden automation.
- Enabling too many tools.
- Letting `CLAUDE.md` drift from `AGENTS.md`.
- Making subagents the default for simple tasks.
- Using plugins to hide hooks, MCP, shell permissions, or settings.
- Adding hooks/plugins without owner, review date, and rollback path.

## Subagent decision rule

Use a subagent only when at least one is true:

- different tool permissions are needed
- long context should be isolated
- review/security/research role is independent
- the role repeats across tasks

Do not use a subagent when:

- it is a single-file edit
- the task is simple
- the goal is just "think harder"
- coordination cost exceeds benefit

Example subagents live in `examples/claude-subagents/`.

## Skills decision rule

Use a skill only when:

- a workflow repeats
- activation is clear
- inputs/outputs can be described
- verification is possible

Do not use a skill for one-off prompts.

## Hooks and plugins

- Hooks are for explicit lifecycle checks only.
- Plugins are for packaging reviewed reusable components.
- Default project setup should not include hooks or plugins.
- Read `recipes/hook-policy.md` before enabling hooks.
- Read `recipes/plugin-packaging.md` before creating or adopting plugins.
- Example hooks live in `examples/hooks/`.
- Example plugin skeletons and checklists live in `examples/plugins/`.
