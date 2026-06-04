# Hook policy recipe

Official links: see `templates/links.md`.

## Purpose

Hooks are optional lifecycle extension points. They can run validation, add
context, block risky operations, or report status during an agent session.

Hooks are powerful because they run automatically. Treat them as
security-sensitive.

## When to use hooks

Use hooks only when at least one is true:

- A repeated policy check must run at a lifecycle point.
- A tool call needs a reviewed guardrail.
- A project needs lightweight validation after edits.
- A team needs auditable, explicit lifecycle checks.
- The hook is simpler than a full SDK/runtime integration.

## When not to use hooks

Do not use hooks when:

- A checklist in `AGENTS.md` is enough.
- A normal test command is enough.
- The hook would hide business logic.
- The hook would silently mutate files.
- The hook needs broad shell/filesystem/network access.
- The project cannot review and maintain the hook.
- The hook duplicates official SDK/harness behavior.

## Hook decision checklist

Before adding a hook, record:

- Harness:
  - Codex | Claude Code | other
- Event:
  - e.g. PreToolUse, PostToolUse, Stop, SessionStart
- Purpose:
- Trigger/matcher:
- Handler type:
  - command | http | prompt | mcp_tool | agent
- Allowed side effects:
- Disallowed side effects:
- Inputs consumed:
- Secrets used:
- Files touched:
- Network access:
- Timeout:
- Failure behavior:
- Approval/trust flow:
- Owner:
- Removal path:

## Safety rules

- Prefer read-only hooks.
- Prefer narrow matchers.
- Use absolute script paths.
- Quote shell variables.
- Validate and sanitize JSON input.
- Block path traversal.
- Skip `.env`, keys, `.git/`, tokens, and private files.
- Do not store secrets in hook config.
- Do not rely on hooks as the only security boundary.
- Do not use hooks to bypass human approval.
- Do not add async/background hooks unless the owner understands lifecycle and cleanup.

## Suggested hook categories

Safe-ish examples:

- Post-edit validation reminder.
- Read-only policy check.
- Secret pattern warning.
- Test result summarizer.
- Dependency change reminder.

High-risk examples:

- Auto-formatting with write access.
- Auto-commit or auto-push.
- Auto-deploy.
- Shell command rewriting.
- Broad MCP write validation.
- Background monitors.
- HTTP hooks sending project data externally.

## Minimal hook record

Use this template in project docs before enabling a hook:

```md
# Hook record: <name>

- Harness:
- Event:
- Matcher:
- Purpose:
- Handler:
- Side effects:
- Secrets:
- Files/network:
- Failure behavior:
- Approval/trust:
- Owner:
- Review date:
- Removal path:
```

## Common mistakes

- Hiding project policy only inside hooks.
- Adding hooks without documenting the event and matcher.
- Using hooks as a replacement for tests.
- Running destructive shell commands from hooks.
- Sending private prompt/code data to an unreviewed HTTP endpoint.
- Adding broad hooks to every project by default.
- Treating hook approval as permanent after script changes.

