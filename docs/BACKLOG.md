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

## 2026-06-07 Accuracy Research Backlog

- Done: record official-doc/paper research in `docs/ACCURACY_RESEARCH_2026-06-07.md` and `docs/REFERENCES.md`.
- Done: make DevTools URL mode detection conservative so broad GraphQL/friendships/followers/following matches are candidate unless exact list endpoint path is observed.
- Done: restrict DevTools/page-network username extraction to list-like containers instead of accepting every recursive `username` field.
- Done: demote DOM-only confirmed users to candidates when confirmed network evidence arrives later.
- Done: add a Korean trust gate to the decision card and expose `window.__igFollowerHelp()`.
- Done: add stale-run context to `window.__igFollowerExplainUser("username")`.
- Done: add background DevTools freshness/disconnect/tab cleanup and stricter Instagram hostname gating.
- Open: add local regression fixtures for exact-network pass, recursive-payload false positive, one-sided DevTools, connected-no-payload, and bounded fallback. `tools/compare-fixtures.mjs` now covers compare integrity, DOM-overcount exclusion, DOM observer tiering, and evidence ranking.
- Done: rank DOM fallback promotions and overcount exclusions by evidence strength instead of stable sort order (`R10`, `tools/compare-fixtures.mjs`).
- Open: persist compact `lastEvidence` or bounded `recentEvidence` tail in sanitized session snapshots.
- Done: compact every large stored snapshot section with explicit limits and `truncated` flags (`R6`, 2026-06-11).

## 2026-06-10 Stability/Performance Plan

- Done: S1 active run id/re-entry marker added; dialog/list waits plus collection/reverify/follow loops now exit on superseded runs.
- Done: S2 `main()` has try/catch/finally partial persistence so unexpected exceptions keep current counts/result context.
- Done: S3 detached scrollBox/modal-closed style exits added to scroll, reverify, and follow loops.
- Done: S4 followers fallback target changed from fixed 288 to unknown-target stall mode; `TARGET_COUNT` constant removed.
- Done: S5 DevTools content-side freshness model and disconnect relay added.
- Done: S6 paste-mode network hook kept for console paste mode, skipped in extension isolated-world injection mode, and aligned with list-container username extraction.
- Done: S7 collection/reverify/follow loops have absolute time-cap exits.
- Done: S8 removed unused `sendToInstagramTab` from `background.js`.
- Done: P2 source count cache added to avoid repeated provenance-map scans.
- Done: P3 page-network response prefilter added before JSON parse.
- Done: P4 DevTools heartbeat backoff added for repeated failures.
- Done: P5 session message payload compacts provenance before `chrome.runtime.sendMessage` while page memory keeps full provenance.
- Done: P6 clickable tab candidate scan now uses cheap href/text filtering before visibility checks.
- Done: P1 scrollBox cache and two-pass scoring added; manual Chrome confirmation still recommended for selected scroll box behavior.
- Done: P7 walker fixture added at `tools/walker-fixtures.mjs`; static validation passed.
- Done: static validation passed with `node --check main.js`, `node --check background.js`, `node --check devtools.js`, `node --check page-network-bridge.js`, and `node tools/walker-fixtures.mjs`.
- Open: run the manual Chrome scenarios from `docs/STABILITY_PERF_PLAN_2026-06-10.md`.

Notes on prior 2026-06-07 open items:

- `persist compact lastEvidence` / `compact every large stored snapshot section`: P5 moves the largest provenance payload compaction before session-message transfer, but full truncation flags remain open.
- `add local regression fixtures`: P7 adds walker drift fixtures only; broader Instagram run fixtures remain open.

## 2026-06-10 Collection Resilience

- Done: R4 aborts the active run on SPA profile changes, prints a Korean partial-result reason, and persists under the starting profile key.
- Done: R7 resets DevTools per-page counters on `chrome.devtools.network.onNavigated` and relays a Korean page-console notice.
- Done: R2 observes 429 status codes through DevTools/page-network/paste hooks, pauses scrolling with exponential backoff, and partial-exits after repeated signals without issuing retries.
- Done: R3 adds MutationObserver row capture and IntersectionObserver list-end diagnostics while keeping observer evidence in the DOM tier.
- Done: R10 ranks DOM fallback promotion/exclusion by evidence strength and adds `tools/compare-fixtures.mjs`.
- Open: run the manual Chrome checklist from `docs/COLLECTION_RESILIENCE_PLAN_2026-06-10.md` section 2.

## 2026-06-11 Platform Stability

- Done: R6 adds a `chrome.storage.session` snapshot budget, stepwise truncation flags, minimal quota fallback, and `{ ref }` lastRun storage.
- Done: R5 mirrors `devtoolsTabs` into `chrome.storage.session` and hydrates it before content preflight reads.
- Done: M1 adds `minimum_chrome_version: "114"` without changing deployment permissions.
- Partial: R8 adds the Puppeteer e2e harness, fixture server, test extension builder, `package.json`, and lockfile. `npm install` succeeded only with `PUPPETEER_SKIP_DOWNLOAD=1` using local Chrome; `npm run e2e` currently fails in this environment during extension script injection with `Frame with ID 0 was removed`.
- Open: rerun `npm run e2e` in a Chrome/Puppeteer environment where extension `chrome.scripting.executeScript` against the local fixture tab completes. Scenarios A-D should pass; E may pass or skip.

## 2026-06-11 List-end Accuracy

- Done: A1 adds `assessListCompletion` and `getListCompletionAssessment` so a small displayed-count gap can be treated as inactive/deleted-account count only when list end and network evidence are confirmed.
- Done: A2 gates reverify and bounded DOM fallback promotion on confirmed list end, preserving the fallback for ordinary `stalled` shortfalls.
- Done: A3 excludes `dom-fallback`-only one-sided diff members from final diff while leaving mutual members and DevTools-backed members intact.
- Done: A4 labels confirmed small-gap list-end runs as `COMPLETE_AT_LIST_END` and allows the trust gate to report `확정 비교 가능`.
- Done: A5 exits scroll collection after 6 stable ticks when the visible list end is confirmed and the count gap is within tolerance.
- Done: A6 removes duplicate content-bridge sync noise, avoids `약 0KB` storage logs, and clarifies unresolved-row diagnostics as possible button fragments.
- Done: A7 extends compare fixtures and adds an e2e code variant for displayed count 38/32 with actual list 36/30. Browser e2e execution remains blocked by the existing local Puppeteer extension-injection issue and was not rerun after user concern about browser launches.
- Open: run the manual Chrome checklist from `docs/LIST_END_ACCURACY_PLAN_2026-06-11.md` section 2 on the real Instagram profile. Expected shape: DevTools 285/285, final diff 0/0, status `completed_at_list_end`, trust gate `확정 비교 가능`.
