
## 2026-06-06 When to Use

Use this role when deciding or changing confidence policy: `DEVTOOLS_ASSISTED`, `PAGE_NETWORK_ASSISTED`, `DOM_PREVIEW`, overcount exclusions, integrity checks, or final compare semantics.

## 2026-06-06 Regression Review Checklist

- Reject username-specific filtering. Fix source classification instead.
- Verify final compare uses confirmed network evidence first, then bounded fallback, never unconditional DOM promotion.
- Check that DOM candidates after network confirmation do not become final diff members unless needed to fill an expected-count shortfall.
- Confirm compare counts, raw counts, candidate counts, and excluded/fallback accounts are reported as separate concepts.
