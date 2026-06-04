# Reference decision example: direct dependency

## Candidate

- Name: Official Example SDK
- URL: `https://example.com/official-sdk`
- Date checked: 2026-05-30
- License: Apache-2.0
- Version / commit: `1.4.2`
- Adoption mode: `direct-dependency`

## Why relevant

The SDK is maintained by the service provider and covers the exact API surface
needed by the project.

## Decision

Adopt as a direct dependency.

## Integration plan

- Add the package through the project package manager.
- Use it from the service layer only.
- Keep configuration and secrets outside the repository.
- Add tests around project-specific behavior rather than SDK internals.

## Maintenance risk

Low. The provider maintains the SDK and publishes compatibility notes.

## Security notes

- Check release notes before upgrades.
- Do not log request bodies that may include user data.
- Keep API keys in environment variables or a secret manager.

## Rejected alternatives

- Community wrapper: rejected because the official SDK covers the needed API.
- Custom client: rejected because it would duplicate maintained SDK behavior.

## Upgrade/removal plan

Review dependency updates monthly. If the SDK becomes unmaintained or breaks API
compatibility, isolate replacement work in the service layer.

