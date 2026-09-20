# Handoff

## Account lookup and result explanations — 2026-09-21

The owner's next “ㄱㄱ” selected unified account lookup, completion evidence
cards and popup diagnostic copy. All three are implemented in popup/panel.
Lookup uses the collector's full in-memory sets, not the saved 1,000-name
subsets. It requires matching tab/run/profile and only classifies relationships
after a finished, non-cancelled, canonically confirmed comparison. Partial or
assisted data shows `확인 부족`; missing collector memory asks for a new run.
This queries an existing snapshot, not Instagram's current server state.

The cards expose each list's existing `accuracy-engine.js` completion state,
exact DevTools/Debugger payload counts, pending/failed counts and fixed Korean
reasons. Readiness alone never becomes exact evidence. Older records explicitly
lack detailed evidence. Copy in both views includes only selected counts,
completion/diagnostic fields and a fixed verdict code; arbitrary warnings and
event text, usernames, profile/run IDs and URLs are excluded. No search history,
network request, full-list transfer, permission or dependency is added.

- `npm test`: passed, including actual collector lookup/relay functions with synthetic data beyond the 1,000-name cap, run/profile binding, cancellation/running/reference-only gates, unavailable memory, canonical completion forwarding and privacy filtering.
- `npm run e2e`: passed all six existing local collection scenarios with exit code 0.
- `npm run e2e:capture`: passed with exit code 0. Actual Chrome popup -> automatic capture -> stored completion -> full-memory lookup covers mutual, each one-sided category and not-observed; old-run queries fail and cancelled-run queries remain insufficient. Existing stop/late response/worker restart/detach/navigation checks also pass. This is localhost data, not live Instagram.
- `npm run ui:e2e`: passed at popup 320/360/420px and panel 320/736/1024px. Covers missing old-record evidence, fixed reason cards, popup/panel copy, unavailable lookup, partial lookup, input/profile changes during a delayed response, existing account search, cooldown and stop. Final expanded-card screenshots at 320px popup and 736px panel were visually inspected; no horizontal overflow.
- `git diff --check`: passed. Canonical accuracy rules, manifest and dependency lockfile unchanged; existing dirty kit work and preceding diagnostics implementation preserved. No live account activity, commit, push or release.
- Independent review: **blocked/unreviewed**. Shared messages/stored summaries trigger `docs/CHANGE_REVIEW.md`; current tools cannot enforce its read-only/allowlisted reviewer boundary. No reviewer was started and these author checks are not independent review. Next: human review of the fixed cumulative snapshot below, or a supported restricted environment with successful harmless probes. No review findings/corrections exist for this snapshot.
- To use: reload the unpacked extension and Instagram tab, run a new comparison, then use `통합 계정 조회` / expand `판정 근거`. Reopen DevTools if using its capture. Actual Instagram normal completion/manual stop remain unverified.
- Still deferred: storage management UI, side panel, partial recollection, downloads/import, persistent history, broad extraction, CI and physical toolbar permission coverage.

### Fixed cumulative runtime/test review snapshot

Base: `main`, `c022f649f6a9a05a3b001d61fb5cf5d7b5d6d0e0`.
This cumulative scope includes the preceding progress-diagnostics bundle, whose
runtime files were clean/absent at its start. Its previous hashes below are now
historical where files overlap. Include all 21 files and new-file contents when
reviewing against the base; do not include unrelated dirty kit docs/instructions.

```text
d267aa91ba8072363889747076ba13bcda0957583b5e5f03b109c5453da35f89  background.js
fba161ed5d4bcc89b5d6557b291b08c3fe9fcb5afa65444ebc0542e76fd43240  debugger-capture.js
a5bbcb2d675ff63c9002a2e3ec4ab981abdb81a071e0b3e35fd0a60ab384471a  devtools-panel.html
12105932c260ee1b80c83bc3f72120ca7407ff64e2a7f3fc5f431405c6ec5918  devtools-panel.js
2ec0e05d4c0d223597ae78d53c79784f174b46cb098709944492ff63c2b8c95f  devtools.js
74b5a8b88f1060b4be4892a42138c669a4e450018154f7c01399ae9f407f8d75  main.js
f0e6f0426a58f71b5ae1cc1d646c0891ff4d4dba192abfb56c7b75071f080ec2  package.json
c5f02f87c0dd5e28f3bb4a14448abb80c6936d3f5a7c748af9c23f3d1b8b5176  popup.css
dc6d45f95e1250a8426a92a0b3f277112c6570a5603709b5994d29b44bb9c96a  popup.html
e4a4c065fcd19b06c74ebb7f305cdd1a81a2d3e7475fae26c17ed1a9e7737afc  popup.js
becf6a9ce64a3e8d9e7b87943f5bc417c8f5024ceb560dccd551c049cdeb0087  run-diagnostics.js
47f7da9e8a24cb87347afd1816dedb3045fec7693b09cededa8f4ba768752a16  result-insights.js
0ab39eb29ff87b5ee56dbb281a3def3c69ba60221afe6e8a746c5b3bfd30e564  result-insights-ui.js
d7955b6f5c0f99cabf0dbd528f5e9b035620f13921ab42c5dfadfef8a6d8b96b  result-insights.css
beebb7f712f1707656fc0e4b63954e0cfbb510ca3b86538477e250da45c67b39  tools/account-list-render-fixtures.mjs
839093931c924d9c043a7788287cc58674e3605bd2458f98f694a292ee4fe9a3  tools/debugger-capture-fixtures.mjs
056bb5489f11a573749da518fb23e76e4a099e900e544a9976a3bad2e0694064  tools/devtools-capture-fixtures.mjs
3aa02d210fa3154f1250badc43310e267497682580d82eb7b09bc29e55843cb0  tools/e2e/build-test-extension.mjs
ce44dee75efbf4f24dc4af8d528daf532a8504d3b88aaf1339de418de0de3fb7  tools/e2e/real-capture.mjs
dbf2bb25c3036cccc1d335671724debc80a5267050cd1675a2fcd792905a1236  tools/run-diagnostics-fixtures.mjs
685a97f8ae92f36d57505e4cc485698f0d61a41a04928e6c97fd0097d0a11f96  tools/result-insights-fixtures.mjs
```

Supporting changes are this entry, the matching new sections in `BACKLOG.md`
and `REFERENCES.md`, and the two lookup/completion paragraphs at the top of
`SECURITY.md` Storage Policy. For this follow-up alone, roll back only its
lookup/completion/copy hunks, four new insight module/style/test files and these
doc additions after checking drift; retain preceding progress diagnostics and
all pre-existing kit changes. Never reset the whole dirty worktree.

## Progress and diagnostics implementation — 2026-09-21

Research items 1–3 are implemented after the owner's “좋은뎅 ㄱㄱ”. Unknown
expected counts stay `null` through collection/relay/storage; real zero remains
zero. Popup progress no longer reports an invented 18%, and its accessible
description reads “전체 100명 중 23명 수집”. Popup/panel show the existing 429
pause deadline and keep stop available. Reopening does not restart the pause;
cancelled/finished and previous-profile views do not promise resumption.

`run-diagnostics.js` bounds/sanitizes two list modes, eight fixed failure
categories, counts and a pause timestamp. Debugger and DevTools reasons reach
stored progress, Korean warnings and panel diagnostic copy; unknown fields
and arbitrary text are discarded. Body-read and delivery failures are separate.
The additions do not change exact/assisted membership or completion rules.
Older progress without diagnostics still renders; prior stored zero counts
cannot be reclassified as unknown retrospectively and need a fresh run.

- `npm test`: passed, including new collector -> relay -> stored-progress checks, reason bounds/privacy, 429 immediate publication/deduplication, late signal rejection after cancellation and body/delivery failure distinction.
- `npm run ui:e2e`: passed at popup 320/360/420px and panel 320/736/1024px. Checks cover unknown/zero/known totals, 60 -> 50 second countdown, rereading a saved deadline, cancellation, profile mismatch, diagnostic copy and existing search/expansion behavior. Synthetic 320px popup and 736px panel screenshots were visually inspected; no horizontal overflow.
- `npm run e2e` and `npm run e2e:capture`: both passed with exit code 0 on reruns; all six collection scenarios and capture/cancel/restart/navigation assertions passed. The initial concurrent browser commands reported all assertions passed but lingered after browser shutdown and were stopped with SIGTERM (143). A diagnostic capture rerun returned from the module with a remaining socket/timer and later also exited 0. No runner/dependency change was made and the cause of the initial delay is not established; retain this first-attempt limit rather than count those interrupted commands as clean passes.
- `git diff --check`: passed. No live Instagram/account work, dependency installation, permission change, commit or release. Existing uncommitted kit documentation/instructions were preserved.
- Independent review: **blocked/unreviewed** under `docs/CHANGE_REVIEW.md`, because shared messages and stored progress formats changed. Current tools do not provide the required enforced read-only/allowlisted reviewer boundary; the documented earlier CLI boundary trial also failed. No fresh reviewer was started, and author checks are not a substitute. Owner next step: human review of the fixed scope below, or a supported restricted environment with successful harmless probes. No review-driven corrections have been proposed/applied.
- Still deferred: research item 4 (real toolbar-action permission coverage / Puppeteer upgrade), partial recollection, downloads/import, side panel, permanent history, broad module extraction and CI.
- To use the local change, reload the unpacked extension and Instagram tab, and close/reopen DevTools if using its capture. Live normal-completion and manual-stop checks remain pending.

### Fixed implementation scope for review

Base: `main`, `c022f649f6a9a05a3b001d61fb5cf5d7b5d6d0e0`. These files were
clean or absent at task start; review their diff against that base, including
the two new files. SHA-256 identifies their post-implementation contents:

```text
2a9f40aa5c3e3ffaf3f9cee25ccea2f1e6959794724072eb067a6a249651291b  background.js
fba161ed5d4bcc89b5d6557b291b08c3fe9fcb5afa65444ebc0542e76fd43240  debugger-capture.js
97313051b916f436d7729354255c2ce387da79c1dd5a3b040a1a871382288a0a  devtools-panel.html
2897cd7bfbedc5a6d183af4b800543deeed5640d5fff1562633bb17ee0d19e28  devtools-panel.js
2ec0e05d4c0d223597ae78d53c79784f174b46cb098709944492ff63c2b8c95f  devtools.js
95325db78116a6c1386ccb63dfee919d8114879d445ab73ac6a9c7f4be333760  main.js
16c2a3c33aaeb53f8e2955d9bfb2ffa57040424c5bcb39d75ea37f75064252ca  package.json
c5f02f87c0dd5e28f3bb4a14448abb80c6936d3f5a7c748af9c23f3d1b8b5176  popup.css
1c2ecb5ead52e02e3237db033c69a3fd38988e7308ade84942e2a8ebd75b6147  popup.html
fd96d6a43b4053bce2061e6113ae7fe57ab130340839591583f00c9769241b97  popup.js
becf6a9ce64a3e8d9e7b87943f5bc417c8f5024ceb560dccd551c049cdeb0087  run-diagnostics.js
565754b51a2ca7d08550c28058b9493b511d438a22b50d3fbb366fe9e04b4e18  tools/account-list-render-fixtures.mjs
839093931c924d9c043a7788287cc58674e3605bd2458f98f694a292ee4fe9a3  tools/debugger-capture-fixtures.mjs
056bb5489f11a573749da518fb23e76e4a099e900e544a9976a3bad2e0694064  tools/devtools-capture-fixtures.mjs
d5f6a7ad90143e74fff4c7a7571d07df1cf146e863931a1e488234302a34d7a4  tools/e2e/build-test-extension.mjs
8c6f8e47258d91aea91a5a7eef0306764cfba18870d44c491105165fd5eeec73  tools/run-diagnostics-fixtures.mjs
```

Supporting documentation is limited to this entry, the 2026-09-21 sections in
`docs/BACKLOG.md` and `docs/REFERENCES.md`, and the progress-diagnostics paragraph
under `docs/SECURITY.md` Storage Policy. Review those additions only; other dirty
documentation predates this task. Roll back only the selected implementation
diff and these additions after checking for drift, never the whole worktree.

## Current handoff — 2026-09-18, v1.8.0

The popup and DevTools panel now let the user stop collection and retain a clearly marked partial result. Saved account lists support username search and distinguish the full result count from the stored subset. Session storage removes older profile results when capacity is needed.

- Cancellation is bound to the displayed run ID. It interrupts collection/backoff waits, rejects late usernames, preserves collected data, labels the verdict `PARTIAL`, and detaches automatic capture. It never treats an interrupted comparison as complete.
- Search stays within each saved list (up to 1,000 usernames); it accepts an optional `@` and ignores case. Full totals survive repeated sanitization. Older truncated records without totals display `전체 수량 미상`. A missing search match is explicitly not proof of absence from the complete result.
- `session-retention.js` serializes progress/snapshot writes. Snapshot saves target 8MB of total session use and 10 profile snapshots, pruning oldest results while protecting active profiles and the new/latest result. Progress avoids a full storage scan unless a quota error occurs. Existing minimal-snapshot fallback remains available; active results can prevent reaching the soft target.
- Validation passed: `npm test`; all six `npm run e2e` scenarios; the expanded synthetic-429 scenario separately verified interruption in under five seconds; `npm run e2e:capture` verified actual popup cancellation, partial storage, detach, rejection of stale stop requests and late responses, restart and navigation cleanup; `npm run ui:e2e` verified search, missing matches, 1,005/1,000 totals, popup/panel stop controls, and no horizontal overflow at 320–1,024px. Search and running-state screenshots were visually inspected. `git diff --check` passed.
- These are local fixture/Chrome checks, not fresh proof against live Instagram. Reload the unpacked extension, reload the Instagram profile tab, and reopen DevTools before using v1.8.0. Confirm one normal comparison and one manual stop.
- Existing user changes in AGENTS.md, CLAUDE.md, docs/REFERENCES.md, docs/SECURITY.md, skill files and kit-refresh notes were preserved and excluded from the v1.8.0 commit.

The sections below are historical session notes; this entry supersedes their current-state claims.

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
- Follow-up real Chrome run verified the A pass successfully: 285 followers / 285 following, final diff 0/0, status `completed_at_list_end`, and trust gate `확정 비교 가능`.
- Analysis conclusion for the latest real profile run: the true comparable shape is 285 followers / 285 following. The displayed 287/287 header is now treated as likely including accounts counted by the counter but not returned by the list API when DevTools/page-network evidence and DOM list-end evidence agree that the list is exhausted.
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

## 2026-06-11 Post-run Polish Pass

- Implemented `docs/POST_RUN_POLISH_PLAN_2026-06-11.md` in order through B1-B3.
- B1: DevTools and page-network USERNAMES payloads arriving after `window.__igFollowerRunInProgress` becomes false are now ignored before set mutation. READY/STATUS/DISCONNECTED and rate-limit status handling were left unchanged.
- B2: `getListCompletionAssessment` now includes a bounded `domTierCandidates` list without changing the pure `assessListCompletion` contract. When the confirmed list-end gap equals the DOM-tier candidate count, the console prints a correlation line and records `gap_matches_dom_candidates`.
- B2 also updates the old inactive/deleted wording to: counter includes accounts that the list API did not return, such as recent unfollow cache, restricted, or inactive accounts.
- B3: dynamic Korean subject particles now use `withSubjectParticle`, fixing `팔로잉가` to `팔로잉이` while keeping `팔로워가`.
- Static validation passed after each B item with `node --check main.js`, `node --check background.js`, `node --check devtools.js`, `node tools/walker-fixtures.mjs`, and `node tools/compare-fixtures.mjs`.
- Manual Chrome validation was not rerun in this pass. Remaining B-specific checks: after a completed run, manually scroll the followers/following modal and confirm one ignore notice, unchanged `window.__igFollowerResult` lengths, no `[DevTools] ... +N` set-change log, and `window.__igFollowerPrintDevToolsStatus()` showing `postRunIgnoredPayloadCount > 0`.

## 2026-08-25 Accuracy Engine and Hybrid UI

- Manifest version is now `1.2.0` with a responsive action popup and an `IG Comparator` DevTools panel.
- Added `accuracy-engine.js` as the canonical pure engine for displayed-count parsing, conservative pagination evidence, list completion, trust verdicts, strict/assisted comparison, and integrity checks.
- Final diff fields now remain strict-network-only. DOM/page-network results are exposed separately as `assistedPreview` and labeled `참고용 결과`; candidates never inflate strict mutual counts.
- DevTools exact evidence now requires a successful 2xx response and a sanitized exact endpoint label. Small displayed-count gaps require both a recognized terminal pagination signal and DOM list-end evidence.
- Page-network messages are bound to the active run/profile capability and remain assisted evidence, not DevTools-equivalent strict evidence.
- Popup/panel progress is stored per tab in `chrome.storage.session` and contains only counts, source flags, bounded timeline events, warnings, and the canonical verdict.
- Always-visible UI notice states that derived usernames/counts/diagnostics stay in the browser session and that cookies, auth headers, raw responses, and DMs are not stored.
- Validation passed: `npm test`, `git diff --check`, and all six `npm run e2e` scenarios (standard DOM reference, double injection, forced modal close, 429, terminal displayed-count gap, session ref).
- Responsive UI QA passed at popup 320px and panel 320/736/1024px with long Korean text and seven-digit counts; no horizontal overflow was observed.
- Pre-change real Chrome baseline was confirmed at DevTools exact 283/283, strict mutual 283, diff 0/0. Post-change real Instagram validation remains pending because the connected Chrome controller cannot operate the `chrome://extensions` internal reload button.

Next operator action: open `chrome://extensions`, reload the unpacked extension once, reload the Instagram profile tab, reopen DevTools, then start from the popup and confirm the final popup/panel verdict.

## 2026-08-25 Local Automatic Debugger Capture

- Manifest is now v1.3.0, requires Chrome 118+, and intentionally includes `debugger` for this local-only installation.
- A popup-started run uses an already-fresh DevTools bridge first; otherwise it attaches a bounded CDP Network session before collector injection.
- Exact followers/following responses become strict `Debugger` evidence. Broad response candidates remain excluded from final diff.
- The controller never steals a busy target, never creates Instagram requests, never auto-reattaches, and detaches on completion/failure/navigation/tab close/cancellation.
- Raw response bodies are parsed transiently and discarded. Messages/storage contain only derived usernames, fixed endpoint labels, counts, timestamps, pagination, source mode, and diagnostics.
- Validation passed: `npm test`, `npm run e2e` (all six scenarios), and `git diff --check` before final commit preparation.
- Mock fixtures and Puppeteer fallback do not prove real Chrome debugger capture. Remaining manual validation: reload the unpacked extension, run with DevTools closed, verify the Chrome debugging banner and exact counts, then test DevTools-already-open skip, mid-run handoff, stop/detach, navigation cleanup, and session-storage privacy.

## 2026-08-25 Account Name Lists UI

- Manifest is now v1.4.0.
- Popup and DevTools panel show a dedicated `계정 상세` section with collapsed `나만 팔로우`, `나를 팔로우`, and `검토 후보` disclosures.
- Candidate accounts remain divided into `팔로워 후보` and `팔로잉 후보`; they never enter confirmed relationship lists.
- Each disclosure reveals 20 usernames at a time. Validated usernames link to the fixed Instagram profile origin in a new tab.
- Per-tab progress stores only four derived username lists, each normalized/deduplicated/sorted and capped at 1,000 by a background sanitizer.
- Validation passed: `npm test`, all six `npm run e2e` scenarios, focused strict/assisted progress assertions, `npm run ui:e2e`, and popup 320/360/420 plus panel 320/736/1024 overflow checks.
- Responsive screenshots were visually inspected in both default-collapsed and opened-list states. Real Instagram username parity remains a manual Chrome check after extension reload.

## 2026-08-25 Per-account Evidence UI

- Manifest is now v1.5.0.
- `main.js` converts each displayed account's strongest runtime provenance into a bounded source code: Debugger, DevTools, page network, DOM fallback, DOM, mixed, or unknown.
- `account-list-contract.js` forces the evidence level from the containing result set, filters evidence to displayed sanitized usernames, and replaces unrecognized sources with `unknown`. A candidate cannot become confirmed through supplied evidence metadata.
- `account-list-ui.js` renders the shared popup/panel `확정`, `참고`, and `후보` buttons. The username link still opens the fixed Instagram profile origin; the separate button expands a Korean explanation with accessible `aria-expanded`/`aria-controls` state.
- Evidence explanations are generated from fixed UI templates. No raw response, URL, header, cookie, DM, or free-form evidence description was added to storage.
- Validation passed: `npm test`; all six `npm run e2e` scenarios including DOM-reference and DevTools-strict evidence assertions; `npm run ui:e2e` at popup 320/360/420 and panel 320/736/1024; visual inspection of the 320px expanded reason; and `git diff --check`.
- Partial-side recollection/recovery was explicitly removed from this change at the user's request.
- Remaining manual check: reload the unpacked extension, reload the Instagram profile, run one comparison, then open popup and DevTools account lists and confirm the badge source/reason matches the observed collection mode.

## 2026-08-25 Run Context and Stale-profile Guard

- Manifest is now v1.6.0.
- Added the pure `run-context.js` contract for profile normalization, Instagram profile URL parsing, profile mismatch checks, and Korean relative-time labels.
- Popup and DevTools panel now retain the sanitized `profile` already present in the session progress record and display `@profile` plus the last-update age.
- If a stored run belongs to another profile, the UI shows `이전 결과`, names both saved/current profiles in the warning, and suppresses old counts, account lists, diagnostics, warnings, timeline, and diagnostic copying.
- The popup still allows `현재 프로필 비교 시작`; the DevTools panel rechecks `location.href` on panel load and `chrome.devtools.network.onNavigated`.
- Reserved Instagram paths such as `/explore/`, `/accounts/`, `/direct/`, `/reels/`, and `/p/` are not treated as profiles.
- Fixed the UI number sanitizer so absent values render as `—` while a real zero still renders as `0`.
- Validation passed: `npm test`, all six `npm run e2e` scenarios, `npm run ui:e2e` at popup 320/360/420 and panel 320/736/1024, normal/stale screenshots, and `git diff --check`.
- Remaining manual check: after extension reload, complete a comparison on profile A, navigate the same tab to profile B, and confirm popup/panel suppress profile A results until profile B is run.

## 2026-09-05 Capture completion and live result context — v1.7.0

The extension now checks unfinished response processing before declaring collection complete, and explains why individual candidate accounts were excluded. Popup and DevTools result context refresh when the profile or elapsed time changes.

### Runtime changes

- `debugger-capture.js` counts pending network responses, body reads and unacknowledged username delivery. Parsing, loading, expiry and delivery failures are recorded per exact list. A bounded settle step precedes final comparison; stopping capture rejects late body reads.
- `accuracy-engine.js` keeps earlier-request pagination from overwriting newer evidence. Equal request timestamps with conflicting signals invalidate terminal proof. Pending/failed capture blocks completion even when displayed and collected counts match.
- `devtools.js` carries request start order, counts unfinished body callbacks/relays, emits fixed failure reasons and discards callbacks from earlier navigations.
- The new real capture test revealed that a list modal's same-document history changes could emit `loading` and trigger the previous unconditional debugger detach. `background.js` now checks the collector's run/profile context and rechecks on completion; a new document is cleaned up, while same-profile modal navigation retains capture. Existing old-profile results remain available for the mismatch warning.
- Candidate evidence adds only allowlisted reason codes. `비교 계산 일치` describes arithmetic consistency; completion remains the separate top verdict. Account storage limits and collection evidence tiers remain unchanged.
- Visible DevTools panels recheck profile context on tab/navigation events and at 1.5-second intervals; popup ages update every 15 seconds. Time-only updates do not rebuild account disclosures. Non-profile panel targets hide old counts, lists and copying.

### Validation and limits

- `npm test`: syntax and fixture coverage, including reversed response processing, duplicate events, failed reads, late post-stop responses, same-document navigation and candidate explanations.
- `npm run ui:e2e`: popup 320/360/420 and panel 320/736/1024; candidate explanations, no horizontal overflow, A -> B -> A state transitions, non-profile suppression and advancing age without losing expanded rows. Popup and panel screenshots inspected visually.
- Existing `npm run e2e`: six synthetic flow scenarios remain a separate check.
- `npm run e2e:capture`: production popup button handler -> actual Chrome debugger response reads -> parser -> comparison -> session storage -> detach, using a local generated list of 36 followers / 30 following / 24 mutual. Worker termination/restart, explicit detach and navigation/tab-close cleanup are separate assertions.
- The capture gate copies the extension into a temporary directory and adapts only URL acceptance to the loopback fixture. It uses programmatic activation of the actual popup button because headless popup coordinate clicks were unreliable. It does not validate physical toolbar permission grants, real Instagram DOM/API shapes, or the user's installed extension.
- Existing uncommitted AGENTS.md, CLAUDE.md, security/reference refresh and skill files belong to the user. They were preserved and excluded from the v1.7.0 commit; only the task-specific addition to REFERENCES.md is included.
- The user subsequently reported that the extension works correctly. Individual live Instagram scenarios have not been independently observed by the agent.

Optional follow-up checks: run once with DevTools closed, then with DevTools open; check candidate reasons and open-panel A -> B -> A navigation. Partial recollection and downloads remain deferred.
