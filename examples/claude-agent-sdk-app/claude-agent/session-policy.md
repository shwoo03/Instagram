# Session policy

## When sessions persist

- Persist only when continuity is required.
- Prefer short-lived sessions for one-off tasks.

## What can be stored

- Task state.
- Non-secret configuration.
- Links to project docs.
- Validation summaries.

## What must not be stored

- Secrets.
- Private tokens.
- Credentials.
- Unredacted sensitive user data.
- Irrelevant scratch notes.

## Handoff expectations

Record durable state in project handoff docs, not only in SDK session state.

