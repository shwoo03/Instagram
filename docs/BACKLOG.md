# Backlog

## P1

| ID | Area | Task | Status |
| --- | --- | --- | --- |
| IG-001 | DevTools bridge | Add Port-based ready/status relay and stale listener replacement so DevTools capture connection is visible and resilient. | done |
| IG-002 | Results | Keep partial diff output even when following collection is incomplete, with clear Korean warnings. | done |

## P2

| ID | Area | Task | Status |
| --- | --- | --- | --- |
| IG-003 | Docs | Replace stale starter-kit README with extension-specific usage instructions. | done |
| IG-004 | Diagnostics | Add a concise `window.__igFollowerDebug()` helper that prints bridge, counts, and last diagnostics. | open |
| IG-005 | DOM collection | Continue improving virtual-scroll end detection and unresolved-row reporting. | open |
| IG-006 | Accuracy | Add username provenance so each account records whether it came from DOM, page network hooks, DevTools, or import. | done |
| IG-007 | Accuracy | Use the visible followers count instead of fixed `TARGET_COUNT`, and keep ambiguous network usernames as verification candidates instead of final diff members. | done |
| IG-008 | Safety | Disable follow actions in the default collect/compare flow and make final diff use verified members only with a structured debug report. | done |
| IG-009 | DOM collection | Add bounded low-coverage scroll recovery with scrollBox re-selection, concise recovery logs, and debug report records. | done |
| IG-007 | Docs | Keep project docs aligned with the extension instead of copied starter-kit defaults. | done |
| IG-008 | Validation | Run manual Chrome validation for DevTools ready/status logs after reloading the extension. | open |

## Rules

- Project-specific runtime bugs live here.
- Kit/starter-kit improvements live in `dogfood/`.
- Do not put secrets, raw payloads, cookies, or account-sensitive dumps in backlog entries.

## 2026-06-06 Harness Stabilization Backlog

- Done: add runtime DevTools preflight and page-network auto-assist before list collection.
- Done: label no-network-evidence runs as `DOM_PREVIEW` instead of presenting DOM-only output as high-confidence.
- Done: keep raw DOM overcount visible through `excludedFromCompare` while final diff uses confirmed compare sets.
- Done: document repo-local `.agents` skill/subagent usage for repeated accuracy debugging.
- Open: manually validate DevTools-open, DevTools-closed, DevTools-connected-no-payload, DOM-overcount, and passive-noise scenarios in Chrome.

## 2026-06-06 Regression Prevention Items

- Done: prevent account-specific filtering by documenting that username hard-coding is forbidden.
- Done: preserve network-confirmed sets by removing late reset behavior during following collection.
- Done: downgrade expected preflight/page-network diagnostics from `console.warn` to `console.log` to reduce Chrome extension error-panel noise.
- Done: add bounded DOM-candidate fallback for short network-confirmed collections instead of unconditional DOM promotion or unconditional DOM blocking.
- Open: add a small local regression fixture or checklist for the pass shape: DevTools `287/287`, confirmed raw `287/287`, final diff `0/0`, DOM candidates excluded from final compare.
