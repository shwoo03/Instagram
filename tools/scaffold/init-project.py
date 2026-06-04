#!/usr/bin/env python3
"""Copy starter-kit templates into a target project."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

BASE_FILES = [
    ("templates/canonical/AGENTS.md", "AGENTS.md"),
    ("templates/canonical/PROJECT_PROFILE.md", "docs/PROJECT_PROFILE.md"),
    ("templates/canonical/HANDOFF.md", "docs/HANDOFF.md"),
    ("templates/canonical/SECURITY.md", "docs/SECURITY.md"),
    ("templates/canonical/REFERENCES.md", "docs/REFERENCES.md"),
    ("templates/links.md", "docs/LINKS.md"),
]

PROFILE_FILES = {
    "solo-small-project": [],
    "team-audit-project": [],
    "agent-runtime-app": [],
    "research-heavy-project": [],
    "legacy-project-upgrade": [],
}


def profile_checklist(profile: str) -> tuple[str, str]:
    return f"profiles/{profile}.md", "docs/PROFILE_CHECKLIST.md"


def copy_file(source: Path, target: Path, *, force: bool) -> None:
    if target.exists() and not force:
        print(f"skip existing {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    print(f"wrote {target}")


def files_for_profile(profile: str) -> list[tuple[str, str]]:
    return [*BASE_FILES, profile_checklist(profile), *PROFILE_FILES[profile]]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True)
    parser.add_argument("--profile", choices=sorted(PROFILE_FILES), default="solo-small-project")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    target_root = Path(args.target).expanduser().resolve()
    target_root.mkdir(parents=True, exist_ok=True)

    for src_rel, dst_rel in files_for_profile(args.profile):
        copy_file(ROOT / src_rel, target_root / dst_rel, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
