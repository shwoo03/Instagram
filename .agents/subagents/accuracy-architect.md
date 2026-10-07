
## 2026-06-06 When to Use

Use this role when deciding or changing confidence policy: `DEVTOOLS_ASSISTED`, `PAGE_NETWORK_ASSISTED`, `DOM_PREVIEW`, overcount exclusions, integrity checks, or final compare semantics.

## 2026-06-06 Regression Review Checklist

- Reject username-specific filtering. Fix source classification instead.
- Verify strict comparison uses exact DevTools/Debugger evidence only; bounded DOM fallback belongs to assisted results.
- Check that a count shortfall never promotes DOM/page-network-only accounts into strict diff members.
- Confirm compare counts, raw counts, candidate counts, and excluded/fallback accounts are reported as separate concepts.

## Current role boundary

Owner: local project operator. Input: requested accuracy scope, current
`accuracy-engine.js`, related callers/fixtures, and canonical project docs.
Output: concrete evidence-rule mismatches, affected cases, and suggested checks.
Read/recommend only unless a separate write task is explicitly assigned. This
file does not enforce isolation or authorize spawning/nested delegation,
browser actions, installs, commits, or private data access.
Validate conclusions against `docs/ACCURACY_EVAL_PLAN.md` and safe scoped tests;
otherwise label them untested. Roll back only this role's refresh edits using
the scoped patch described in `docs/REFERENCES.md`.
