# References

Use this file to record project-specific references and adoption decisions.

Official kit links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Adoption modes

- `reference-only`: read for background only.
- `concept-only`: use the idea, not code or API.
- `direct-dependency`: install and use as a package.
- `adapter`: wrap the library/SDK behind a small interface.
- `fork`: fork and maintain changes.
- `vendored-source`: copy source into this repo.
- `rejected`: considered but not used.

## Entry template

### <name>

- URL:
- Date checked:
- License:
- Version / commit:
- Adoption mode:
- Why relevant:
- Decision:
- Integration plan:
- Maintenance risk:
- Security notes:
- Rejected alternatives:

## Copied source requirements

If `vendored-source` is used, also record:

- Exact source URL:
- Commit hash:
- License:
- Files copied:
- Modifications:
- Owner:
- Update plan:

## Rules

- Prefer `reference-only`, `concept-only`, `direct-dependency`, or `adapter`.
- Use `fork` and `vendored-source` only when necessary.
- Do not copy source unless provenance and license are recorded.
- Do not add dependencies without a maintenance/security check.

