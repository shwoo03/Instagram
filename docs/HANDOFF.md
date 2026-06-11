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

## 2026-06-07 Research-backed Accuracy Hardening

- Saved research and subagent synthesis in `docs/ACCURACY_RESEARCH_2026-06-07.md`.
- `docs/REFERENCES.md` now records official Chrome docs, DOM observation docs, and web UI flakiness papers used for the current accuracy policy.
- Runtime changed from broad recursive username promotion toward evidence-gated extraction: exact list endpoint paths and list-like payload containers are preferred; broad GraphQL/friendships matches remain candidate unless explicitly recognized.
- Confirmed network payload arrival now triggers DOM-only confirmed reconciliation so old DOM observations do not remain final compare truth.
- Background DevTools state now tracks freshness/disconnect/navigation cleanup to reduce stale `DevTools connected` claims.
- The page decision card now starts with a Korean trust gate. Use this before interpreting raw/candidate/provenance rows.
- `__igFollowerHelp()` is the operator command map. `__igFollowerExplainUser("username")` now prints saved/current profile and run freshness context.

Next smallest action: add a local fixture/checklist that proves the 287/287 pass shape, recursive payload false-positive rejection, and bounded fallback behavior without storing private payloads.

## 2026-06-10 Stability/Performance Implementation Pass

- Applied `docs/STABILITY_PERF_PLAN_2026-06-10.md` in order through the repo-local stability/performance pass.
- Implemented re-entry/superseded guards, `main()` try/catch/finally partial persistence, detached scrollBox exits, followers unknown-count fallback, DevTools freshness/disconnect relay, paste-mode-only XHR/fetch hook behavior, page-network parse prefilter, source count cache, DevTools heartbeat backoff, compact session-message payloads, scrollBox cache/two-pass scoring, clickable candidate prefiltering, and walker fixture scaffolding.
- Static validation passed: `node --check main.js`, `node --check background.js`, `node --check devtools.js`, `node --check page-network-bridge.js`, and `node tools/walker-fixtures.mjs`.
- Manual Chrome validation has not been run in this pass. Next operator check should follow `docs/STABILITY_PERF_PLAN_2026-06-10.md`: reload unpacked extension, reload Instagram, test DevTools-open and DevTools-closed collection, and inspect trust gate/final compare counts before raw DOM candidates.
- Known follow-up: broader Instagram run-shape fixtures are still open; `tools/walker-fixtures.mjs` only protects shared JSON username walker drift.

## 2026-06-10 Collection Resilience Implementation Pass

- Implemented `docs/COLLECTION_RESILIENCE_PLAN_2026-06-10.md` in the requested order: R4, R7, R2, R3, R10.
- R4: active runs now pin `state.runProfile`, detect SPA profile changes in scroll/reverify/stage boundaries, partial-persist with `aborted_profile_changed`, and keep storage/debug report profile labels on the starting profile.
- R7: DevTools capture now handles `chrome.devtools.network.onNavigated`, resets per-page counters, relays `navigated` status, and records `devtools_capture_navigated` in the run timeline.
- R2: DevTools/page-network/paste hooks observe HTTP 429 status codes only, never read error bodies, pause scroll collection with 60/120/240s backoff, and partial-exit as `rate_limited` after repeated signals.
- R3: scroll collection now uses MutationObserver row queues plus IntersectionObserver list-end hints; observer evidence stays DOM-tier (`dom-observer` / `dom-observer-candidate`) and disconnects via `finally`.
- R10: DOM fallback promotion and low-confidence overcount exclusion are ranked by evidence strength. `tools/compare-fixtures.mjs` covers comparator ordering, compare integrity, DOM observer tiering, and overcount exclusion behavior.
- Static validation passed after each item with `node --check main.js`, `node --check background.js`, `node --check devtools.js`, and `node tools/walker-fixtures.mjs`. After R10, `node tools/compare-fixtures.mjs` also passed.
- R10 mutation check: an in-memory comparator mutation (`bSeen - aSeen` -> `aSeen - bSeen`) failed the comparator assertion as expected; source files were not modified for this check.

Manual Chrome validation was not run from this environment because it requires the user's loaded unpacked extension, logged-in Instagram tab, and Chrome DevTools session. Remaining checklist:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab and open DevTools before opening followers/following lists.
3. Click the extension action and confirm DevTools bridge status logs.
4. Standard pass: confirm trust gate/final compare counts and visible `observerAdded` diagnostics.
5. Profile change: navigate to another profile during collection and confirm `profile_changed` partial persist under the starting profile key.
6. onNavigated: reload with DevTools open and confirm DevTools navigated log plus page-console Korean notice.
7. 429 synthetic signal: during a run, inject `window.postMessage({ source: "ig-page-network-bridge", schemaVersion: 1, type: "IG_PAGE_NETWORK_STATUS", reason: "rate-limited", capturedAt: new Date().toISOString() }, "*");` and confirm 60/120/240s pause behavior, then `rate_limited` partial exit on the fourth non-deduped signal.
8. DevTools-closed flow: confirm `DOM_PREVIEW` behavior remains unchanged.
9. Confirm `chrome://extensions` error panel has no new warn/error noise for expected degraded states.

## 2026-06-11 Platform Stability Implementation Pass

- Implemented `docs/PLATFORM_STABILITY_PLAN_2026-06-11.md` in order through R6, R5, M1, and R8.
- R6: `background.js` now budgets session snapshots, records `storage.truncatedSections`, retries quota errors once with a minimal derived snapshot, and stores `ig_follower_snapshot:lastRun` as `{ ref, profile, runId, collectedAt, approxBytes }` instead of duplicating the full snapshot. `main.js` prints Korean storage-size and truncation messages.
- R5: DevTools tab state is mirrored into `chrome.storage.session` under `ig_devtools_tabs_state:v1`; content preflight waits for hydration before reading the state. The existing 15s freshness TTL still gates stale entries.
- M1: deployment `manifest.json` now sets `minimum_chrome_version` to `114`; permissions were not changed.
- R8: added a local Puppeteer harness (`package.json`, `package-lock.json`, `tools/e2e/*`) that builds a copied test extension with localhost-only `host_permissions`, serves synthetic `e2e_user_###` fixture pages, and defines scenarios A-D plus storage ref scenario E.
- `npm install` initially failed while downloading Chromium (`ECONNRESET`). `PUPPETEER_SKIP_DOWNLOAD=1 npm install` succeeded using the local `/Applications/Google Chrome.app`.
- `npm run e2e` did not pass in this environment. Chrome loads the extension service worker, but `chrome.scripting.executeScript` against the local fixture tab fails/detaches with `Frame with ID 0 was removed`. I stopped further browser launches after user concern and left the harness plus failure notes for follow-up.
- Static validation passed: `node --check main.js`, `node --check background.js`, `node --check devtools.js`, `node --check tools/e2e/build-test-extension.mjs`, `node --check tools/e2e/fixture-server.mjs`, `node --check tools/e2e/run.mjs`, `node tools/walker-fixtures.mjs`, and `node tools/compare-fixtures.mjs`.
- Runtime 4 scripts had no R8 diff, and deployment `manifest.json` had no R8 diff. The only deployment manifest change in this pass is M1's `minimum_chrome_version`.

Remaining platform checks:

1. In Chrome extension SW inspector, verify `chrome.storage.session.get("ig_devtools_tabs_state:v1")` mirrors current DevTools tab state after DevTools heartbeats.
2. After a real run, verify `chrome.storage.session.get("ig_follower_snapshot:lastRun")` returns a `{ ref }` record and the referenced profile snapshot exists.
3. Re-run `npm run e2e` in an environment where Puppeteer extension script injection into `127.0.0.1` fixture pages succeeds; scenarios A-D should pass, E may pass or skip.
4. Manual Chrome standard flow remains required for real Instagram DOM/network behavior.

## 2026-06-11 List-end Accuracy Pass

- Implemented `docs/LIST_END_ACCURACY_PLAN_2026-06-11.md` in order through A1-A7.
- Analysis conclusion for the latest real profile run: the true comparable shape is 285 followers / 285 following. The displayed 287/287 header is now treated as likely including inactive/deleted accounts when DevTools/page-network evidence and DOM list-end evidence agree that the list is exhausted.
- The previous 287/287 pass-shape note is stale for this account's current state. The expected post-fix pass shape is DevTools 285/285, final diff 0/0, status `completed_at_list_end`, trust gate `확정 비교 가능`, with `haeunieii` and `won_donghwi` remaining candidate diagnostics only, not final diff members.
- Runtime behavior changed conservatively: bounded DOM fallback still exists for ordinary shortfall cases, but it is skipped when a small displayed-count gap is explained by confirmed list end. `dom-fallback`-only one-sided diff members are excluded from final diff to prevent false positives.
- Expected operator-visible improvement: reverify and DOM promotion logs should not appear in this list-end confirmed case, and scroll should stop after roughly 6 stable ticks once the visible end is confirmed, reducing runtime.
- Static validation passed after each A item with `node --check main.js`, `node --check background.js`, `node --check devtools.js`, `node tools/walker-fixtures.mjs`, and `node tools/compare-fixtures.mjs`.
- `tools/compare-fixtures.mjs` now covers the A1 list-completion cases and A3 fallback-only diff exclusions using synthetic data only.
- Added e2e code for a displayed-count gap variant: fixture displays 38/32 while actual lists remain 36/30; the runner injects synthetic DevTools usernames through the existing extension message bridge and expects `completed_at_list_end`.
- `npm run e2e` was not rerun in this pass. The local harness was already blocked by Chrome/Puppeteer extension injection (`Frame with ID 0 was removed`), and the user specifically questioned further browser launches for a Chrome extension task. Re-run it only after confirming the harness environment, not as an automatic browser launch.

Remaining list-end accuracy manual checklist:

1. Reload the unpacked extension from `chrome://extensions`.
2. Reload the Instagram profile tab and open Chrome DevTools.
3. Click the extension action to inject `main.js`.
4. Confirm DevTools bridge status reaches the page console without duplicate ready-sync noise.
5. Run the baseline profile and confirm followers/following both collect 285, final diff is 0/0, status is `completed_at_list_end`, and the decision card says `확정 비교 가능`.
6. Confirm the console explains the displayed-count gap as likely inactive/deleted accounts and no `누락 재검증` or DOM promotion log appears.
7. Confirm `haeunieii` and `won_donghwi` are absent from final diff and only visible through candidate/provenance diagnostics if present.
8. Run a DevTools-closed `DOM_PREVIEW` check and confirm the existing partial/fallback behavior is unchanged.
9. Confirm `chrome://extensions` has no new warn/error panel noise for expected degraded states.
