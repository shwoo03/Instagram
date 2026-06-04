# Unsafe plugin patterns

Avoid:

- Plugin with unclear license.
- Plugin that installs broad shell hooks.
- Plugin that enables MCP write tools by default.
- Plugin with binaries but no provenance.
- Plugin that writes global config without rollback.
- Plugin that bundles hidden background jobs.
- Plugin that duplicates existing project hooks.
- Plugin adopted because it is popular, not because it fits.
- Plugin that turns the starter kit into a runtime.

