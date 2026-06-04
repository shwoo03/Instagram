# Hook examples

Hooks are optional lifecycle extension points.

Use these examples only after reading `recipes/hook-policy.md`.

These examples are not copied into scaffolded projects by default.

## Use hooks for

- explicit guardrails
- lightweight validation
- audit/control points
- repeated lifecycle checks

## Do not use hooks for

- hidden business logic
- silent destructive automation
- broad shell/file/network access
- replacing tests
- replacing official SDK runtime behavior

## Files

- `codex-pre-tool-use-policy.md`: conceptual Codex PreToolUse guardrail.
- `claude-post-edit-validation.md`: conceptual Claude PostToolUse validation hook.
- `unsafe-hook-patterns.md`: examples of what not to do.

