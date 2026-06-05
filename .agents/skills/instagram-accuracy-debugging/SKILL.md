---
name: instagram-accuracy-debugging
description: Use for the Instagram follower/following comparator when accuracy, false positives, false negatives, DevTools capture, page-network evidence, DOM scroll diagnostics, or Korean debug output are involved.
---

# Instagram Accuracy Debugging

Use this skill for `/Users/shwoo/mydir/Instagram`, a Chrome MV3 extension that compares Instagram followers and following.

## Goal

- Prefer correctness and explainability over UI polish.
- Preserve partial results when collection is incomplete.
- Never hide uncertainty. Print Korean warnings and reliability status.
- Keep raw private data out of storage.

## Safety Rules

- Do not store raw API payloads, cookies, auth headers, private messages, or full request headers.
- Store only derived usernames, counts, timestamps, sanitized source labels, confidence, and diagnostics.
- Treat Instagram DOM and network payload shape as unstable.
- Keep DevTools Network capture optional. The collector must still run without DevTools.

## Accuracy Model

Use this evidence order:

1. DevTools exact followers/following endpoint evidence.
2. Page network exact followers/following endpoint evidence.
3. DOM row evidence from a clearly identified followers/following modal.
4. Candidate-only network evidence from active/ambiguous mode.

Final diff should use confirmed users only. Candidate users belong in a separate warning/debug section.

## Debugging Workflow

When a result looks wrong:

1. Check the final decision card first.
2. Check `window.__igFollowerDebug()`.
3. For a specific account, use `window.__igFollowerExplainUser("username")`.
4. Check full lists only on demand with `window.__igFollowerPrintFullList("followers")` or `window.__igFollowerPrintFullList("following")`.
5. If counts mismatch, inspect scroll end reasons and timeline before changing selectors.

## Implementation Preferences

- Add compare integrity checks for derived counts such as `mutualCount`.
- Keep console output short by default; use helpers for deep debugging.
- Keep page-network bridge narrow and quiet with early URL filtering.
- Prefer semantic DOM signals over brittle class names.
- Keep user-facing output Korean.


## 2026-06-06 Runtime Policy Addendum

- Begin every accuracy investigation with preflight status: DevTools bridge, page-network bridge, DOM counts, expected counts, and final compare policy.
- Status priority is `DEVTOOLS_ASSISTED` > `PAGE_NETWORK_ASSISTED` > `DOM_PREVIEW`.
- `PAGE_NETWORK_ASSISTED` may be auto-enabled when DevTools is not connected. Treat it as useful evidence, but not identical to DevTools Network capture.
- `DOM_PREVIEW` means there was no confirmed DevTools or page-network payload. Do not present those results as final high-confidence truth.
- For final diff, use confirmed compare sets. If raw DOM exceeds expected UI counts, keep low-confidence DOM-only users in `excludedFromCompare` and explain them with `window.__igFollowerExplainUser("username")`.

## 2026-06-06 Regression Guardrails

- Never solve false positives by hard-coding usernames. `haeunieii` and `zerowonil` were examples of DOM-only candidates, not special-case accounts.
- If confirmed DevTools/page-network evidence exists for a mode, new DOM-only usernames are `dom-candidate` by default.
- Promote DOM candidates only when the confirmed set is below the expected UI count, and only up to the missing count gap.
- Do not reset a collection set after DevTools/page-network payloads may have populated it.
- Treat raw counts, provenance counts, and candidates as diagnostics. Final diff truth comes from compare counts and integrity status.
- Use `console.log` for expected degraded states. Avoid `console.warn` when the message would create Chrome extension error-panel noise without a real runtime failure.
