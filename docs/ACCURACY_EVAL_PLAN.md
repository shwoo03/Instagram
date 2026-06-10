# Accuracy Eval Plan

## Goal

Catch the failure classes already seen in this project without storing private Instagram payloads.

## Fixture requirements

Use sanitized synthetic usernames such as `user001`, `user002`, and `candidate001`. Do not store cookies, auth headers, raw Instagram response bodies, or real account dumps.

## Required scenarios

| ID | Scenario | Expected result |
| --- | --- | --- |
| AE-001 | DevTools exact followers/following payloads match expected counts | trust gate `확정 비교 가능`; final diff uses confirmed network sets |
| AE-002 | DOM observes two extra accounts after network confirmed count is complete | extras stay `dom-candidate`; final diff excludes them |
| AE-003 | DevTools connected but no matching payload | trust gate asks for DevTools/Instagram reload; not high-confidence |
| AE-004 | One-sided DevTools payload only | status shows partial side; final output warns which side is weaker |
| AE-005 | Recursive payload includes owner/viewer/suggestion username outside list containers | outside username is ignored or candidate-only, never final confirmed |
| AE-006 | Confirmed network is short by N and DOM has more than N candidates | fallback promotes at most N candidates and records fallback evidence |
| AE-007 | DevTools closes or tab reloads mid-run | background state becomes stale/disconnected rather than permanently connected |
| AE-008 | Page-network bridge remains passive | no unrelated `edge-chat`, `mqtt`, `direct`, upload, or logging payload becomes evidence |

## Manual checklist

1. Reload unpacked extension.
2. Reload Instagram profile tab.
3. Open DevTools before opening lists and run the extension.
4. Repeat with DevTools opened late; expect `connected/no payload` or reload guidance.
5. Repeat with DevTools closed; expect DOM preview or manual page-network guidance.
6. Inspect one suspicious account with `__igFollowerExplainUser("username")` before changing code.
7. Check final compare counts before raw/provenance/candidate diagnostics.

## Regression trigger

Add or update fixtures when any of these happen:

- A candidate appears in final diff without confirmed or bounded-fallback evidence.
- A username-specific exception is proposed.
- DevTools state says connected after close/reload without fresh status.
- DOM count equals expected but evidence composition changed.
- A broad network response adds unrelated usernames.
