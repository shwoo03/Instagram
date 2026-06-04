# Session continuity recipe

Official links: see `templates/links.md`.

## Purpose

Prevent agents from losing important project context across new sessions,
handoffs, compaction, and long-running tasks.

This kit does not implement runtime memory. It provides a lightweight
documentation pattern for preserving project knowledge.

## Core principle

Use the right layer for the right memory:

- `AGENTS.md`: stable agent behavior rules.
- `docs/PROJECT_PROFILE.md`: stable project purpose, scope, environment, risks.
- `docs/SECURITY.md`: stable security and permission boundaries.
- `docs/REFERENCES.md`: adoption decisions and source provenance.
- `docs/HANDOFF.md`: current session state and next action.
- Optional `docs/PROJECT_MEMORY.md`: stable learned facts that are useful across many sessions.
- Optional `research/`: detailed source analysis and synthesis.

Do not put everything in `AGENTS.md`.

## Memory promotion rule

Promote information only when it deserves a longer-lived home:

- One-session detail -> `docs/HANDOFF.md`
- Stable project fact -> `docs/PROJECT_PROFILE.md`
- Agent behavior rule -> `AGENTS.md`
- Security/tool/secret boundary -> `docs/SECURITY.md`
- Source/adoption decision -> `docs/REFERENCES.md`
- Deep paper/blog/repo analysis -> `research/`
- Repeated dogfood lesson -> recipe/template/example update

## New session startup checklist

At the start of a new session, read:

1. `AGENTS.md`
2. `docs/PROJECT_PROFILE.md`
3. `docs/SECURITY.md`
4. `docs/HANDOFF.md`
5. `docs/REFERENCES.md`
6. `docs/PROJECT_MEMORY.md` if present
7. relevant recipe/profile/example only if needed

Then check:

- current branch
- git status
- latest commit
- whether handoff date/commit is stale

## Before compaction or stopping work

Update `docs/HANDOFF.md` with:

- current state
- files changed
- decisions made
- next smallest action
- blockers
- validation evidence
- what should be promoted to stable docs

If something important was only said in chat, write it to a file before stopping.

## Stable project memory

Use optional `docs/PROJECT_MEMORY.md` when:

- the project spans many sessions
- the same setup/debugging fact is rediscovered
- decisions are too detailed for `AGENTS.md`
- recurring mistakes need a persistent note

Do not use it as a raw log.

## Runtime app memory

For apps that embed agents:

- Use official SDK/session memory when the product needs runtime memory.
- OpenAI Agents SDK: use sessions.
- OpenAI Responses API: use conversation state or `previous_response_id`.
- Claude Code: use `CLAUDE.md`, auto memory, sessions/checkpointing where appropriate.
- LangGraph/LlamaIndex: use their memory abstractions if the app already adopts those frameworks.

Record runtime memory design in project docs, not in this starter kit.

## Anti-patterns

- Making `AGENTS.md` huge.
- Treating handoff as a full log.
- Keeping important decisions only in conversation.
- Trusting stale handoff without checking git state.
- Mixing runtime memory with repository operating docs.
- Saving secrets or private data into memory/handoff files.
- Building a custom memory system before checking official SDKs/frameworks.
