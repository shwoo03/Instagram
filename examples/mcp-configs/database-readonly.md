# MCP server config example: database readonly

## Purpose

Allow an agent to inspect non-production database data or approved reporting
views without mutating state.

## Connection boundary

- Environment: development, staging, reporting replica, or `<fill in>`
- Account: read-only database role
- Network source: approved host only

## Allowed queries

- `SELECT` against approved schemas or views.
- Metadata inspection for approved schemas.
- Row limits required for exploratory queries.

## Disallowed queries

- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`.
- Stored procedure execution unless explicitly reviewed.
- Access to production primary databases unless separately approved.

## PII/data handling

- Prefer anonymized or aggregated views.
- Do not paste private records into handoffs, issues, or prompts.
- Redact identifiers unless needed for an approved debugging task.

## Secrets

- Store credentials outside the repository.
- Document secret names only, never values.

## Audit notes

- Log query user, timestamp, target database, and query purpose when available.
- Review query volume and failed access attempts.

## Review date

- `<date>`

