# Account Name Lists UI Design

## Objective

Show the account names behind relationship mismatches in both the action popup and the DevTools `IG Comparator` panel without weakening the existing evidence and trust model.

## Approved Interaction

- Add a dedicated `계정 상세` section below the numeric comparison summary.
- Provide three collapsed disclosures in this order:
  1. `나만 팔로우 · N명`
  2. `나를 팔로우 · N명`
  3. `검토 후보 · N명`
- All disclosures are collapsed by default.
- Opening a non-empty disclosure renders the first 20 usernames.
- `20명 더 보기` appends the next 20 until the list is exhausted.
- A username opens `https://www.instagram.com/<username>/` in a new tab.
- Empty disclosures show `없음` and cannot be expanded.
- The candidate disclosure keeps `팔로워 후보` and `팔로잉 후보` as separate subgroups.

The popup and DevTools panel use the same labels, ordering, pagination behavior, and link behavior. The panel may use two columns at wider widths; the popup remains a single column.

## Evidence Semantics

The UI must render the same relationship set that produced the visible counters.

- `CONFIRMED`: show strict-network `followersWithoutMeFollowing` and `iFollowButNotReturned` arrays.
- `REFERENCE_ONLY`: show the assisted-preview relationship arrays and keep the visible `참고용` trust label.
- `PARTIAL` or `RETRY_REQUIRED`: show only the bounded relationship arrays present in the preserved partial result and retain the warning/trust treatment.
- Candidate usernames never enter either relationship mismatch list.
- Candidate usernames appear only under the separate candidate disclosure and remain divided by source list.

`무결성 확인` continues to describe partition consistency and evidence completion. It does not mean the two relationship lists have the same size.

## Data Contract

Extend the per-tab `IG_RUN_PROGRESS` record with a bounded `accounts` object:

```js
{
  relationshipSet: "strict" | "assisted" | "partial",
  iFollowButNotReturned: string[],
  followersWithoutMeFollowing: string[],
  followersCandidates: string[],
  followingCandidates: string[],
  truncated: {
    iFollowButNotReturned: boolean,
    followersWithoutMeFollowing: boolean,
    followersCandidates: boolean,
    followingCandidates: boolean
  }
}
```

Rules:

- Normalize usernames to lowercase and accept only `^[a-zA-Z0-9._]{1,30}$`.
- Deduplicate and sort every list before storage.
- Cap each list at 1,000 usernames.
- Set the corresponding `truncated` flag if the source list exceeds the cap.
- Store no profile URLs; construct the fixed Instagram profile URL in the UI after validation.
- Do not add raw bodies, query strings, cookies, headers, tokens, or message contents to progress or snapshot storage.

The count cards remain authoritative for the complete numeric totals. If a username list is truncated, the disclosure states that only the first 1,000 names are available in the session UI.

## Components

### Runtime progress builder

`main.js` selects the strict, assisted, or partial relationship set that already drives the visible counts and emits bounded username arrays plus candidate arrays.

### Background sanitizer

`background.js` validates, normalizes, deduplicates, sorts, caps, and records truncation for all four arrays before writing to `chrome.storage.session`. Messages from the page are not trusted directly.

### Shared UI behavior

`popup.js` and `devtools-panel.js` each use a small local renderer with the same contract:

- normalize the sanitized `accounts` object;
- create DOM nodes with `textContent`, never username HTML;
- create fixed-origin Instagram links with `target="_blank"` and `rel="noopener noreferrer"`;
- track visible counts per disclosure in ephemeral UI state;
- reveal 20 more items per activation;
- reset visible counts to 20 when the extension page is reopened or receives a new run record.

No new runtime permission is required.

## Layout and Accessibility

- Use native `<details>` and `<summary>` semantics where they fit the existing styles.
- Make the entire summary row keyboard-operable.
- Expose the list count in visible text, not color alone.
- Keep confirmed relationship links visually distinct from candidate links.
- Preserve the existing trust badge and warnings above the account details.
- Do not render account details while a run has no result arrays.
- Keep the popup free of horizontal scrolling at 320px.
- Allow the DevTools panel to switch its opened username grid to two columns only when enough width is available.

## Error and Edge Handling

- Invalid usernames are omitted rather than rendered as broken or unsafe links.
- A missing `accounts` object is backward-compatible: counters render normally and the details section stays hidden.
- Empty arrays render `없음` without an active disclosure.
- A truncated array renders a bounded-data notice.
- Storage failure follows the current progress-storage error path and must not abort collection.
- Reference and partial lists retain their trust labels; the presence of clickable usernames must not imply confirmation.

## Validation

Deterministic checks must cover:

- background username normalization, deduplication, sorting, cap, and truncation;
- confirmed strict arrays versus assisted reference arrays;
- candidates excluded from relationship lists and separated by followers/following;
- default collapsed state;
- 20-at-a-time reveal behavior;
- empty and truncated states;
- safe fixed-origin profile links;
- missing-data backward compatibility;
- popup and panel syntax plus existing accuracy/controller/parser fixtures;
- all existing E2E collection scenarios;
- rendered popup widths 320/360/420 and panel widths 320/736/1024 with no horizontal overflow.

Real Chrome validation must confirm that the popup and panel show the same names and counts after an actual Instagram comparison. Synthetic fixtures do not prove live Instagram correctness.

## Scope Boundaries

Included:

- relationship mismatch names in popup and panel;
- follower/following candidate names in a separate disclosure;
- fixed Instagram profile links;
- bounded session progress storage and responsive UI.

Excluded:

- follow/unfollow buttons;
- bulk actions or exports;
- search, filtering, sorting controls, avatars, biographies, or remote profile enrichment;
- storage of raw Instagram responses or authentication material;
- changes to evidence classification or comparison algorithms.
