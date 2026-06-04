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
