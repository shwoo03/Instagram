# Reference decision example: adapter

## Candidate

- Name: Useful Search Client
- URL: `https://example.com/search-client`
- Date checked: 2026-05-30
- License: MIT
- Version / commit: `0.9.8`
- Adoption mode: `adapter`

## Why relevant

The package handles authentication, retries, and pagination, but its API should
not leak throughout the application.

## Decision

Adopt through a project-owned adapter.

## Project-owned adapter boundary

- Module: `app/search/client.py` or `<fill in>`
- Public methods: `search_documents(query, filters)` and `get_document(id)`
- Return types: project-owned DTOs, not package-specific objects.

## Why adapter is better than direct usage everywhere

- Keeps replacement cost low.
- Centralizes retries, rate limits, and logging.
- Prevents package-specific types from spreading into business logic.

## Test plan

- Unit test adapter mapping and error handling.
- Contract test expected search behavior with recorded fixtures or a test account.
- Mock the adapter in application-layer tests.

## Fallback plan

If the package becomes unmaintained, replace only the adapter implementation and
keep the project-owned interface stable.

## Security notes

- Store credentials outside the repository.
- Redact query payloads in logs if they may include private data.

