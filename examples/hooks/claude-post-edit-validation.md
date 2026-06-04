# Claude hook example: PostToolUse validation

Official links: see `templates/links.md`.

## Use case

After an edit/write operation, run a lightweight validation reminder or
project-local check.

## Hook record

- Harness: Claude Code
- Event: PostToolUse
- Matcher: Write|Edit
- Purpose: remind or run local validation after file changes
- Handler: command script
- Side effects: ideally none; avoid auto-fixing by default
- Secrets: none
- Files/network: project files only
- Failure behavior: report validation result, do not silently mutate
- Approval/trust:
- Owner:
- Review date:
- Removal path:

## Conceptual config

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/report-validation-needed.sh",
            "args": [],
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

## Notes

- Use absolute paths or approved project variables.
- Quote shell variables.
- Validate file paths.
- Skip `.env`, keys, `.git/`, and other sensitive paths.
- Prefer reporting over mutation.

