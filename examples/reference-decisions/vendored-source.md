# Reference decision example: vendored source

Vendoring is exceptional. Prefer direct dependency, adapter, or fork when
possible.

## Candidate

- Name: Small Format Parser
- URL: `https://example.com/small-parser`
- Date checked: 2026-05-30
- License: BSD-3-Clause
- Version / commit: `abc1234`
- Adoption mode: `vendored-source`

## Why relevant

The parser is small, stable, and no package is published for this ecosystem.

## Decision

Vendor only the required parser files.

## Copied source requirements

- Exact source URL: `https://example.com/small-parser/tree/abc1234`
- Commit hash: `abc1234`
- License: BSD-3-Clause
- Files copied: `parser.py`, `LICENSE`
- Modifications: namespace and error type changes only
- Owner: `<team or maintainer>`
- Update plan: review upstream quarterly and before each release

## Integration plan

- Keep vendored files under `third_party/small_parser/` or `<fill in>`.
- Preserve license headers.
- Document local modifications in a patch note.
- Add tests for supported formats and malformed input.

## Maintenance risk

Medium. The project owns updates and security review after copying source.

## Security notes

- Treat parser input as untrusted.
- Review upstream advisories manually because package scanners may not detect
  vendored source.

