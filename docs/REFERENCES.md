# References

Use this file for official docs, adoption decisions, and source provenance that
affect this Chrome extension.

## Official docs to check first

### Chrome Extensions

- URL: https://developer.chrome.com/docs/extensions/
- Use for: Manifest V3, extension permissions, service workers, messaging, and DevTools pages.
- Adoption mode: official-docs

### Chrome DevTools extension APIs

- URL: https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- Use for: `chrome.devtools.network.onRequestFinished` and `request.getContent()`.
- Adoption mode: official-docs

### Chrome extension messaging

- URL: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Use for: `chrome.runtime.sendMessage`, `chrome.runtime.connect`, Ports, and tab relays.
- Adoption mode: official-docs

## Decisions

### DevTools Network capture

- Decision: use `chrome.devtools.network` when DevTools is open.
- Why: it can read response bodies through `request.getContent()` without adding the high-risk `debugger` permission.
- Boundaries: extract usernames, discard raw bodies, relay only sanitized usernames and metadata.
- Status: adopted.

### Debugger permission

- Decision: do not add `debugger` permission by default.
- Why: it is powerful, user-visible, and unnecessary while the current workflow already asks the operator to keep DevTools open.
- Status: rejected by default; reconsider only with a specific adoption record.
