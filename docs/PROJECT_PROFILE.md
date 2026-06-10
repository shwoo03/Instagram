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

## 2026-06-06 Harness Stabilization Update

- Runtime policy is now accuracy-first auto-assist: DevTools Network capture is preferred, page-network bridge can auto-enable when DevTools is not connected, and DOM-only output is treated as `DOM_PREVIEW`.
- Repo-local `.agents/skills/instagram-accuracy-debugging` and `.agents/subagents` are intentionally adopted for repeated Instagram accuracy/debugging work.
- These agent surfaces are documentation and workflow aids only. They do not add runtime permissions, background automation, global Codex behavior, or secret storage.
- Final diff must be based on confirmed compare sets. Raw DOM overcount remains visible through diagnostics and `excludedFromCompare` instead of being reported as a high-confidence diff.

## Regression Policy: Evidence, Not Usernames

- Accuracy fixes must be rule-based. Do not add username-specific exceptions.
- Network-confirmed evidence is the preferred compare source; DOM is a fallback and diagnostic layer.
- DOM candidates can explain UI/network disagreement, but they are not final diff members unless bounded fallback promotion is needed to satisfy a count shortfall.
- Runtime diagnostics should make final results visually distinct from raw/provenance/candidate data.

## 2026-06-07 Accuracy Research Policy

- Accuracy work should start from evidence contracts, not selectors: exact network source, payload shape, expected counts, final compare counts, candidates, and stale-run context.
- DevTools capture can miss earlier requests if opened late, so `DevTools connected` is not the same as `followers/following payload confirmed`.
- MV3 background state can be stale or restarted. Bridge state must be timestamped, cleaned on disconnect/navigation, and treated as advisory until content delivery succeeds.
- MAIN-world page-network capture is the only page request interception path that should be treated as page traffic evidence. Isolated content-script hooks are diagnostics only.
- Dynamic DOM APIs help diagnose virtual scrolling but do not prove list completeness by themselves.
