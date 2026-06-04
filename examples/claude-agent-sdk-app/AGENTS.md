# AGENTS.md example: Claude Agent SDK app

## Project goal

Build a programmatic Claude Code-like workflow with explicit permissions,
session rules, hooks, and optional subagents.

## Success criteria

- SDK options are documented.
- Tool permissions are reviewed and minimal.
- Session persistence rules are explicit.
- Hooks and subagents have documented purpose and tests when used.

## Working rules

- Use normal Claude Code plus `CLAUDE.md` for ordinary local coding.
- Use Claude Agent SDK only for programmatic control.
- Do not duplicate canonical project rules inside SDK options.
- Ask before enabling broad shell, filesystem, network, or write access.

## Reuse-first policy

Use official SDK/harness behavior when it fits. Run
`recipes/open-source-reuse.md` before building custom runtime, permission,
session, or hook infrastructure.

## Validation

- Primary validation command: `<SDK workflow test command>`
- Secondary checks: `<lint/type/security command>`

## Handoff

Update project handoff with options changed, permissions changed, session
behavior changed, hook/subagent changes, validation evidence, and next action.

## References

- Project decisions live in `docs/REFERENCES.md`.
- Official links live in the source kit's `templates/links.md`.

## Security notes

- Start read-only.
- Confirm destructive operations.
- Do not persist secrets, tokens, or private scratch data in sessions.

