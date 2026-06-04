# Claude subagent examples

Subagents are optional. Use them only when they provide a real boundary:

- permission separation
- context separation
- repeated specialist role
- independent review

Do not use subagents for:

- one-file edits
- simple tasks
- vague "think harder" requests
- work where coordination cost exceeds benefit

Claude subagents are Markdown files with YAML frontmatter. They can exist at
project, user, plugin, or CLI scopes depending on the host. Official links live
in `templates/links.md`; this directory only provides copyable examples.

Do not add `.claude/agents/` to generated projects by default.

