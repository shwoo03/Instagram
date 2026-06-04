# Project Profile

## Purpose

This project is a local Chrome extension for comparing Instagram followers and following.
The current practical goal is to collect both lists reliably enough to answer:

- Who follows me but I do not follow?
- Who do I follow but does not follow me?
- Was either list incomplete, and how much should I trust the diff?

## Users

- Primary user: the local operator running the extension in Chrome while logged into Instagram.
- The extension is not designed as a public automation service.

## Core Files

- `manifest.json`: Manifest V3 extension definition.
- `background.js`: extension action handler and message relay.
- `main.js`: injected Instagram page collector and result printer.
- `devtools.html`: DevTools extension entrypoint.
- `devtools.js`: optional DevTools Network response username extractor.
- `docs/HANDOFF.md`: current state and next steps.
- `docs/SECURITY.md`: privacy and permission constraints.
- `docs/BACKLOG.md`: project-specific backlog.
- `docs/REFERENCES.md`: official docs and adoption decisions.
- `docs/LINKS.md`: project-specific link index.
- `docs/PROFILE_CHECKLIST.md`: applied starter-kit profile checklist.

## Collection Strategy

The collector should combine multiple signals instead of trusting one source:

- DevTools Network capture when DevTools is open.
- Page-level XHR/fetch hooks from `main.js`.
- DOM modal scrolling and profile-link extraction.
- Expected count parsing from visible Instagram labels.
- Diagnostics when collected count differs from expected count.

## Output Strategy

Console output should be Korean-first and readable:

- Print counts before account lists.
- Print account names for each diff bucket.
- Mark partial results clearly.
- Explain which side is incomplete and which diff fields may be wrong.
- Preserve results in `window.__igFollowerResult` for inspection.

## Non-Goals

- Do not build a cloud service.
- Do not collect passwords, cookies, tokens, request headers, or raw payload archives.
- Do not bypass Instagram access controls.
- Do not make dogfood logs about this extension's runtime bugs.

## Operating Model

- This project uses file-based continuity through `docs/HANDOFF.md`.
- Stable project facts belong here, not only in chat.
- Security and permissions belong in `docs/SECURITY.md`.
- Extension bugs and feature work belong in `docs/BACKLOG.md`.
- External references and adoption/rejection decisions belong in `docs/REFERENCES.md`.
- Kit-level lessons belong in `dogfood/`.

## Optional Surfaces

The project does not currently need:

- hooks
- MCP servers
- skills
- subagents
- eval runtime
- worktree automation
- project memory
- research archive

Add any of these only after a project-specific reason, owner, security boundary,
and rollback path are recorded.
