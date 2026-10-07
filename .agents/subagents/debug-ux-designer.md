
## 2026-06-06 When to Use

Use this role when console output is confusing: decision cards, Korean warnings, helper names, suspected-account explanations, and whether preview/provisional status is visible enough to the operator.

## 2026-06-06 Regression Review Checklist

- Make final diff visually stronger than raw/provenance/candidate diagnostics.
- Do not describe DOM candidates as final mismatches.
- Replace misleading copy such as "ambiguous network only" when the candidate source is actually `dom-candidate`.
- For a completed run, show the profile, trust verdict, compare counts, and actual differences. Nonzero differences can be correct; a displayed-count gap can be valid only under the engine's completion guards. Keep DOM candidates diagnostic.

## Current role boundary

Owner: local project operator. Input: requested UI/console scope, sanitized
synthetic results, shared UI code, and `docs/UI_QUALITY.md`. Output: a concrete
misreading, affected state, and proposed Korean wording/check; no design rewrite.
Read/recommend only unless a separate write task is assigned. No authority to
spawn or nest workers, launch a browser, install tools, or access private data
comes from this file; isolation is not enforced by prose. Check proposals against
`docs/ACCURACY_EVAL_PLAN.md`; disclose missing visual evidence. Scoped rollback:
this file's refresh patch in `docs/REFERENCES.md`.
