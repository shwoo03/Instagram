# MCP server config example: GitHub readonly

## Purpose

Allow an agent to inspect repository files, issues, and pull requests without
write access.

## Allowed operations

- Read repository files.
- Search issues.
- Read pull requests and review comments.
- Read check status.

## Disallowed operations

- Push commits.
- Merge pull requests.
- Delete branches.
- Edit repository settings.
- Write, rotate, or reveal secrets.

## Auth method

- Auth method: token or app installation with read-only scopes.
- Secret names or paths: `<secret name only, no value>`

## Repository scope

- Allowed repositories: `<owner/repo list>`
- Organization-wide access: not allowed unless separately reviewed.

## Rate/abuse considerations

- Prefer targeted reads over broad crawls.
- Respect API rate limits.
- Avoid repeated polling without a clear reason.

## Consent / approval

Approval is required before increasing scopes, accessing private repositories
outside the allowlist, or enabling write operations.

## Review date

- `<date>`

