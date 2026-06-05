# Handoff

## Session metadata

- Date: 2026-06-01
- Branch: none; this directory is not currently a git repository
- Latest checked commit: not applicable
- Goal: apply the improved project-continuity system to the Instagram extension directory.
- Handoff stale? no

## Current state

- This is a local Chrome extension for comparing Instagram followers and following.
- `AGENTS.md` is already project-specific and should remain the canonical agent instruction source.
- `main.js` performs DOM collection, page XHR/fetch response ingestion, modal scrolling, provenance tracking, partial diff output, and Korean summaries.
- `devtools.js` captures Instagram Network responses from Chrome DevTools and extracts usernames from JSON-like payloads.
- `background.js` relays DevTools messages to the inspected Instagram tab through long-lived Port and message paths.
- `README.md` and `START_HERE.md` have been converted from stale starter-kit docs into extension-specific entrypoints.

## Active priority

P1: Verify DevTools bridge readiness in Chrome.

The bridge uses a DevTools long-lived Port, retries ready/status messages, and
replaces stale page listeners on each injection. The next step is still a manual
Chrome check after reloading the unpacked extension.

## Next action

- Run the manual Chrome validation flow and capture whether DevTools ready/status logs reach the page console.

## Next smallest action

- Reload the unpacked extension, open Instagram with DevTools already open, click the extension action, and check for bridge status logs.

## Blockers / unknowns

- Instagram modal DOM structure changes frequently.
- Virtualized lists can make the visible DOM smaller than the real list.
- DevTools Network capture only works while DevTools is open.
- Browser extension reloads are required after manifest/devtools changes.

## Evidence

- commit: not applicable
- changed files: `README.md`, `START_HERE.md`, `docs/HANDOFF.md`, `docs/PROJECT_PROFILE.md`, `docs/SECURITY.md`, `docs/BACKLOG.md`, `docs/REFERENCES.md`, `docs/LINKS.md`, `docs/PROFILE_CHECKLIST.md`, `dogfood/README.md`, `dogfood/backlog.md`, `dogfood/templates/adoption-report.md`
- validation run: `node --check main.js`; `node --check background.js`; `node --check devtools.js`
- validation result: pass

## Decisions made

- Treat this directory as the Instagram extension project, not as the AI Project Kit source.
- Keep copied starter-kit recipes/examples as reference material only.
- Keep dogfood reserved for kit-level feedback; use `docs/BACKLOG.md` for extension bugs.
- Do not add hooks, MCP servers, skills, subagents, eval runtime, or worktree automation by default.

## Promote to stable docs?

- AGENTS.md: no change needed unless validation rules change.
- PROJECT_PROFILE.md: extension-specific system boundaries updated.
- SECURITY.md: permission and DevTools capture boundaries updated.
- REFERENCES.md: use for official Chrome/Instagram/browser docs and adoption decisions.
- PROJECT_MEMORY.md: not needed yet.
- research/: not needed unless new browser/API research materially changes implementation.

## Notes

- This handoff is current session state, not a full log.
- Future agents should verify file state directly because this folder is not a git repository.

## 2026-06-02 Accuracy/Safety Update

- Default execution keeps follow actions disabled.
- Final diff policy is `verified_members_only`.
- Ambiguous network usernames are retained as candidates and excluded from final diff.
- Runtime diagnostics are stored in `window.__igFollowerDebugReport`.
- Next architecture step: split live collection snapshots, compare-only, and follow-action into separate commands/modes.

## 2026-06-06 Handoff: Accuracy Auto-assist Stabilization

- Implemented DevTools preflight in `main.js`: execution now asks background for DevTools state, waits a short grace window, then auto-enables page-network bridge if DevTools is not connected.
- `DOM_PREVIEW` is now the default no-network-evidence label. DOM-only output should not be treated as high-confidence final truth.
- Page-network bridge remains passive by default in `page-network-bridge.js`; it is enabled by manual helper or runtime auto-assist only.
- Final compare still uses confirmed compare sets and preserves raw DOM overcount through `excludedFromCompare`.
- Next manual browser validation: reload extension, reload Instagram, test DevTools-open and DevTools-closed flows, then inspect `__igFollowerExplainUser("haeunieii")` and `__igFollowerExplainUser("zerowonil")` if DOM overcount recurs.

## 2026-06-06 Regression Lessons: DOM, DevTools, and Error Panel Noise

- Do not hard-code `haeunieii`, `zerowonil`, or any other username. The fix is source classification, not account-specific filtering.
- Confirmed network evidence now owns the compare set. DOM-only accounts found after confirmed network evidence are `dom-candidate` unless a bounded fallback is needed to fill an expected-count shortfall.
- The previous regression came from blocking DOM promotion too aggressively and also resetting `followingUsers` after DevTools had already added the first page. Future changes must preserve already-arrived network evidence.
- Chrome extension error-panel noise can be caused by expected `console.warn` diagnostics from content scripts. Expected degraded states should use `console.log`; reserve warning/error paths for true failures.
- Passing run shape: status `completed`, DevTools payload `287/287`, raw confirmed `287/287`, final compare `287/287`, final diff `0/0`, and `haeunieii`/`zerowonil` only as `dom-candidate` diagnostics.
