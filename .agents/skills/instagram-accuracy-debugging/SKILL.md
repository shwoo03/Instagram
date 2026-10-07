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

1. DevTools or run-scoped Debugger exact followers/following evidence: eligible for strict comparison.
2. Page-network exact evidence: assisted preview only.
3. DOM row evidence from an identified list: assisted preview or diagnostics only.
4. Candidate-only network evidence from active/ambiguous mode: excluded from strict comparison.

Final strict diff uses exact DevTools/Debugger users only. A matching count does
not upgrade page-network/DOM evidence. Completion also requires the safeguards
in `accuracy-engine.js`; candidate users stay in a separate warning/debug section.

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

- Begin every accuracy investigation with DevTools/Debugger payloads and pending/failure counts, page-network state, DOM counts, expected counts, run/profile freshness, and final compare policy.
- Current policy supersedes the historical auto-assist order: fresh DevTools first, otherwise run-scoped Debugger; page-network/DOM stay assisted.
- `PAGE_NETWORK_AUTO_ASSIST_ENABLED` remains false. Do not enable it just because DevTools is absent.
- Readiness and preview labels do not prove exact payload capture or completeness. Use `accuracy-engine.js` classifications before interpreting display aliases.
- For final diff, use confirmed compare sets. If raw DOM exceeds expected UI counts, keep low-confidence DOM-only users in `excludedFromCompare` and explain them with `window.__igFollowerExplainUser("username")`.

## 2026-06-06 Regression Guardrails

- Never solve false positives by hard-coding usernames. `haeunieii` and `zerowonil` were examples of DOM-only candidates, not special-case accounts.
- When exact capture exists, new DOM-only usernames remain candidates outside strict comparison.
- Any DOM fallback is bounded by `accuracy-engine.js` and stays in assisted results; it cannot fill a short strict set.
- Do not reset a collection set after DevTools/page-network payloads may have populated it.
- Treat raw counts, provenance counts, and candidates as diagnostics. Final diff truth comes from compare counts and integrity status.
- Use `console.log` for expected degraded states. Avoid `console.warn` when the message would create Chrome extension error-panel noise without a real runtime failure.

## 2026-06-07 Evidence Contract Addendum

- Do not treat every recursive `username` field as confirmed evidence. Inspect `network-payload-parser.js` for exact endpoint/member classification and require the trusted capture source for strict evidence; container names alone are not proof.
- Broad GraphQL/friendships/followers/following URL matches are candidate until response shape is explicitly recognized.
- If exact capture arrives after DOM collection, reconcile earlier assisted accounts before comparison; no DOM/page-network-only user enters strict sets. Preserve already received valid capture when switching collection stages.
- Start console interpretation from the trust gate, not raw/provenance counts.
- For repeated accuracy failures, produce four artifacts: source research in `docs/REFERENCES.md`, project notes in `docs/HANDOFF.md`, implementation/backlog status in `docs/BACKLOG.md`, and a fixture/checklist item.

## Scope and verification

Owner: local project operator. This is an existing project-local instruction
skill, not an execution grant. Keep its trigger unchanged. For review-only work,
return findings and the proposed records in chat; the artifact rule above does
not authorize writes. Live browser/account work and delegation require the
active task's authority; do not introduce tools, request generation, or follow actions.

Use [the scenario map](../../../docs/ACCURACY_EVAL_PLAN.md) and `npm test` for
synthetic validation. If capture is pending, failed, interrupted, or stale, do
not report confirmed completion. Preserve partial results and existing deferred
features. Source and scoped rollback are recorded in `docs/REFERENCES.md`.
