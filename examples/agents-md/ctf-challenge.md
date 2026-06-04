# AGENTS.md example: CTF challenge

## Project goal

Build a reproducible CTF or lab challenge for authorized training and testing.

## Success criteria

- Challenge builds from a clean checkout.
- Intended solve path is documented privately or in challenge notes.
- Solve script or manual validation succeeds.
- Negative controls show unintended shortcuts are not obvious.

## Working rules

- Keep the work legal, authorized, and lab-contained.
- Do not target real services or third-party infrastructure.
- Keep challenge artifacts reproducible.
- Do not store real flags, credentials, or secrets in public templates.

## Reuse-first policy

Run the reuse-first recipe before adding:

- challenge framework
- parser or file format tooling
- sandbox/container tooling
- deployment wrapper
- exploit-development helper library

## Validation

- Primary validation command: build command or `<fill in>`
- Solve validation: solve script or `<fill in>`
- Negative controls: document at least one unintended path checked.

## Handoff

Update `docs/HANDOFF.md` with build status, solve status, known shortcuts,
unsafe assumptions, and next action.

## References

- Record frameworks, libraries, and copied challenge assets in `docs/REFERENCES.md`.
- Official links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Security notes

- Avoid real-service exploitation.
- Do not include weaponized material outside the authorized lab scope.
- Redact flags and private solution notes from public artifacts.

