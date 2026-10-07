# References

## Crawl4AI preferred crawler candidate — 2026-10-03

- URL: https://github.com/unclecode/crawl4ai
- Adoption mode: `reference-only` until this project needs to collect public
  web content; then `adapter`.
- Why relevant: the AI Project Kit's preferred crawler (LLM-ready Markdown
  output; the README claims a stealth mode for bot-protected sites). Source:
  `../../AI_architecture/references/community-ai-systems.md`, checked 2026-10-03.
- Status: not installed; no dependency or code change.
- When adopting: copy
  `../../AI_architecture/examples/reference-decisions/crawl4ai-adapter.md`,
  pin 0.9.4 or a later patched release, and use it as a Python library. The Docker server and MCP endpoint are a
  separate decision; past critical RCE and high SSRF advisories were mostly in
  that path.
- Recheck when: this project starts crawling, or a new Crawl4AI advisory appears.

## Live overcount follow-up — 2026-09-25

- Live observation, owner-authorized: followers endpoint pages include `has_more` and `next_max_id`; last page lacks the cursor with `has_more: false`. 285 unique listed vs 284 displayed after reload. Decision: accept a small overcount only with exact CDP evidence and proven terminal pagination; larger or unproven overcounts stay partial. Recheck if Instagram changes the page shape or the gap grows.

## Warning stop, list-end cursor, native input and pacing — 2026-09-24

- Owner selection: after the 2026-09-24 research report, the owner selected four items: non-429 warning stop, `next_max_id` list end with early exit, synthetic event removal, and response-arrival pacing. Not selected: run cooldown and official export import.
- Web endpoint shape (unofficial, [gist](https://gist.github.com/abir-taheer/0d3f1313def5eec6b78399c0fb69e4b1)): `/api/v1/friendships/{id}/followers|following/` responses carry `users`, `big_list`, `page_size`, `next_max_id`. Decision: adopt cursor presence/absence as pagination evidence only with that page shape; a live cursor overrides nothing but makes `has_more: false` conflicting. Recheck with a live response.
- Warning signals ([Instagram Help](https://help.instagram.com/740480200552298/), [online-tech-tips](https://www.online-tech-tips.com/how-to-fix-we-limit-how-often-you-can-do-certain-things-on-instagram-error/)): `feedback_required` / "Try Again Later", checkpoint/challenge and "Please wait a few minutes" can escalate if repeated. Decision: stop without retry, keep 429 on the existing backoff path. Body classification uses fixed codes; raw messages/URLs are never relayed.
- Rate limits: Meta publishes none for these web endpoints; the "200 calls/hour" figure is Graph API only ([Phyllo 2026](https://www.getphyllo.com/post/instagram-api-rate-limits-explained-and-how-to-scale-beyond-them-2026)). [Instaloader troubleshooting](https://instaloader.github.io/troubleshooting.html) advises single-client use and waiting out 429s. Decision: 1.5s minimum after each page is a conservative starting value, recorded in diagnostics for tuning; not a published limit.
- Synthetic events: script-dispatched events carry `isTrusted=false` and are distinguishable by page scripts ([DOM Standard](https://dom.spec.whatwg.org/#dom-event-istrusted)). Decision: remove them rather than disguise input; no CDP `Input` domain, fingerprint or stealth technique was adopted.
- Official alternatives: Basic Display API ended 2024-12-04 ([Meta](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/)); Graph API exposes only counts. The account-data export (`connections/followers_and_following/`) is the only official list source — deferred.
- Verification and rollback: latest `HANDOFF.md` entry.

## Account lookup and result explanations — 2026-09-21

- Owner selection: “ㄱㄱ” after the recommendation to implement next items 1–3 (unified lookup, completion evidence cards, popup diagnostic copy). This is separate from the preceding progress/429 diagnostics bundle.
- Reuse decision: existing `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` and UI-only, run-bound stop-message pattern in `background.js`; no new API, permission, dependency, Instagram endpoint or network request. `main.js` queries its full strict/assisted/candidate collections, never the 1,000-name stored UI subsets. The shared `result-insights.js` contract and `result-insights-ui.js` presenter avoid divergent popup/panel rules.
- Accuracy decision: require the same run/profile, finished collector, non-cancelled state, final `CONFIRMED` verdict and a still-confirmed canonical assessment before relationship classification. Exact membership flags remain visible during partial runs, but absence cannot establish a one-sided relationship. No presence in either strict list means only “not observed”, not an account-existence claim. Reloaded/unavailable memory has no truncated-list fallback.
- Explanation decision: reuse `getListCompletionAssessment` / `accuracy-engine.js`; store only two small sanitized summaries (fixed state/reason codes, exact payload counts, count evidence and pending/failed counts). Existing records missing summaries show an explicit unavailable explanation; no data migration.
- Privacy decision: copy only selected counts, completion summaries, bounded diagnostics and a verdict code. Drop arbitrary warnings, event strings, profile, usernames, run ID and URLs, including older stored values. Explain included fields before copy. Search text and its one-account response remain transient UI/message data.
- Recheck when canonical completion states/reason codes, list storage limits or capture interfaces change. Local fixture evidence is not current Instagram compatibility proof. See `HANDOFF.md` for checks and the cumulative fixed review snapshot. Roll back only the selected hunks/new modules after checking drift; do not revert preceding progress diagnostics or existing kit documentation.

## Progress and failure diagnostics — 2026-09-21

- Owner selection: the owner replied “좋은뎅 ㄱㄱ” to the recommendation to implement research items 1–3. Item 4 (extension-action permission coverage and possible Puppeteer upgrade) remains deferred.
- [W3C ARIA progressbar](https://w3c.github.io/aria/#progressbar) and [aria-valuenow](https://w3c.github.io/aria/#aria-valuenow), read during the 2026-09-21 research (ARIA 1.3 editor draft): adopted indeterminate progress when the total is unknown; omit `aria-valuenow`, retain a Korean textual count, and distinguish `null` from a real zero end to end.
- Existing 60/120/240-second 429 waits remain the runtime policy. The UI uses the existing absolute pause deadline; it does not create requests, extend a pause when reopened, or enable recollection. Late 429 signals cannot replace cancelled/finished progress.
- `run-diagnostics.js` is a small shared sanitizer/presenter using existing JavaScript/Chrome session messaging. It accepts only two list modes, eight fixed failure categories, bounded counts and a numeric deadline; arbitrary keys/text are discarded. No external library or new permission is needed for these finite fields. Existing `schemaVersion: 1` records without diagnostics normalize to empty diagnostics; no migration or retained history is introduced.
- Failure codes and counts are additive to the existing completion guards. Exact/assisted membership and capture failure eligibility remain unchanged. A parse failure is not proof that Instagram changed its format.
- Verification and fixed review scope: latest `docs/HANDOFF.md` entry. Rollback only this task's runtime/test files and newly added documentation sections after checking for drift; preserve all pre-existing uncommitted kit edits. No dependency/manifest changes or commit.


## Remaining-work follow-up — 2026-09-19

The owner's “남은 작업 해줘.” selects the remaining R-12 documentation and the
previously reported verification work. R-12 is now adopted; no new optional
runtime/tool or deferred product feature is selected. This entry supersedes
the initial batch's R-12 deferral and dated unknowns below.

| ID / area | Result and evidence | Risk, verification and rollback |
| --- | --- | --- |
| R-12 | `AGENTS.md` pointer and new `docs/CHANGE_REVIEW.md`; fixed snapshot, separate reviewer, verified findings and owner-selected correction procedure | Recurring review cost applies only to important changes. Static missing-approval, stale-snapshot, denied-test and no-finding scenarios checked. Actual review remains blocked/unreviewed. Remove only the pointer, new file and R-12 record paragraphs to roll back. |
| R-01/R-02/R-05/R-06/R-07 records | `docs/PROJECT_PROFILE.md`, `docs/HANDOFF.md`, `docs/SECURITY.md`, `docs/PROFILE_CHECKLIST.md`, and this file update current outcomes | Documentation only. Preserve old handoff/history and user edits; reverse only this follow-up's hunks after checking for drift. |
| Local browser verification | `npm run e2e`: six scenarios passed in 114.8s. `npm run e2e:capture`: passed in 45.2s. `npm run ui:e2e`: six viewports and stale-profile checks passed in 4.9s. `npm test` also passed. | Synthetic local pages and separate test browser profiles; no live Instagram proof. The existing harness created ignored test copies/screenshots, without changing runtime source. |
| Remote source freshness | Read-only `git ls-remote origin HEAD refs/heads/main` returned `7fdda0c1db8cc571dc40a366fe9afe44a644a448` for both; local comparison HEAD is two commits ahead, zero behind. | Point-in-time observation, no fetch/pull/push. Nine dirty source paths still prevent treating HEAD alone as the exact source; recorded hashes remain required. |
| Notion skill provenance | Both installed copies and the blob introduced at `d807f78d33374454de40fece29178161296f4c5c` (2026-06-10, `v3`) share SHA-256 `73e0def40f3aca462455240fb5c61879d80a56a59c99ad527308500fca7ebb1d`. | Local introduction is identified; no external author/source/version/update URL was found. Do not claim latest upstream or replace it from an unrelated skill. Existing supplied-page-only rules remain unchanged. |
| Host controls | Codex CLI 0.154.0 trial blocked loopback connection but unexpectedly allowed a denied synthetic read and read-only-directory write; exact attempts recorded in `SECURITY.md`. | Failed boundary, not successful isolation. No persistent settings changed and no secret/private file tested. Root cause, provider retention and organization controls remain unassessed. |
| Independent review / fresh-session behavior | Blocked/unreviewed: required restricted file access was not established. No fresh reviewer/behavior session was started. | Do not substitute author self-checks for independent review. Next action is a supported environment with successful harmless probes, or human review; owner is the project operator. |
| Live Instagram normal/stop checks | Blocked by `Sky Computer Use native pipe startup failed`; native/browser inventory unavailable, separate automation browser showed only `about:blank`. | No account accessed. Reconnect the user's logged-in Chrome tab before checking normal comparison and manual stop; no credential/profile copying. |

R-12 concept source: `recipes/independent-change-review.md` at kit comparison
HEAD `e25d4a0d9a11504aa6588333cbaf397e6838266a`. Pre-edit source HEAD and all
347 recorded entries matched `kit-baseline.json`; target HEAD and all 208
recorded entries matched the previous `post-batch.json`. The only project
changes in this follow-up are the seven paths in the first two rows.

Official [Codex permission profiles](https://learn.chatgpt.com/docs/permissions)
and [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
were read on 2026-09-19, alongside local CLI help. The docs describe command
filesystem/network controls; the actual failure above overrides an assumption
that setting those options establishes isolation. No persistent profile was
installed and no model credentials were extracted or copied.

Static R-12 scenario results: a verified finding without owner selection stays
`pending`; changed relevant hashes stop application; a denied test is
`unverified`; no findings authorizes neither correction nor release. These
four document walkthroughs passed by inspection, not by a fresh agent trial.
Review-driven findings, if later reported, still need their own owner decision.

The frozen 57-row inventory is retained. Remote freshness is now assessed,
bringing assessment coverage from 53/57 to 54/57. The host-control area has a
representative failed file-boundary trial, but its wider controls/egress remain
unassessed; do not count it as fully assessed or satisfied. External Notion
upstream and fresh-session behavior also remain unassessed. All 15 candidate IDs have now
been applied with scoped local/static checks; R-12's independent/live behavior
validation is incomplete, so this is not a fully verified adoption. The original
optional-tool exclusions and product deferrals below remain in force.

Evidence directory: `/private/tmp/instagram-kit-review-4snbwf_j/remaining/`.
`pre-apply/` preserves the six existing files before this follow-up;
`selected-paths.json` records those plus `docs/CHANGE_REVIEW.md`.
`task-only.patch`, `rollback.patch`, and `post-followup.json` identify this batch
separately from the initial refresh. Check current hashes against the latter
before considering rollback; never reset the whole dirty tree. If temporary
evidence is gone, reconstruct and review only this follow-up's inverse hunks.
R-12 has no installed service to remove. No commit, push, kit-source update,
remote mutation, package installation or global settings change was performed.

## AI Project Kit partial refresh — 2026-09-19

The owner reviewed the 2026-09-18 candidate report, then requested:
“최대한 현재 프로젝트에 영향을 주지않도록 하면서 최대한 많은거 적용해서 바로 사용할 수 있게 해줘.”
This authorizes the low-impact subset R-01–R-11 and R-13–R-15. R-12's standing
independent-review procedure is deferred to avoid a new recurring workflow burden.
Owner: local project operator. Adoption mode: concept-only for guidance, with
target-specific edits to existing docs/roles; no kit runtime or new tool install.

### Fixed comparison and recheck

- Target base: `main`, `c022f649f6a9a05a3b001d61fb5cf5d7b5d6d0e0` (v1.8.0).
- Source: `/Users/shwoo/mydir/AI_architecture`, `e25d4a0d9a11504aa6588333cbaf397e6838266a` plus the uncommitted paths below; dirty-provisional, remote freshness not checked.
- Earlier partial sources: `ef3969d848d33f905b3977ccaa4ecf0def79b4cd` and `7fdda0c1db8cc571dc40a366fe9afe44a644a448`. No known full-adoption revision; checked these history ranges and the current `CHANGELOG.md` Unreleased section without assuming either partial source was a complete migration.
- Pre-edit recheck: target and source HEAD, branch, full Git status and recorded file contents matched the report. Original inventories: 207 target and 347 source entries, tracked plus nonignored untracked files.
- Evidence directory: `/private/tmp/instagram-kit-review-4snbwf_j`; `target-baseline.json` SHA-256 `624fce5bca1acde20f96942f1d4ee1ebb9aa3017783380d8ece2247b52956648`; `kit-baseline.json` SHA-256 `786a57cce6e8777cd63f6d234555dd31cf5bf0ac08bc2d8eb3cf8c92dfc1ec32`.
- Temporary primary reference: `reference/` under that directory, generated with `legacy-project-upgrade`. `adapter-reference/` separately compared `CLAUDE.md`, `.claude/skills/claude-md-rules-skills/SKILL.md`, and `docs/generated/codex-agents.md`. No generator ran against this project.
- Source indexes checked: `recipes/README.md`, `templates/optional/README.md`, `examples/README.md`, `references/README.md`; relevant procedures/templates and target code/tests were inspected, not only the indexes.

| Dirty source path | SHA-256 |
| --- | --- |
| `CHANGELOG.md` | `4bb28fc824ed9f7120826b297c2d8b9808e18c5bdfd279ec15002b96c73b4a16` |
| `START_HERE.md` | `3f4949a177dfc09e5a970fe662b81280043277e7013e727199dd795a5af37873` |
| `examples/README.md` | `e75d1e07647bbaa6a6f9276e6f8f85dc088dde59f02485004cc3b56e888e6936` |
| `examples/adoption-prompts.md` | `ab78a35258a19e6913ed249b9cfaaf530f3bd04c3f74b440c4733d739ab5619f` |
| `recipes/README.md` | `076d70b14d8801b2675cfa483a4c118caa3373c3236619cff7330a4b4107458b` |
| `recipes/refresh-applied-project.md` | `7a6bfec7a9a65d79b48942ab153e2d7f3d656df7a067c896c174cd9cdb9bfd8e` |
| `templates/optional/README.md` | `c876c42b3c1dacb2040bd9c084e1e0ecb3f74fd5468652f87105f676b95dd322` |
| `examples/legacy-project-upgrade/filled-comprehensive-refresh.md` (untracked) | `f2cc2a6fd3af8017b1409fc6b8c2fd349d7d23fcc804737aad8b57cd7e989022` |
| `templates/optional/project-refresh-coverage.md` (untracked) | `2fcf2e3e7847a51a4395aba1d8a12c6ddb8b5e6879de815702743779ffcb366d` |

### Selected paths and validation

| ID | Exact project paths | Scope and validation |
| --- | --- | --- |
| R-01 | `docs/PROJECT_PROFILE.md` | Partial metadata and current evidence model; source/target/selection cross-check |
| R-02 | `docs/HANDOFF.md` | Refresh outcome and remaining work; existing product handoff/history retained |
| R-03 | `AGENTS.md` | Startup, read-only boundary, primary check, current evidence; compare callers and engine |
| R-04 | `CLAUDE.md` | Minimal stale-description corrections; retain handwritten adapter and import |
| R-05 | `docs/SECURITY.md` | Fill dated known/unknown observations; no settings or deny trial |
| R-06 | `docs/PROFILE_CHECKLIST.md` | Present/absent/deferred inventory; compare paths |
| R-07 | `docs/REFERENCES.md` | Provenance, selected scope, source limits, recheck and rollback |
| R-08 | `.gitignore` | Secret/artifact patterns only; check env-example exception and tracked-path preservation |
| R-09 | `START_HERE.md` | Current entrypoints, local test and read-only handoff; check links/commands |
| R-10 | `docs/ACCURACY_EVAL_PLAN.md` | Map current cases to existing tests; browser limits are documentation only |
| R-11 | `docs/UI_QUALITY.md` (new) | Existing components, state/viewport and evidence rules; code/test-source comparison |
| R-13 | `.agents/skills/instagram-accuracy-debugging/SKILL.md`, `docs/REFERENCES.md` | Correct existing skill evidence policy; preserve name/description; structural and scenario review |
| R-14 | `.agents/subagents/accuracy-architect.md`, `.agents/subagents/debug-ux-designer.md`, `.agents/subagents/runtime-reviewer.md`, `.agents/subagents/instagram-accuracy-architect.md`, `.agents/subagents/instagram-debug-ux-designer.md`, `.agents/subagents/instagram-runtime-reviewer.md`, `docs/REFERENCES.md` | Correct six existing advisory roles, scope and uncertainty; no worker registered or invoked |
| R-15 | `docs/LINKS.md` | Add existing adopted APIs; four official Chrome pages opened on refresh date |

### Existing optional-surface records

R-13/R-14 owner is the local project operator. Their source is this project's
existing local guidance, with kit `skill-writing`, `skill-update-maintenance`,
`subagent-policy`, `evidence-contracts` and optional adoption/source-record
templates used as concept references. Kit records are not an upstream update
channel for project-specific skill behavior. The follow-up owner request above
is the adoption authority; scope is only the exact existing paths in the table.

- Trigger: the existing accuracy skill description or an explicitly assigned relevant review task; no expanded skill discovery trigger.
- Inputs: canonical project docs, scoped source/callers, synthetic tests and sanitized diagnostics. Outputs: bounded analysis or explicitly assigned edits.
- Permissions: no new filesystem, network, browser, connector or credential authority. Role limits are advisory, not enforced sandboxing. Follow active delegation policy; nested delegation is not granted by role text.
- Added scripts/dependencies/hooks/MCP/worker registration: none. Background behavior and new runtime state: none.
- Validation: compare strict capture versus assisted/candidate scenarios and cancellation/pending-capture rules to current code; validate skill structure and existing tests. Live skill/role behavior is not proven by static review.
- Rollback: reverse only R-13/R-14 edits and their record paragraphs; retain previously installed surfaces. Do not delete the entire pre-existing skill/role folders.

Other installed skills are preserved: `.claude/skills/explain-for-humans/`
(three files) matches the kit example; `.agents/skills/explain-for-humans` links
to it. The 2026-09-02 source is recorded above in the historical entry.
`.agents/skills/notion-feature-documenter/SKILL.md` and
`.claude/skills/notion-feature-documenter/SKILL.md` match each other; upstream
and installed source revision are unknown. Its existing supplied-page-only
Notion boundary is unchanged. None of these files was refreshed or reinstalled.
Future skill updates require source identification and diff review, not an
assumption that a matching local copy is the latest upstream version.

### Rollback and remaining scope

Post-change checks: `npm test` passed; kit `--applied` checker passed with 0
issues (24 before), explicitly retaining unknowns. Skill `quick_validate.py`
passed using existing `/opt/anaconda3/bin/python`; initial `python3` lacked
PyYAML, so no package was installed. Static review compared source eligibility,
bounded fallback, pending capture, cancellation and stale-result scenarios to
the current engine and existing fixtures. Skill name/description, original
Communication/import blocks, and all prior handoff text were preserved. Local
links and ignore exceptions were checked. Selected verification is 14/14 for
the documented local/static scope; no live agent trial, independent reviewer,
browser/e2e suite or live Instagram check is included.

Pre-edit copies of the 18 existing selected files live under `pre-apply/` in
the evidence directory; file-level inverse diffs are under `rollback/` after
validation. For a single candidate, reverse only its corresponding paragraphs
and record entries. Shared-file patches must be split by candidate rather than
reverting another selected item. Remove only the new `docs/UI_QUALITY.md` for
R-11. Preserve concurrent edits; compare against `post-batch.json` before any
rollback. Do not use whole-tree reset, stash, or HEAD checkout: they would erase
the user's older uncommitted changes. Temporary evidence is not a durable
dependency; if it is missing, reconstruct and review a scoped inverse from the
recorded task diff before changing files.

Original inventory v1 remains 57 rows, 53 assessed; four unassessed areas remain:
effective host deny/egress controls, Notion skill upstream, fresh-session behavior
trials, and remote source freshness. The kit source is still provisional.
Deferred: R-12 standing independent review, default Claude refinement skill,
and existing CI/product deferrals. Excluded: new MCP/hooks/plugins/memory/eval
runtime/research archive/worktree automation, SDK adapters, copied reference-pack
replacement, and old scaffold-helper upgrades. Do not resume those as side effects.

Recheck when the source revision/dirty paths/content changes, relevant target
instructions/configuration changes, or a later task selects a deferred surface.
For non-trivial new infrastructure, inspect official APIs and maintained
implementations first; record the selected/rejected choice, owner, version and
recheck condition. A known reference or matching fixture is not proof of every
behavior. Local source review, executed checks, and live observation stay separate.

Use this file for official docs, adoption decisions, and source provenance that
affect this Chrome extension.

## Official docs to check first

### Chrome Extensions

- URL: https://developer.chrome.com/docs/extensions/
- Use for: Manifest V3, extension permissions, service workers, messaging, and DevTools pages.
- Adoption mode: official-docs

### Chrome DevTools extension APIs

- URL: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- Use for: `chrome.devtools.network.onRequestFinished`, `chrome.devtools.network.onNavigated`, and `request.getContent()`.
- Adoption mode: official-docs

### Chrome extension messaging

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Use for: `chrome.runtime.sendMessage`, `chrome.runtime.connect`, Ports, and tab relays.
- Adoption mode: official-docs

## Decisions

### DevTools Network capture

- Decision: use `chrome.devtools.network` when DevTools is open.
- Why: it can read response bodies through `request.getContent()` and remains the preferred path when DevTools is already open.
- Boundaries: extract usernames, discard raw bodies, relay only sanitized usernames and metadata.
- Status: adopted.

### Debugger permission

- Decision: adopt `debugger` for this local-only build after explicit operator approval.
- Why: it provides exact response-body evidence without requiring the operator to open DevTools. It is limited to a user-started run, skips busy targets, and detaches at every terminal boundary.
- Boundaries: Network domain only; bounded bodies; sanitized derived usernames/pagination only; no raw payload, headers, cookies, tokens, query strings, DMs, request generation, target stealing, or auto-reattach.
- Status: adopted on 2026-08-25; not a recommendation for public-store distribution.

## 2026-06-07 Accuracy Research Addendum

### MV3 service worker lifecycle

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Use for: background worker restart/idle behavior, stale global state risk, and storage guidance.
- Decision: DevTools bridge state must have freshness timestamps and disconnect cleanup; do not trust background globals indefinitely.
- Status: adopted.

### Content script isolated world and MAIN-world execution

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- URL: https://developer.chrome.com/docs/extensions/reference/scripting/
- Use for: deciding whether page request interception belongs in isolated `main.js` or MAIN-world `page-network-bridge.js`.
- Decision: page-network evidence must come from the MAIN-world bridge; isolated-world XHR/fetch hooks are not equivalent page traffic evidence.
- Status: adopted.

### chrome.storage.session

- URL: https://developer.chrome.com/docs/extensions/reference/api/storage
- Use for: sanitized run snapshots and bounded debug state.
- Decision: store only derived usernames, counts, timestamps, source labels, and diagnostics; keep raw response bodies and secrets out.
- Status: adopted.

### declarativeNetRequest

- URL: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- Use for: request blocking/modification capability review.
- Decision: do not adopt for username extraction because it is not a response-body extraction API.
- Status: rejected for this use case.

### chrome.debugger

- URL: https://developer.chrome.com/docs/extensions/reference/api/debugger
- Use for: run-scoped CDP Network response capture when the existing DevTools bridge is not fresh.
- Decision: adopt for the explicitly local-only workflow. Use protocol version 1.3, Chrome 118+, bounded Network buffers, exact endpoint/list-container trust gates, and explicit detach cleanup.
- Status: adopted on 2026-08-25 with deterministic fixtures; real Instagram Chrome validation remains pending.

### Web UI flakiness research

- URL: https://arxiv.org/abs/2402.09745
- URL: https://arxiv.org/abs/2103.02669
- Use for: repeated-regression thinking around async waits, dynamic DOM, and UI execution-order uncertainty.
- Decision: prefer explicit evidence contracts and fixtures over more blind retries or selector tweaks.
- Status: adopted as harness guidance.

### DOM observation APIs

- URL: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
- URL: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- Use for: virtualized-list diagnostics and scroll-completion signals.
- Decision: use DOM observation as diagnostic/fallback evidence; never let it override confirmed network evidence without bounded fallback rules. Runtime adopted on 2026-06-10 in R3 with `dom-observer` and `dom-observer-candidate` sources.
- Status: adopted.

## 2026-06-10 Collection Resilience Addendum

### 429 rate-limit backoff

- URL: https://www.getphyllo.com/post/navigating-instagram-api-rate-limit-errors-a-comprehensive-guide
- URL: https://github.com/instaloader/instaloader/issues/834
- URL: https://the-erone.com/http-error-429-instagram/
- Use for: deciding how the collector should react when Instagram returns HTTP 429 during list pagination.
- Decision: observe status code only, pause scrolling with 60s -> 120s -> 240s backoff, then partial-exit after repeated signals. Do not inspect error bodies, create retry requests, or add new permissions.
- Status: adopted.

### DevTools navigation reset

- URL: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- Use for: `chrome.devtools.network.onNavigated` and the limitation that DevTools misses requests made before DevTools was opened.
- Decision: reset per-page DevTools capture counters on navigation and relay `reason: "navigated"` so the page console can tell the operator to reopen followers/following lists.
- Status: adopted.

## 2026-06-11 Platform Stability Addendum

### Service worker state mirroring

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Use for: MV3 service worker shutdown/restart behavior and avoiding reliance on globals.
- Decision: mirror DevTools bridge tab state from the in-memory Map into `chrome.storage.session` and hydrate before content preflight reads. Existing freshness TTL still decides whether hydrated state is usable.
- Status: adopted.

### storage.session quota guard

- URL: https://developer.chrome.com/docs/extensions/reference/api/storage
- Use for: `chrome.storage.session` capacity limits and safe snapshot persistence.
- Decision: keep profile snapshots under a conservative per-snapshot budget, expose `storage.truncatedSections`, store lastRun as a `{ ref }` record, and retry once with a minimal derived snapshot on quota errors. Do not add `unlimitedStorage`.
- Status: adopted.

### Minimum Chrome version

- URL: https://developer.chrome.com/docs/extensions/reference/manifest
- Use for: declaring the minimum Chrome version needed by the extension runtime.
- Decision: set `minimum_chrome_version` to `114` because the extension depends on MV3 scripting/storage.session-era APIs and service-worker Port lifetime behavior documented for modern Chrome. This is not a permission change.
- Status: adopted.

### Puppeteer extension e2e harness

- URL: https://developer.chrome.com/docs/extensions/how-to/test/puppeteer
- Use for: loading an unpacked extension in Chrome during local development tests.
- Decision: adopt `puppeteer` as a devDependency only. The e2e test build copies runtime files into `tools/e2e/.build/` and adds localhost `host_permissions` only to that copied manifest; deployment manifest permissions remain unchanged.
- Status: adopted as local harness; current environment still needs a successful `npm run e2e` run.

## AI Project Kit refresh 2026-09-02

- Kit source: `/Users/shwoo/mydir/AI_architecture` at `ef3969d` (main).
- Mode: additive refresh per the kit's `recipes/refresh-applied-project.md`; no existing line was changed or removed, and files with uncommitted changes were left untouched.
- Applied: added `.claude/skills/explain-for-humans/` (copy of the kit example)
- Applied: added `.agents/skills/explain-for-humans` -> `../../.claude/skills/explain-for-humans` symlink (Codex path)
- Applied: appended the effective-enforcement record and third-party intake rules to `docs/SECURITY.md`
- Applied: appended a `## Communication` section with checkable communication rules to `AGENTS.md`
- Applied: appended an `@AGENTS.md` import to the hand-written `CLAUDE.md` so Claude Code also loads `AGENTS.md`

## 2026-09-05 Capture completion and live result context

- [Chrome network events](https://chromedevtools.github.io/devtools-protocol/tot/Network/): adopted separate pending response, body-read and delivery acknowledgement tracking in `debugger-capture.js`; request timing accompanies derived evidence so delayed earlier responses cannot replace later pagination state. Covered by `tools/debugger-capture-fixtures.mjs` and `tools/accuracy-engine-fixtures.mjs`.
- [Puppeteer extension testing](https://pptr.dev/guides/chrome-extensions): adopted a separate `npm run e2e:capture` gate using the actual popup button handler, debugger controller, parser and relay. Only test-copy origin gates accept the loopback fixture. Puppeteer does not attach to the fixture tab, since that correctly triggers the production busy-target guard. This tests neither a real Instagram response shape nor the browser's physical-click permission grant.
- [Chrome service-worker termination testing](https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer): adopted `WebWorker.close()` in the local capture gate, followed by a popup start that wakes the worker and explicit debugger detachment.
- [Chrome navigation events](https://developer.chrome.com/docs/extensions/reference/api/webNavigation): same-document history changes require distinct handling. Chosen implementation uses existing tab events plus a collector context reply; it adds no `webNavigation` permission. The real loopback capture gate exposed `loading` notifications during modal history changes. Regression: `tools/navigation-fixtures.mjs`.
- [Structured clone messaging, April 22, 2026](https://developer.chrome.com/blog/structured-clone-messaging): deferred. Current bounded username/count/reason-code messages do not require new serialization types or a higher Chrome minimum.

## 요청된 연구 개선의 기록 — 2026-09-20

소유자가 자료를 문서 개선으로 연결해 달라고 요청한 경우에만 적용한다.
단순 조사·상태 질문은 답변으로 끝내고 파일을 수정하지 않는다.

개선 시작 시 비교할 항목 목록과 허용 파일을 정한다. 각 항목의 출처,
기존 충족·후보·제외·보류 판단, 정확한 대상 경로, 사용자 선택, 실제 반영,
검증 근거를 구분한다. 표를 쓴다면 선택 여부·반영 여부·검증 근거는
서로 다른 열로 둔다. 미완료 항목에는 담당자·다음 행동·재확인 조건을 남긴다.
새 자료로 범위가 늘어나면 목록 변경 이유를 기록하고 미완료 항목을 지우지 않는다.

문서 반영과 실제 효과 확인은 다르다. 예를 들어 문단을 추가했지만 동작
검사를 하지 않았다면 `반영: 문서만 / 검증: 문구 대조, 동작 미실행`으로
기록한다. 보류는 완료가 아니며, 미선택 후보와 검토 의견은 수정 권한이
아니다. 기존 항목별 승인 절차와 더 엄격한 현지 규칙이 우선한다.
이 기록 방식은 자동 검색·예약 작업·새 평가 도구를 만들거나 실행하지 않는다.

이번 문서 부분 반영은 MD-07(비교 평가 조건)과 MD-08(기록 규칙)이다.
실제 계정 자료·원시 응답은 근거 기록에 넣지 않는다. 독립 검토와 수정 승인에는
기존 [중요 변경 검토](CHANGE_REVIEW.md)를 따른다. 실제 행동 실험·자동 실행·
원본 평가 재현은 미실행이며 이 문서 반영으로 완료 처리하지 않는다.

이 절은 2026-09-20 문서 부분 반영(MD-08)이다. 앞의 과거 기록과
당시 검증 결과는 그대로 보존한다. 출처는
[키트의 연구 반영 기록](../../AI_architecture/examples/research-materials/2026-09-20-harness-loop-adoption.md)이며,
비교본은 `main/e25d4a0`에 미커밋 문서 변경이 더해진 임시 상태다.
키트 전체의 확정 버전을 적용했다는 뜻이 아니다. 되돌릴 때는 이번에 추가한
문단·필드만 제거하고 기존 파일 전체를 삭제하거나 복원하지 않는다.

## 적용 근거 보존 — 2026-09-21

2026-09-20 문서 부분 적용과 종료된 검토의 근거는
[키트의 정식 보존 기록](../../AI_architecture/dogfood/reports/2026-09-20-mydir-doc-adoption.md)에 있다.
보고서·당시 원본 사본·내용 식별값을 함께 보관했다. 앞의 임시 경로는 과거 작업
위치이며 이 보관본에서 당시 판정을 확인할 수 있다. 이번에는 이 링크만 추가했다.
형제 AI_architecture 체크아웃이 없으면 접근할 수 없으며, 실제 동작 검증이나
새 작업 승인으로 해석하지 않는다.
