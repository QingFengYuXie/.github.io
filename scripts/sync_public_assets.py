#!/usr/bin/env python3
"""Synchronize hand-authored static assets into the generated docs tree."""

import argparse
import filecmp
import re
import shutil
import sys
from pathlib import Path


FILE_MAPPINGS = (
    ("static/os/index.html", "docs/index.html"),
    ("static/site-nav.css", "docs/site-nav.css"),
    ("static/site-nav.js", "docs/site-nav.js"),
    ("static/site-nav.css", "docs/dynamic/site-nav.css"),
    ("static/site-nav.js", "docs/dynamic/site-nav.js"),
    ("static/primer.css", "docs/primer.css"),
    ("static/primer.css", "docs/dynamic/primer.css"),
    ("static/favicon.svg", "docs/favicon.svg"),
    ("static/favicon.svg", "docs/dynamic/favicon.svg"),
    ("static/CNAME", "docs/CNAME"),
    ("static/CNAME", "docs/dynamic/CNAME"),
    ("static/_redirects", "docs/_redirects"),
)

TREE_MAPPINGS = (
    ("static/os", "docs/os"),
    ("static/os", "docs/dynamic/os"),
    ("static/admin", "docs/admin"),
    ("static/admin", "docs/dynamic/admin"),
)

LEGACY_OUTPUTS = (
    "docs/root-redirect.html",
    "docs/dynamic/root-redirect.html",
    "docs/dynamic/_redirects",
)

SITE_NAV_REFERENCE = re.compile(
    r"(?P<prefix>(?:https://qfyx\.top)?/site-nav\.(?P<kind>css|js)\?v=)[^'\"\s>]+"
)


def files_match(source, destination):
    return destination.is_file() and filecmp.cmp(source, destination, shallow=False)


def site_nav_versions(root):
    os_index = (root / "static/os/index.html").read_text(encoding="utf-8")
    versions = {}
    for match in SITE_NAV_REFERENCE.finditer(os_index):
        versions[match.group("kind")] = match.group(0).split("?v=", 1)[1]
    if set(versions) != {"css", "js"}:
        raise RuntimeError("Could not determine site navigation asset versions")
    return versions


def normalize_site_nav_references(content, versions):
    return SITE_NAV_REFERENCE.sub(
        lambda match: "{}{}".format(match.group("prefix"), versions[match.group("kind")]),
        content,
    )


def stale_html_references(root):
    versions = site_nav_versions(root)
    stale = []
    for html_file in sorted((root / "docs").rglob("*.html")):
        content = html_file.read_text(encoding="utf-8")
        if normalize_site_nav_references(content, versions) != content:
            stale.append(html_file)
    return stale


def sync_html_references(root):
    versions = site_nav_versions(root)
    for html_file in sorted((root / "docs").rglob("*.html")):
        content = html_file.read_text(encoding="utf-8")
        normalized = normalize_site_nav_references(content, versions)
        if normalized != content:
            html_file.write_text(normalized, encoding="utf-8")


def relative_files(directory):
    if not directory.exists():
        return set()
    return {path.relative_to(directory) for path in directory.rglob("*") if path.is_file()}


def ensure_inside(root, path):
    resolved_root = root.resolve()
    resolved_path = path.resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError as error:
        raise RuntimeError("Refusing to modify a path outside the repository: {}".format(path)) from error
    if resolved_path == resolved_root:
        raise RuntimeError("Refusing to modify the repository root")


def compare_tree(source, destination):
    problems = []
    source_files = relative_files(source)
    destination_files = relative_files(destination)
    for relative_path in sorted(source_files - destination_files):
        problems.append("missing {}".format(destination / relative_path))
    for relative_path in sorted(destination_files - source_files):
        problems.append("extra {}".format(destination / relative_path))
    for relative_path in sorted(source_files & destination_files):
        if not files_match(source / relative_path, destination / relative_path):
            problems.append("different {}".format(destination / relative_path))
    return problems


def sync_tree(root, source, destination):
    ensure_inside(root, destination)
    source_files = relative_files(source)
    destination_files = relative_files(destination)
    for relative_path in sorted(source_files):
        source_file = source / relative_path
        destination_file = destination / relative_path
        if files_match(source_file, destination_file):
            continue
        destination_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, destination_file)
    for relative_path in sorted(destination_files - source_files, reverse=True):
        extra_file = destination / relative_path
        ensure_inside(root, extra_file)
        extra_file.unlink()
    if destination.exists():
        for directory in sorted((path for path in destination.rglob("*") if path.is_dir()), reverse=True):
            if not any(directory.iterdir()):
                directory.rmdir()


def check(root):
    problems = []
    for source_name, destination_name in FILE_MAPPINGS:
        source = root / source_name
        destination = root / destination_name
        if not source.is_file():
            problems.append("missing source {}".format(source))
        elif not files_match(source, destination):
            problems.append("different {}".format(destination))
    for source_name, destination_name in TREE_MAPPINGS:
        source = root / source_name
        destination = root / destination_name
        if not source.is_dir():
            problems.append("missing source {}".format(source))
        else:
            problems.extend(compare_tree(source, destination))
    for legacy_name in LEGACY_OUTPUTS:
        legacy = root / legacy_name
        if legacy.exists():
            problems.append("obsolete {}".format(legacy))
    for html_file in stale_html_references(root):
        problems.append("stale site-nav version in {}".format(html_file))
    return problems


def sync(root):
    for source_name, destination_name in FILE_MAPPINGS:
        source = root / source_name
        destination = root / destination_name
        if not source.is_file():
            raise FileNotFoundError("Missing synchronization source: {}".format(source))
        ensure_inside(root, destination)
        if not files_match(source, destination):
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    for source_name, destination_name in TREE_MAPPINGS:
        source = root / source_name
        destination = root / destination_name
        if not source.is_dir():
            raise FileNotFoundError("Missing synchronization source: {}".format(source))
        sync_tree(root, source, destination)
    for legacy_name in LEGACY_OUTPUTS:
        legacy = root / legacy_name
        if legacy.exists():
            ensure_inside(root, legacy)
            legacy.unlink()
    sync_html_references(root)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check", action="store_true", help="report drift without changing files")
    arguments = parser.parse_args()
    root = arguments.root.resolve()

    if arguments.check:
        problems = check(root)
        if problems:
            print("Public assets are not synchronized:", file=sys.stderr)
            for problem in problems:
                print(" - {}".format(problem), file=sys.stderr)
            return 1
        print("Public assets are synchronized.")
        return 0

    sync(root)
    remaining = check(root)
    if remaining:
        print("Synchronization did not converge:", file=sys.stderr)
        for problem in remaining:
            print(" - {}".format(problem), file=sys.stderr)
        return 1
    print("Public assets synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
