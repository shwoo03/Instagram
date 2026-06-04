# Unsafe hook patterns

Avoid these patterns unless there is explicit review and a strong reason.

## Hidden mutation

- Auto-formatting every file without recording it.
- Rewriting tool inputs without documenting the rule.
- Editing files after Stop hooks.

## Dangerous shell

- `rm -rf`
- unchecked `xargs`
- unquoted variables
- shelling out with untrusted JSON input
- running scripts from relative paths controlled by the project

## Secret/data exposure

- Sending prompts, code, diffs, or tool input to unreviewed HTTP endpoints.
- Reading `.env`, keys, tokens, `.git/`, SSH config, cloud credentials.

## Overbroad matching

- Matcher `*` on every tool call without a clear reason.
- Broad MCP write hooks that do not inspect server/tool names.
- Background async hooks with no owner or cleanup.

## Policy smell

- "The hook will enforce everything."
- "No need to document this because it is automatic."
- "Run this with bypass/trust flags to make it work."

