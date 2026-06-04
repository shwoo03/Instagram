# Security notes

## Permissions

- Start read-only.
- Document broad shell, file, network, and write permissions.
- Confirm destructive operations.

## Sessions

- Do not persist secrets or private tokens.
- Document retention and cleanup behavior.

## Hooks and subagents

- Hooks should provide explicit audit/control.
- Subagents should be optional and permission-bounded.
- Do not hide business logic in hooks or subagents.

