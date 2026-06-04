# Hooks policy

## When to use hooks

Use hooks only for explicit audit, control, or validation.

## Rules

- Do not hide business logic in hooks.
- Keep hooks reviewed.
- Test hooks before relying on them.
- Document side effects.
- Keep failures visible.

## Review triggers

- New hook.
- Expanded permissions.
- Network or shell access.
- Changes that mutate files or external systems.

