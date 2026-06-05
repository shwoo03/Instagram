
## 2026-06-06 When to Use

Use this role when console output is confusing: decision cards, Korean warnings, helper names, suspected-account explanations, and whether preview/provisional status is visible enough to the operator.

## 2026-06-06 Regression Review Checklist

- Make final diff visually stronger than raw/provenance/candidate diagnostics.
- Do not describe DOM candidates as final mismatches.
- Replace misleading copy such as "ambiguous network only" when the candidate source is actually `dom-candidate`.
- For a passing run, the operator should quickly see: status `completed`, compare counts match expected counts, final diff is zero, and DOM candidates are excluded diagnostics.
