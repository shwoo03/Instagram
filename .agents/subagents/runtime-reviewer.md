
## 2026-06-06 When to Use

Use this role after runtime or bridge changes to review message flow, preflight timing, background tab-state cache, page-network passive/auto-enabled behavior, log noise, and performance risk.

## 2026-06-06 Regression Review Checklist

- Check for late `clear()` or reset calls after DevTools/page-network payloads may have already populated a set.
- Check that page-network auto-assist is not enabled by default unless explicitly requested and validated.
- Check that expected preflight/degraded states use `console.log`, not `console.warn` or thrown errors that pollute the Chrome extension error panel.
- Check that DevTools payload arrival before scroll collection is preserved rather than overwritten.
