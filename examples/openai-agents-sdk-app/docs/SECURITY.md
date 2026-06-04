# Security notes

## Tool permissions

- Start with the smallest tool allowlist.
- Require approval for destructive or external side effects.
- Document filesystem, network, account, and data boundaries.

## Secrets

- Store secrets in environment variables, CI secrets, or a secret manager.
- Document secret names only.
- Do not commit local `.env` files.

## Data handling

- Treat user input, tool output, and external content as untrusted.
- Redact private data from traces, logs, handoffs, and examples.

