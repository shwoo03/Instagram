# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Companion docs

`AGENTS.md` is the canonical agent rule source — read it before editing. The `docs/` set carries longer-lived context that this file deliberately does not duplicate:

- `docs/PROJECT_PROFILE.md` — purpose, users, non-goals, optional-surface policy.
- `docs/SECURITY.md` — data-handling and permission boundaries (authoritative for any privacy/permission change).
- `docs/HANDOFF.md` — current session state and the next smallest action.
- `docs/BACKLOG.md` — project-specific runtime bugs and feature work.

Kit-level scaffolding (`recipes/`, `examples/`, `templates/`, `profiles/`, `tools/`, `dogfood/`) is leftover starter-kit reference material and is **not part of the extension runtime**. Do not let it override the project-specific docs above or pull the extension toward generic AI-kit patterns.

## Validation

Primary local validation is `npm test` (syntax plus synthetic fixtures, no browser).
Focused checks after collector/bridge changes remain:

```bash
node --check main.js
node --check background.js
node --check devtools.js
node tools/walker-fixtures.mjs
node tools/compare-fixtures.mjs
```

Optional local e2e gate after `npm install`:

```bash
npm run e2e
```

There is no bundler or lint configuration, but `npm test` covers the pure engine, parser, capture, account lists, run context, storage, and comparison fixtures. Optional `npm run e2e`, `npm run e2e:capture`, and `npm run ui:e2e` open a local test browser; limits and rerun conditions are in `docs/ACCURACY_EVAL_PLAN.md`. They do not prove real Instagram behavior. For an authorized operator check, reload the unpacked extension and Instagram tab, then use the popup's **비교 시작** button; DevTools is optional. Keep browser checks out of documentation-only work. Report skipped checks in the handoff, or in chat for a read-only request.

## Architecture: collection and derived results

The extension is intentionally layered because Instagram's DOM and network shapes change often. No single collection path is trusted — each script feeds usernames into `main.js`, which deduplicates, tags provenance, and decides reliability. Understanding the message flow is the only architectural knowledge that requires reading multiple files at once.

**1. `background.js` (MV3 service worker)** — collection startup and relays:
- A popup start prepares capture, then `injectInstagramCollector` loads the shared parser/engine and collector. Fresh DevTools is preferred; otherwise `debugger-capture.js` manages run-scoped Network capture. The page-network bridge uses the MAIN world while `main.js` uses the isolated content world.
- Acts as a router between the DevTools page and the inspected tab. DevTools opens a long-lived `chrome.runtime.connect({ name: "ig-devtools-network" })` Port; `background.js` validates each message's `source`/`schemaVersion`, sanitizes it with `buildRelayPayload`, and forwards via `chrome.tabs.sendMessage` to the inspected tab. It also handles `IG_STORE_RUN_SNAPSHOT` by compacting+sanitizing the snapshot (stripping `unresolvedRows`/`text`/`textContent`, slicing arrays) before writing to `chrome.storage.session`.

**2. `page-network-bridge.js` (MAIN world)** — optional XHR/fetch observation bound to the current run/profile. It extracts derived usernames and discards raw bodies. Installation/readiness does not mean capture is enabled; `PAGE_NETWORK_AUTO_ASSIST_ENABLED` is false. Its evidence remains assisted, never strict DevTools/Debugger evidence.

**3. `devtools.js` and `debugger-capture.js`** — optional DevTools capture and fallback automatic capture use `network-payload-parser.js` for exact list classification and sanitized extraction. Pending body reads, failed capture, request order, and delivery acknowledgements matter to completion. Readiness is not payload confirmation. Debugger capture detaches at completion/cancellation/navigation and never steals a busy target or creates Instagram requests.

**4. `main.js` (injected content script)** — opens and scrolls the lists, preserves per-user provenance, and separates strict DevTools/Debugger evidence from page-network/DOM assisted evidence. `accuracy-engine.js` defines comparison, completion, pending-capture and integrity rules. Cancellation preserves a partial result and rejects late evidence. Korean output and `window.__igFollowerDebugReport` expose uncertainty; sanitized snapshots go through background session storage.

**5. Shared result UI/storage** — `account-list-contract.js` sanitizes bounded lists, `account-list-ui.js` renders search/disclosures and evidence reasons, `run-context.js` rejects stale-profile display, and `session-retention.js` serializes writes and prunes older session results. Reuse these modules for popup/panel changes; see `docs/UI_QUALITY.md`.

### Safety invariants baked into `main.js`

These are constants at the top of `main.js` and the rest of the file is structured around them — change them deliberately, not incidentally:

- `EXECUTION_MODE = "collect-and-compare"` and `FOLLOW_ACTION_ENABLED = false` — the default flow collects and compares only; it never clicks follow buttons. Re-enabling follow-on-collect is an explicit, separate decision (see backlog IG-008).
- `FINAL_DIFF_POLICY = "verified_members_only"` — ambiguous usernames seen only via network signals stay in `state.candidateUsers` and are **excluded** from the final diff. They appear in `excludedFromDiff` in the debug report.
- Exact DevTools/Debugger list evidence alone can enter strict comparison. Bounded DOM fallback affects the assisted preview only; a complete-looking count does not upgrade its source.
- Storage caps (`compactProvenance`, `compactSnapshot`, `compactDebugReport` in `background.js`) slice arrays to bounded sizes before hitting `chrome.storage.session` — preserve these when adding new fields.

## Output and data rules

- User-facing console output is Korean. Preserve it on any path that changes summaries, warnings, or diagnostics.
- Never hide partial or unreliable results — print the reliability status, which list is short, and which diff fields are affected.
- Permitted persisted data: derived usernames, counts, source/provenance, timestamps, diagnostics. Never persist cookies, auth headers, raw response bodies, DMs, or anything beyond what `docs/SECURITY.md` allows.
- Current local-only permissions are `activeTab`, `debugger`, `scripting`, and `storage`; Chrome 118+ is required. The existing Debugger adoption is scoped in `docs/SECURITY.md`. Further permissions, broad hosts, or remote endpoints need their own decision.

## Where things go

- Extension runtime bugs → `docs/BACKLOG.md`.
- Stable facts about the extension → `docs/PROJECT_PROFILE.md`.
- Privacy/permission constraints → `docs/SECURITY.md`.
- Current session state and next action → `docs/HANDOFF.md`.
- Kit/starter-kit improvements (not extension bugs) → `dogfood/`.

<!-- AI Project Kit refresh 2026-09-02 (kit ef3969d): block added by refresh; edit freely -->
@AGENTS.md
