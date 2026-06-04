# Open-source reuse recipe

Official links: see `templates/links.md`.

## Purpose

Use official SDKs and high-quality open-source projects before writing custom infrastructure.

This recipe exists because coding agents often search for references but then still implement everything from scratch. For non-trivial subsystems, the expected behavior is to evaluate whether an existing project can be used directly, wrapped, forked, or safely rejected.

## When to use

Run this recipe before implementing:

- agent runtime
- SDK/client wrapper
- MCP server/client
- workflow engine
- auth/session system
- scheduler/queue
- parser/serializer
- crawler/scraper
- RAG/vector store
- observability/tracing
- security scanner
- plugin/extension system
- cache/storage abstraction
- anything likely to become long-lived infrastructure

## When not to use

Do not force this recipe for:

- tiny helper functions
- project-specific business logic
- one-off scripts
- code smaller than the dependency overhead
- cases where adding a dependency creates more risk than value

## Default decision order

Prefer:

1. Official SDK or official API
2. Mature open-source dependency
3. Thin adapter around an existing package
4. Fork
5. Vendored source
6. Custom implementation

Custom implementation is allowed, but must be justified.

## Candidate search checklist

For each candidate, inspect:

- Purpose fit
- Actual API fit
- License
- Latest release or recent commit activity
- Maintainer/org credibility
- Issue/PR activity
- Documentation quality
- Test/CI presence
- Security history
- Transitive dependency size
- Integration cost
- Removal/replacement cost
- Maintenance risk

Do not choose by GitHub stars alone.

## Adoption modes

- `reference-only`: read for background only
- `concept-only`: use the idea, not code or API
- `direct-dependency`: install and use as a package
- `adapter`: wrap the dependency behind a small project-owned interface
- `fork`: fork and maintain changes
- `vendored-source`: copy source into this repo
- `rejected`: considered but not used

## Required output before custom implementation

Before implementing from scratch, write a short adoption record in `docs/REFERENCES.md` with:

1. At least 3 candidates unless the domain is highly project-specific.
2. One selected approach.
3. Rejection reason for each rejected candidate.
4. Maintenance plan for the selected approach.
5. Fallback/removal plan if the dependency becomes unmaintained.

## Candidate card

### <candidate name>

- URL:
- Package:
- License:
- Version / commit:
- Maintainer / org:
- Fit:
- Adoption mode:
- Pros:
- Cons:
- Security concerns:
- Maintenance burden:
- Decision:

## Anti-patterns

- "I searched and used it as reference" without adoption analysis.
- Copying source without license/provenance.
- Adding a huge dependency for a tiny helper.
- Choosing mainly by stars.
- Forking when a wrapper would work.
- Building a custom agent runtime when an official SDK fits.
- Creating a private framework that future maintainers must learn.

