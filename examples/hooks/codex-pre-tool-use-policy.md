# Codex hook example: PreToolUse policy

Official links: see `templates/links.md`.

## Use case

Block or warn on obviously destructive Bash commands.

## Hook record

- Harness: Codex
- Event: PreToolUse
- Matcher: Bash
- Purpose: deny destructive shell patterns
- Handler: command script
- Side effects: none
- Secrets: none
- Files/network: reads hook input only
- Failure behavior: fail closed for clearly destructive commands, otherwise no decision
- Approval/trust: requires Codex hook review/trust
- Owner:
- Review date:
- Removal path:

## Conceptual config

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/absolute/path/to/check-bash-command.sh",
            "timeout": 30,
            "statusMessage": "Checking shell command"
          }
        ]
      }
    ]
  }
}
```

## Notes

- Keep matcher narrow.
- Do not treat this as the only security boundary.
- Document bypass/removal path.
- Avoid sending command data to external services.

