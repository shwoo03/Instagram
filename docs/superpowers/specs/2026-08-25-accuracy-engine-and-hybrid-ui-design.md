# Accuracy Engine and Hybrid UI Design

## Status

- Date: 2026-08-25
- Decision: approved direction; implementation pending written-spec review
- Sequence: accuracy engine first, hybrid UI second
- Distribution: local unpacked extension only
- Official Instagram export import: out of scope

## Problem

The current extension produced a successful real Chrome run with DevTools evidence for 283 followers and 283 following accounts, a passed compare-integrity check, and a zero/zero final difference. Its evidence ordering and candidate exclusion prevented two DOM-only follower candidates from entering the final comparison.

Several boundary conditions can still overstate confidence:

- a small displayed-count gap can be accepted after DOM list-end observation without proving network pagination exhaustion;
- abbreviated displayed counts such as `1.2K` or `1.2만` can be parsed as `1`;
- page-network messages are not bound to a particular run and profile;
- DOM fallback promotion can occur after an unsafe termination reason;
- the decision card and debug report derive reliability separately;
- console helpers live in the extension isolated world and may be unavailable in the default DevTools page context;
- the automated fixtures do not cover the full evidence and failure-state matrix.

## Goals

1. Make every final trust verdict reproducible from explicit evidence.
2. Require stronger evidence before treating a small count gap as complete.
3. Keep DOM-only and page-network-only runs usable but visibly provisional.
4. Prevent failure recovery or candidate promotion from silently changing strict comparison truth.
5. Give the user a compact popup for execution and results plus a DevTools panel for diagnostics.
6. Keep the UI readable without clipping or horizontal overflow at narrow widths.
7. Preserve partial results and privacy-minimized session diagnostics.

## Non-goals

- Importing Instagram information-download ZIP or JSON files.
- Publishing to the Chrome Web Store.
- Adding `debugger`, broad host, or `unlimitedStorage` permissions.
- Background or scheduled scraping.
- Enabling follow or unfollow automation.
- Treating the MAIN-world page bridge as a security boundary.
- Replacing the current conservative list-container username extraction with broad recursive extraction.

## Design principles

- Evidence strength is `DevTools exact endpoint` > `page-network corroboration` > `DOM`.
- Candidate evidence never becomes strict comparison truth solely to make a count match.
- Count equality is meaningful only when the displayed count is parsed as exact.
- Network pagination exhaustion and DOM list-end observation are different signals.
- One canonical trust verdict is reused by storage, popup, panel, console, and tests.
- Expected degraded states use Korean informational output rather than extension warnings.
- The default UI shows counts and reasons, not full username lists.

## Phase A: Accuracy engine

### A1. Pure accuracy core

Add a browser-safe classic script, `accuracy-engine.js`, that exposes a frozen `globalThis.IGAccuracyEngine` namespace. `background.js` injects it before `main.js` in the same isolated world. Node fixtures load the same source through `vm`, so production decisions and tests cannot drift.

The core contains no DOM, Chrome API, timer, storage, or mutable global access. Its public operations are:

- `parseDisplayedCount(candidates)`
- `extractPaginationEvidence(payload)`
- `assessListCompletion(input)`
- `classifyEvidence(input)`
- `buildTrustVerdict(input)`
- `compareStrictSets(input)`
- `validateCompareIntegrity(input)`

`main.js` remains responsible for orchestration and browser interaction. Existing pure comparison logic moves into the core incrementally; DOM collection and message listeners stay in `main.js`.

### A2. Displayed-count parsing

`parseDisplayedCount` returns a structured result:

```js
{
  value: 1200,
  exact: false,
  source: "visible-label",
  notation: "1.2K",
  reason: "abbreviated-count"
}
```

Rules:

- Prefer an exact accessibility label, title, or sibling value when available.
- Parse grouped integers such as `1,234`, `1 234`, and localized separator equivalents as exact.
- Parse `K`, `M`, `천`, `만`, and `억` only as approximate values.
- Reject malformed or ambiguous decimal/grouping combinations instead of selecting the first integer.
- An approximate count may guide progress but may not independently produce `CONFIRMED`.
- If no safe value exists, use unknown-target stall mode.

### A3. Pagination evidence

For exact followers or following responses, `devtools.js` extracts sanitized pagination facts while the raw response is still in memory. It relays only:

```js
{
  mode: "followers",
  exactEndpoint: true,
  itemCount: 12,
  paginationRecognized: true,
  hasMore: false,
  terminal: true,
  terminalReason: "has_more_false"
}
```

Cursor values, query strings, raw URLs, response bodies, headers, and account identifiers are not relayed or stored. Recognized terminal signals include explicit false values such as `has_more: false` or `page_info.has_next_page: false`. A missing field is not treated as terminal unless the recognized response schema defines that absence as terminal and a fixture protects the decision.

Per-mode runtime state tracks:

- exact payload count;
- confirmed username count;
- whether pagination was recognized;
- whether terminal evidence was observed;
- last terminal reason and timestamp;
- navigation or disconnect after the evidence was recorded.

`chrome.devtools.network.getHAR(callback)` may be processed once during DevTools initialization to reduce the initialization race. Live `onRequestFinished` events remain authoritative and deduplicate HAR entries. Opening DevTools late still requires the existing reload/reopen guidance.

### A4. Completion matrix

A list receives one of these canonical completion states:

- `CONFIRMED_EXACT_COUNT`: an exact displayed count equals confirmed DevTools usernames.
- `CONFIRMED_NETWORK_END`: DevTools pagination is explicitly terminal, DOM list end is observed, the small gap is within tolerance, and no non-DOM candidate explains additional unresolved data.
- `ASSISTED_COMPLETE`: useful page-network or bounded DOM evidence exists, but DevTools confirmation is insufficient.
- `PARTIAL`: collection stopped before a safe completion condition.
- `RETRY_REQUIRED`: DevTools was connected but exact list payloads were not captured, or integrity failed.

The small-gap path may return `CONFIRMED_NETWORK_END` only when both network terminal evidence and DOM end are present. The current condition of “any network evidence plus DOM end” is removed.

### A5. Candidate and fallback policy

The engine keeps separate sets:

- `confirmedUsers`: exact DevTools evidence only;
- `assistedUsers`: bounded page-network or DOM fallback evidence;
- `candidateUsers`: unresolved evidence;
- `strictCompareUsers`: users allowed into the final strict comparison.

DOM fallback never mutates `confirmedUsers`. It can fill `assistedUsers` only when all of the following hold:

- the displayed count is exact;
- a confirmed network set exists but is short;
- the run did not terminate due to `rate_limited`, `time_cap_reached`, `profile_changed`, `scroll_box_detached`, `modal_closed`, or `run_superseded`;
- the candidate came from the correctly identified modal and has repeat DOM evidence;
- the promotion is bounded by the exact missing-count gap.

Strict final differences use `strictCompareUsers`. Assisted-only users are reported separately and do not inflate `mutualCount`. The panel may show an assisted comparison preview, but it is labeled and never replaces the strict result.

### A6. Page-network bridge hardening

Each run creates a random capability value in the isolated world and binds accepted messages to the active `runId` and profile. The capability is passed to the MAIN-world installer through the narrow enable handshake and retained in closure state rather than a public `window.__...` property.

The listener rejects and counts messages with mismatched run, profile, schema, or capability. Rejection details store only reason and count.

This reduces accidental and cross-run contamination but does not make page-network messages equivalent to DevTools evidence. Page-network-only collection can produce `ASSISTED_COMPLETE` at most. With DevTools closed, the chosen behavior remains: continue DOM collection and show `참고용 결과`.

### A7. Canonical trust verdict

`buildTrustVerdict` returns one immutable result:

```js
{
  code: "CONFIRMED",
  labelKo: "확정 비교 가능",
  severity: "success",
  reasons: ["followers_exact", "following_exact", "integrity_passed"],
  recommendedActionKo: "없음"
}
```

Supported top-level codes are:

- `CONFIRMED`
- `REFERENCE_ONLY`
- `PARTIAL`
- `RETRY_REQUIRED`

The decision card, `__igFollowerDebug`, stored snapshot, popup, and DevTools panel render this same object. They do not recalculate reliability independently.

### A8. Privacy minimization

- Replace relayed raw request URLs with a fixed safe endpoint label and mode.
- Continue discarding response bodies immediately after username and pagination extraction.
- Keep raw payloads, cookies, headers, query parameters, DM data, and unresolved row text out of storage.
- Record `estimatedBytes` separately from `actualBytesInUse` when the Chrome storage API can provide the latter.
- Full usernames appear only in explicit account or full-list diagnostics, not routine progress logs or UI cards.

## Phase C: Hybrid UI

### C1. Popup responsibilities

Add `popup.html`, `popup.css`, and `popup.js`, and configure `action.default_popup`. The background action-click injection path is replaced by an explicit `IG_START_COLLECTION` message from the popup.

The popup shows:

- the current Instagram profile readiness;
- DevTools connection and expected confidence level;
- one primary `비교 시작` or `비교 다시 실행` action;
- running stage and compact progress counts;
- the canonical final verdict;
- followers, following, mutual, strict difference, and candidate counts;
- `DevTools에서 상세 진단` 안내;
- an always-visible local-data notice.

The notice states that username, counts, timestamps, evidence labels, and diagnostics are stored in the browser session, while cookies, authentication headers, raw response bodies, and DMs are not stored. Because distribution is local-only, there is no consent checkbox or first-run gate.

Chrome does not let the popup open DevTools or activate a particular DevTools panel. The popup therefore shows a short instruction to open DevTools and select `IG Comparator`; it never claims to open the panel automatically.

### C2. DevTools panel responsibilities

The existing DevTools bootstrap continues network capture and creates an `IG Comparator` panel. The panel reads sanitized progress and result snapshots and displays:

- canonical trust verdict and compare integrity;
- per-list expected, confirmed, assisted, and candidate counts;
- pagination recognition and terminal status;
- DOM end reason and recovery attempts;
- DevTools, page-network, and DOM evidence totals;
- rate-limit, navigation, disconnect, and profile-change events;
- bounded timeline and warnings;
- explicit account diagnosis and full-list output only after a deliberate user action;
- a privacy-safe diagnostic-copy action that excludes usernames and profile identifiers.

The default panel does not print raw URLs, raw payloads, full username lists, or DOM row text.

### C3. Progress transport

`main.js` sends sanitized `IG_RUN_PROGRESS` messages at stage changes and at a throttled interval during scrolling. `background.js` stores the latest compact progress record in `chrome.storage.session`. Popup and panel listen through `chrome.storage.onChanged` and perform an initial read when opened.

Progress contains only:

- run ID and profile label;
- stage and status;
- expected, confirmed, assisted, and candidate counts;
- source readiness and pagination booleans;
- canonical verdict when available;
- timestamps and privacy-safe reason codes.

The throttle target is no more than one progress write per 750 milliseconds, with immediate writes for stage transitions and terminal states.

### C4. UI states

Both surfaces handle these states explicitly:

- no Instagram tab selected;
- ready with DevTools;
- ready without DevTools;
- collecting followers;
- collecting following;
- confirmed completion;
- reference-only completion;
- partial completion;
- retry required;
- superseded run;
- storage or runtime error.

Expected degraded states use neutral or informational styling. Only actual failures use error styling.

### C5. Responsive and accessibility requirements

- Popup must remain usable from 320 to 420 CSS pixels without horizontal scrolling.
- DevTools panel must remain usable from 320 to 1024 CSS pixels.
- Metric cards collapse from three columns to one when needed.
- Diagnostic rows collapse to stacked labels and values on narrow widths.
- Korean warnings wrap without clipping, ellipsis is limited to nonessential single-line labels, and numeric values use tabular figures.
- Buttons remain visibly labeled and keyboard accessible.
- Dynamic progress uses `aria-live="polite"`; real failures use `role="alert"`.
- Light and dark Chrome appearances preserve readable contrast.
- No layout depends on viewport height or internal nested scrolling.

## Error handling

- Popup start validates the active tab hostname before injection.
- Re-entry supersedes the prior run using the existing run ID mechanism and surfaces the event in both UIs.
- Profile navigation persists the partial result under the starting profile and marks the run partial.
- DevTools navigation invalidates pagination freshness and requires new exact payload evidence.
- A disconnected DevTools port cannot remain fresh through stored state alone.
- Storage quota failure retries once with the existing minimal snapshot and reports a privacy-safe error state.
- UI failure cannot interrupt collection; collection failure cannot leave the UI in a permanent running state.

## Testing strategy

### Deterministic unit fixtures

Add fixtures for:

- exact and abbreviated count parsing, including malformed inputs;
- exact endpoint pagination terminal and nonterminal variants;
- small gaps with and without network terminal evidence;
- DOM end without DevTools evidence;
- page-network run/profile/capability mismatch;
- unsafe end reasons blocking assisted promotion;
- assisted mutual users remaining outside strict `mutualCount`;
- canonical verdict consistency across all renderers;
- storage sanitization, truncation, quota fallback, and actual-byte diagnostics;
- raw URL query removal.

The existing AE-001 through AE-008 matrix becomes executable rather than documentation-only.

### Integration and e2e

- Fix scenario cleanup with `try/finally` and select fixture tabs by explicit identity rather than `tabs[0]`.
- Remove the unconditional `|| true` from the 429 scenario and test the backoff state machine with a fake clock rather than real multi-minute waits.
- Exercise the existing virtual-recycle fixture.
- Add profile-change, DevTools navigation/disconnect, post-run payload freeze, and page-network passive-noise scenarios.
- Keep deployment permissions unchanged; localhost permissions remain confined to the copied test extension.

### Visual QA

For the popup, verify 320, 360, and 420 pixel widths. For the panel, verify 320, 736, and 1024 pixel widths. Each width is checked in light and dark appearance with:

- long Korean warnings;
- large five- and seven-digit counts;
- all UI states from C4;
- no horizontal overflow;
- no overlapping or clipped controls;
- readable focus order and status announcements.

Automated layout assertions check `scrollWidth <= clientWidth` and bounding-box overlap. A real unpacked-extension pass verifies the popup and DevTools panel after extension reload.

## Validation commands

The repository gains one default validation entry point:

```bash
npm test
```

It runs syntax checks for all runtime scripts plus deterministic fixtures. The optional browser gate remains:

```bash
npm run e2e
```

Before completion, also run:

```bash
git diff --check
```

Manual Chrome validation must confirm a DevTools-assisted pass, a DevTools-closed DOM reference pass, post-run payload freeze, and responsive popup/panel layouts.

## Implementation sequence

1. Introduce the pure accuracy core and deterministic fixtures.
2. Add safe count parsing and pagination evidence extraction.
3. Replace small-gap completion, fallback, compare, and trust decisions with the core.
4. Bind page-network messages to run/profile and minimize relayed URL data.
5. Add `npm test`, repair the e2e harness, and execute AE-001 through AE-008.
6. Add sanitized progress storage and background messages.
7. Add the popup and move collection start to its explicit button.
8. Add the DevTools diagnostics panel.
9. Run responsive visual QA and real Chrome validation.
10. Align backlog, handoff, project profile, and operator instructions with the verified behavior.

## Acceptance criteria

- The real 283/283 DevTools-assisted shape remains a strict confirmed result when reproduced.
- A small displayed-count gap cannot be confirmed without explicit DevTools pagination terminal evidence plus DOM list-end evidence.
- `1.2K` and `1.2만` never become target count `1`.
- A 429, time cap, profile change, detached scroll box, closed modal, or superseded run cannot promote DOM candidates into strict comparison truth.
- Page-network-only and DOM-only runs remain usable and are labeled `참고용 결과`.
- Popup, panel, console, and stored result expose the same canonical trust code and reasons.
- Raw query strings and response bodies do not cross the DevTools-to-background relay.
- Routine UI and logs do not expose full username lists.
- `npm test`, optional e2e where the local browser dependency is installed, and `git diff --check` pass.
- Popup and panel pass the defined narrow-width, long-Korean-text, large-count, light, and dark layout checks.
- Existing minimal extension permissions and follow-disabled behavior remain unchanged.
