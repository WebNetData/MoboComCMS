#!/usr/bin/env python3
"""Verify pinned project skills; optionally sync Codex/Claude copies with backups."""
import argparse
import hashlib
import json
import pathlib
import re
import shutil
import sys
from datetime import datetime, timezone

SOURCE = pathlib.Path(__file__).resolve().parent.parent

def digest(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=pathlib.Path, default=SOURCE, help='Project to verify or synchronize')
    parser.add_argument('--sync', action='store_true', help='Copy only pinned skill files, backing up differences')
    args = parser.parse_args()
    target = args.project.resolve()
    if not (target / 'AGENTS.md').is_file():
        raise ValueError('Target must be an existing project with AGENTS.md')
    manifest = json.loads((SOURCE / 'tools/devstack/external-skills.lock.json').read_text(encoding='utf-8'))
    backup = target / '.mobocom/skill-backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    checked = changed = 0
    for skill in manifest['skills']:
        name = skill['name']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name):
            raise ValueError('Invalid skill name')
        canonical = SOURCE / '.agents/skills' / name
        text = (canonical / 'SKILL.md').read_text(encoding='utf-8')
        if not re.match(r'^---\n', text) or text.count('<!-- mobocom-external-skill:start -->') != 1:
            raise ValueError('Missing skill metadata/context: ' + name)
        for relative, expected in skill['files'].items():
            path = pathlib.PurePosixPath(relative)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Unsafe manifest path')
            source = canonical.joinpath(*path.parts)
            if source.is_symlink() or not source.is_file() or digest(source.read_bytes()) != expected:
                raise ValueError('Canonical skill integrity mismatch: ' + name + '/' + relative)
            for scope in ('.agents/skills', '.claude/skills'):
                dest = target / scope / name / path
                # Reject links before copying; never follow a redirected destination.
                if not dest.resolve().is_relative_to(target) or any(p.is_symlink() for p in [dest, *dest.parents] if p != target.parent):
                    raise ValueError('Linked installation target: ' + str(dest))
                same = dest.is_file() and digest(dest.read_bytes()) == expected
                if not same and args.sync:
                    if dest.exists():
                        saved = backup / scope / name / path
                        saved.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(dest, saved)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, dest)
                    changed += 1
                    same = digest(dest.read_bytes()) == expected
                if not same:
                    raise ValueError('Missing/drifted skill; run --sync: ' + str(dest))
                checked += 1
    print(json.dumps({'skills': len(manifest['skills']), 'verifiedFiles': checked, 'copiedFiles': changed,
                      'backup': str(backup) if changed and backup.exists() else None}))

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
