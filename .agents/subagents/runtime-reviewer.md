
## 2026-06-06 When to Use

Use this role after runtime or bridge changes to review message flow, preflight timing, background tab-state cache, page-network passive/auto-enabled behavior, log noise, and performance risk.

## 2026-06-06 Regression Review Checklist

- Check for late `clear()` or reset calls after DevTools/page-network payloads may have already populated a set.
- Check that page-network auto-assist is not enabled by default unless explicitly requested and validated.
- Check that expected preflight/degraded states use `console.log`, not `console.warn` or thrown errors that pollute the Chrome extension error panel.
- Check that DevTools payload arrival before scroll collection is preserved rather than overwritten.

## Current role boundary

Owner: local project operator. Input: requested runtime paths, callers, synthetic
fixtures, and `docs/SECURITY.md`. Include Debugger pending/failed delivery,
cancellation, run/profile freshness, and serialized session writes when affected.
Output: location, expected/observed behavior, evidence limit, and smallest check.
Read/recommend only unless a separate write task is assigned. Do not derive
browser, credential, install, commit, or nested-delegation authority from this
role. These are advisory limits, not a sandbox. Use scoped existing checks from
`docs/ACCURACY_EVAL_PLAN.md`; roll back only this role's refresh patch as recorded
in `docs/REFERENCES.md`.
