# Claude Agent SDK recipe

Official links: see `templates/links.md`.

## When to use

- The project needs programmatic Claude Code-like agent behavior.
- The workflow includes file, command, or code editing automation.
- Hooks, permissions, sessions, or optional subagents need to be controlled in code.

## When not to use

- A normal Claude Code session and `CLAUDE.md` adapter are enough.
- The project does not need programmatic control.

## Minimal setup

```text
AGENTS.md
CLAUDE.md
docs/PROJECT_PROFILE.md
docs/HANDOFF.md
docs/SECURITY.md
src/claude_agent/
  options/
  hooks/
  tests/
```

## SDK boundary

- Use Claude Agent SDK for programmatic Claude Code-like behavior.
- Use normal Claude Code plus generated `CLAUDE.md` for ordinary local coding.
- Do not duplicate canonical project rules inside SDK options.
- Keep permissions explicit and reviewed.

## Minimal policy files

Suggested shape:

```text
claude-agent/
  options-policy.md
  permission-policy.md
  session-policy.md
  hooks-policy.md
  subagent-policy.md
```

- `options-policy.md`: allowed tools, model, working directory, environment, and output format.
- `permission-policy.md`: read/write/shell/network boundaries and confirmation rules.
- `session-policy.md`: persistence, retention, and what must not be stored.
- `hooks-policy.md`: explicit audit/control hooks and test expectations.
- `subagent-policy.md`: optional specialist roles and allowed tools.

## Checklist

- Set `allowed_tools`.
- Choose permission mode.
- Decide whether sessions persist.
- Add hooks only for explicit control or audit needs.
- Add subagents only for bounded specialist work.

## Common mistakes

- Making subagents default.
- Using hooks as hidden business logic.
- Duplicating canonical project rules in SDK options.
- Granting shell or file write access without a documented reason.

## Example

See `examples/claude-agent-sdk-app/` for a documentation-only project shape.
