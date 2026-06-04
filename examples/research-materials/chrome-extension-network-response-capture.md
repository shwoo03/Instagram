# Chrome extension network response capture

Date: 2026-06-01

This note captures research from a dogfood session about whether an existing
Chrome extension can read the same response bodies shown in Chrome DevTools
Network.

The motivating case was a browser-console collector that could miss one account
from a dynamic modal list. API response extraction would be cleaner than DOM
reconstruction if the extension can safely access the relevant JSON responses.

## Question

Can a Chrome extension access DevTools Network response bodies, especially JSON
API responses such as GraphQL or relationship/friendship payloads?

## Short answer

Yes, but not through ordinary content scripts, `webRequest`, or
`declarativeNetRequest`.

There are two official paths:

1. `chrome.devtools.network` from a DevTools extension page.
2. `chrome.debugger` as a Chrome DevTools Protocol transport.

## Option comparison

| Option | Response body access | Fit | Main constraint |
|---|---:|---|---|
| `chrome.webRequest` | No | Not suitable | Can inspect headers and some request bodies, not response bodies. |
| `declarativeNetRequest` | No | Not suitable | Designed to modify/block without exposing content. |
| Content script `fetch`/`XHR` patch | Partial | Fragile fallback | Only catches page JS calls after patching and can miss cached/framework-held references. |
| `chrome.devtools.network` | Yes | Best fit when DevTools is open | Requires `devtools_page`; only works from DevTools context. |
| `chrome.debugger` + CDP | Yes | Powerful fallback | Requires `debugger` permission, shows strong user warning, and can conflict with DevTools. |

## Recommended direction

For a local dogfood tool used while DevTools is already open, prefer
`chrome.devtools.network`.

This keeps the existing extension but adds a DevTools page that listens to
completed Network requests and calls `request.getContent()` for candidate JSON
responses.

Use `chrome.debugger` only if the workflow must work without DevTools open.

## `chrome.devtools.network` design

Add a `devtools_page` entry to the existing extension manifest.

```json
{
  "devtools_page": "devtools.html"
}
```

Add:

```text
devtools.html
devtools.js
```

Recommended flow:

1. User opens Instagram tab.
2. User opens DevTools.
3. DevTools extension page starts listening with
   `chrome.devtools.network.onRequestFinished`.
4. For each finished request, inspect the URL and resource metadata.
5. If the URL matches candidate API patterns, call `request.getContent()`.
6. Decode base64 content if needed.
7. Parse JSON.
8. Reuse the same recursive username extraction logic used by the DOM collector.
9. Store normalized usernames by mode:
   - followers
   - following
   - unknown, if URL does not make the mode clear
10. Expose results through `chrome.storage.local`, DevTools console logs, or a
    small DevTools panel.

Candidate URL patterns:

```text
graphql
friendships
followers
following
web/friendships
api/v1/friendships
```

Important limitation: if DevTools opens after the relevant requests already
finished, those requests may be missing. Reloading or reopening the modal after
DevTools is open may be necessary.

## `chrome.debugger` alternative

`chrome.debugger` can attach to the current tab and use CDP:

```text
Network.enable
Network.responseReceived
Network.loadingFinished
Network.getResponseBody
```

This can capture response bodies without DevTools open.

Use it only for explicit, user-triggered local tooling because:

- it requires the `debugger` permission,
- Chrome shows a warning that the extension is debugging the browser,
- DevTools can detach or conflict with the debugger session,
- response bodies may contain sensitive account/session-adjacent data.

## Data handling rules

- Capture only candidate JSON API responses.
- Do not store raw response bodies by default.
- Extract only normalized usernames and minimal counts.
- Keep data local.
- Make capture state visible to the user.
- Add a clear stop/reset action.
- Avoid collecting unrelated browsing traffic.

## Failure cases to handle

- DevTools opened too late; request missing.
- `request.getContent()` returns base64 content.
- Response is not JSON.
- URL does not reveal whether payload is followers or following.
- Payload shape changes.
- Duplicate usernames across paginated responses.
- DevTools closed or navigated.
- Extension context reloads.

## Source notes

- [chrome.devtools.network](https://developer.chrome.com/docs/extensions/reference/api/devtools/network):
  exposes requests shown in DevTools Network and provides `request.getContent()`
  for response body content.
- [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger):
  lets an extension attach to a tab and use allowed Chrome DevTools Protocol
  domains, including `Network`.
- [Chrome DevTools Protocol Network domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/):
  includes `Network.getResponseBody`, `Network.responseReceived`, and
  `Network.loadingFinished`.
- [chrome.webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest):
  observes and modifies request lifecycle data, but does not provide a response
  body API.
- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest):
  declaratively blocks or modifies requests without intercepting and viewing
  body content.

## Applied decision

If this project proceeds with network-based extraction, implement the DevTools
extension path first. Keep `chrome.debugger` as a documented fallback, not the
default path.

Do not build a broad network-monitoring extension. Keep the feature scoped to
user-triggered local capture for the active Instagram debugging session.
