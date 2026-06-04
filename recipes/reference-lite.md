# Lightweight reference recipe

Official links: see `templates/links.md`.

References are not just inspiration. Every meaningful reference should end in
one adoption mode: use directly, wrap/adapt, fork, copy with provenance,
concept-only, or reject.

Default project tracking is still `docs/REFERENCES.md` only. Heavy proposal
workflows must not be reintroduced into thin-core.

## When to use

- External docs, repositories, examples, or articles influence the project.
- You need lightweight provenance without a heavy research workflow.

## When not to use

- The reference is irrelevant to a project decision.
- The project needs formal compliance or copied-source tracking.

## Adoption levels

- `reference-only`: link used as background.
- `concept-only`: idea translated into local design.
- `direct-dependency`: package, service, or SDK used directly.
- `adapter`: wrapped behind a small local interface.
- `fork`: forked and maintained by the project.
- `vendored-source`: copied into the project with provenance.
- `rejected`: considered but not used.

## Checklist

- Record name and URL.
- Record date checked.
- Record why it was used.
- Record adoption level.
- For dependency adoption, record package, version, license, security check, and upgrade/removal plan.
- For copied source, record exact source URL, commit hash, license, files, modifications, and owner.

## Common mistakes

- Link dumps with no reason.
- Treating stars or popularity as adoption evidence.
- Copying source without license and revision.
- Turning lightweight references into a default proposal workflow.
