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

After any change to the three runtime scripts:

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

There is no test suite, no bundler, and no lint config — `node --check` is the only automated gate. Real correctness comes from the manual Chrome flow: reload the unpacked extension at `chrome://extensions`, reload the Instagram profile tab, open DevTools **before** opening the followers/following modal, click the extension action, then read the Korean console summary plus the bridge status logs. If validation can't be run, record why in `docs/HANDOFF.md`.

## Architecture: the four scripts and how they exchange usernames

The extension is intentionally layered because Instagram's DOM and network shapes change often. No single collection path is trusted — each script feeds usernames into `main.js`, which deduplicates, tags provenance, and decides reliability. Understanding the message flow is the only architectural knowledge that requires reading multiple files at once.

**1. `background.js` (MV3 service worker)** — two responsibilities:
- On extension-action click for an `instagram.com` tab, injects `page-network-bridge.js` into the **MAIN** world, then `main.js` into the default isolated content world (`injectInstagramCollector`).
- Acts as a router between the DevTools page and the inspected tab. DevTools opens a long-lived `chrome.runtime.connect({ name: "ig-devtools-network" })` Port; `background.js` validates each message's `source`/`schemaVersion`, sanitizes it with `buildRelayPayload`, and forwards via `chrome.tabs.sendMessage` to the inspected tab. It also handles `IG_STORE_RUN_SNAPSHOT` by compacting+sanitizing the snapshot (stripping `unresolvedRows`/`text`/`textContent`, slicing arrays) before writing to `chrome.storage.session`.

**2. `page-network-bridge.js` (MAIN world)** — wraps `XMLHttpRequest.prototype.open/send` and `window.fetch` so JSON responses matching `/(friendships|followers|following|graphql)/i` are parsed and walked for `username` fields (depth ≤ 12, with `users|items|edges|nodes|data` traversal). Extracted usernames are posted via `window.postMessage` with `{source: "ig-page-network-bridge", schemaVersion: 1}`. Guarded by `window.__igFollowerPageNetworkBridgeInstalled` so multiple injections don't double-hook. Discards raw bodies — only username arrays cross the boundary.

**3. `devtools.js` (DevTools extension page, optional)** — listens to `chrome.devtools.network.onRequestFinished`, filters to Instagram JSON URLs (`CANDIDATE_URL_RE`), decodes base64 bodies, runs the same `username` walker, and pushes the resulting usernames over the long-lived Port to `background.js`. Sends periodic `IG_DEVTOOLS_READY` / `IG_DEVTOOLS_STATUS` heartbeats (2s / 5s) so `main.js` can tell whether DevTools capture is actually connected. Tracks per-step counters (`matched`, `sent`, `ignored`, `failed`, `acked`, `lastSeq`) in `stats` — surface these when debugging "DevTools isn't capturing."

**4. `main.js` (injected content script)** — the orchestrator. Walks `followers` then `following` modals, scrolls each list, and merges usernames from three sources: DOM extraction, the page-network bridge (`window.postMessage` listener), and the DevTools bridge (`chrome.runtime.onMessage` listener). For each username it records provenance in `state.userProvenance` (Set of sources, confidence, reasons, seenCount) and decides confirmed-vs-candidate. Reliability per list (`getListReliability`) compares verified count to the expected count parsed from Instagram's visible label. Output is Korean-first, partial results are always printed with the warnings that explain which side is incomplete and which diff fields may be wrong. Final snapshot is persisted via `IG_STORE_RUN_SNAPSHOT` to `background.js`, and a debug report is exposed on `window.__igFollowerDebugReport`.

### Safety invariants baked into `main.js`

These are constants at the top of `main.js` and the rest of the file is structured around them — change them deliberately, not incidentally:

- `EXECUTION_MODE = "collect-and-compare"` and `FOLLOW_ACTION_ENABLED = false` — the default flow collects and compares only; it never clicks follow buttons. Re-enabling follow-on-collect is an explicit, separate decision (see backlog IG-008).
- `FINAL_DIFF_POLICY = "verified_members_only"` — ambiguous usernames seen only via network signals stay in `state.candidateUsers` and are **excluded** from the final diff. They appear in `excludedFromDiff` in the debug report.
- Storage caps (`compactProvenance`, `compactSnapshot`, `compactDebugReport` in `background.js`) slice arrays to bounded sizes before hitting `chrome.storage.session` — preserve these when adding new fields.

## Output and data rules

- User-facing console output is Korean. Preserve it on any path that changes summaries, warnings, or diagnostics.
- Never hide partial or unreliable results — print the reliability status, which list is short, and which diff fields are affected.
- Permitted persisted data: derived usernames, counts, source/provenance, timestamps, diagnostics. Never persist cookies, auth headers, raw response bodies, DMs, or anything beyond what `docs/SECURITY.md` allows.
- Extension permissions (`manifest.json`) are intentionally minimal (`activeTab`, `scripting`, `storage`). Adding `debugger`, broad host permissions, or remote endpoints requires the documented adoption record in `docs/SECURITY.md`.

## Where things go

- Extension runtime bugs → `docs/BACKLOG.md`.
- Stable facts about the extension → `docs/PROJECT_PROFILE.md`.
- Privacy/permission constraints → `docs/SECURITY.md`.
- Current session state and next action → `docs/HANDOFF.md`.
- Kit/starter-kit improvements (not extension bugs) → `dogfood/`.
