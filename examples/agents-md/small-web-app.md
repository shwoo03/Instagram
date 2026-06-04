# AGENTS.md example: small web app

## Project goal

Build and maintain a small web app with a focused frontend and a simple backend.

## Success criteria

- Core user flows work locally.
- Primary validation passes.
- UI changes remain consistent with the existing design system.
- New dependencies are recorded in `docs/REFERENCES.md`.

## Working rules

- Prefer the smallest useful change.
- Keep routing, state, and API boundaries easy to inspect.
- Do not add a large framework for a tiny helper.
- Ask before changing authentication, persistence, deployment, or billing.

## Reuse-first policy

Run the reuse-first recipe before adding or rebuilding:

- auth/session handling
- validation library
- router or state management
- UI component library
- data fetching/cache layer

## Validation

- Primary validation command: `npm test` or `<fill in>`
- Secondary checks: `npm run lint` or `<fill in>`
- If validation cannot run, record the reason in `docs/HANDOFF.md`.

## Handoff

Update `docs/HANDOFF.md` with current state, validation evidence, known issues,
and the next recommended action.

## References

- Project decisions live in `docs/REFERENCES.md`.
- Official links live in `docs/LINKS.md` or the source kit's `templates/links.md`.

## Security notes

- Never commit secrets or local `.env` files.
- Confirm before adding production credentials, analytics, or tracking.
- Treat user-submitted content as untrusted.

