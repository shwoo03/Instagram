# DOM and virtual scroll collection stability

Date: 2026-06-01

This note captures research from a dogfood session where a browser-console
collector sometimes saw `288` accounts in the UI but collected only `287`
profile links from an Instagram-style modal list.

The goal is not to document Instagram-specific scraping or private APIs. The
goal is to preserve generally useful techniques for collecting dynamic,
lazy-rendered, virtualized DOM lists more reliably.

## Problem observed

Dynamic modal lists can render only the visible window plus a small buffer. The
DOM may change after scrolling, nodes may be reused, and a snapshot taken too
early can miss one account even when the UI count is correct.

Network capture was not reliable in this scenario. Browser-console monkey
patching of `fetch` and `XMLHttpRequest` can miss requests if the app already
holds references to internal request functions, uses framework caches, or
renders from preloaded state.

## Current decision

Use DOM collection as the primary signal, but treat count mismatches as
partial-reliability results.

When the UI shows more accounts than the collector captured, still print the
diff if the user asks for it, but mark it clearly as partial. Missing following
accounts can create false positives in the list of "followers I do not follow
back".

Recommended metadata:

```js
{
  reliability: "partial",
  warnings: [
    {
      code: "following_count_mismatch",
      severity: "warning",
      message: "팔로잉 수집이 화면 표시 수보다 적어 diff 결과에 오탐이 포함될 수 있습니다.",
      affectedFields: ["followersWithoutMeFollowing", "mutualCount"]
    }
  ]
}
```

## Recommended implementation patterns

### 1. Identity-based accumulation

Collect stable identities such as profile `href` or normalized username. Do not
depend on DOM row index, current DOM count, or display name text.

Reason: virtualized lists may reuse DOM nodes. The third rendered row can
represent different accounts at different scroll positions.

### 2. Container-aware scroll

Scroll the actual modal list container, not the page window. Use small steps
with overlap, for example `container.clientHeight * 0.65`.

Reason: a large jump to the bottom can skip an intermediate render window and
cause one-off omissions.

### 3. Render stability before reading

After each scroll step:

- wait for two `requestAnimationFrame` ticks,
- wait for a short `MutationObserver` quiet window,
- then read usernames.

Reason: DOM mutations, layout, and paint do not complete synchronously with
`scrollTop` writes.

### 4. Overlap reconciliation

Keep the previous visible tail and compare it with the next visible head. If no
account overlaps, the scroll jump may have skipped a window. Back-scroll or
reduce the step size before continuing.

### 5. Compound end condition

Do not end only because the scroll position is near the bottom. End when several
signals converge:

- no new stable usernames for multiple rounds,
- scroll position is bottom-ish,
- DOM has been quiet,
- scroll height is no longer changing.

## Techniques to avoid

- Counting current DOM rows as total rows.
- Using `nth()` or row index as identity.
- Treating `MutationObserver.addedNodes` as new accounts.
- Extracting usernames from arbitrary text.
- Increasing fixed sleeps as the main strategy.
- Smooth scrolling during collection.
- Relying on `networkidle` as the only readiness signal.

## Source notes

- [Playwright auto-waiting](https://playwright.dev/docs/actionability): useful
  model for visible/stable/actionable element checks. Its stable element idea
  maps well to "wait before reading DOM".
- [MDN MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver):
  standard way to observe DOM tree changes and implement a quiet window.
- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame):
  useful for waiting until layout and paint have had a chance to catch up after
  a scroll write.
- [MDN Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API):
  useful when deciding whether a row is fully inside the scroll container before
  accepting it.
- [web.dev on react-window virtualization](https://web.dev/articles/virtualize-long-lists-react-window):
  explains why virtualized lists only render a small visible window.
- [TanStack Virtual docs](https://tanstack.com/virtual/latest/docs/api/virtualizer):
  documents overscan tradeoffs; more buffer reduces blank or missing visual
  windows at the cost of extra rendering.
- [Crawl4AI virtual scroll docs](https://docs.crawl4ai.com/advanced/virtual-scroll/):
  emphasizes container-based scrolling and fingerprint-style deduplication for
  virtual scroll pages.
- [WEFix explicit waits paper](https://arxiv.org/abs/2402.09745): frames flaky
  UI failures as missing explicit wait conditions, which applies directly to
  DOM collection races.
- [Ajax crawling with dynamic UI state changes](https://doi.org/10.1145/2109205.2109208):
  treats dynamic web apps as UI state transitions rather than one static page.

## Promotion rule

Keep this as a research example unless the same failure repeats across multiple
dogfood reports. If repeated, promote the stable parts into a recipe or scaffold
example, not into default automation.
