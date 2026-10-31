#!/usr/bin/env python3
"""Host restore file operations, always run as the service user, never root.

Only regular files/directories below storage are accepted. No extractall, links,
devices, traversal or sparse files. The live config/backups/update remain local.
The existing storage root (and its update lock inode) is never replaced.
"""
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile

KEEP = {'config', 'backups', 'update', 'clean-cache'}


def extract(archive, stage):
    target = stage / 'incoming'
    target.mkdir(mode=0o700)
    seen = set()
    total = 0
    budget = shutil.disk_usage(stage).free * 4 // 5
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            name = member.name.rstrip('/')
            parts = name.split('/')
            if (not name or '\\' in name or any(p in ('', '.', '..') for p in parts)
                    or parts[0] != 'storage' or name in seen
                    or not (member.isdir() or member.isreg()) or member.sparse
                    or member.type == tarfile.GNUTYPE_SPARSE
                    or any(key.startswith('GNU.sparse') for key in member.pax_headers)):
                raise ValueError('UNSAFE_ARCHIVE_ENTRY')
            if len(seen) >= 500000:
                raise ValueError('ARCHIVE_ENTRY_LIMIT')
            seen.add(name)
            total += member.size
            if member.size < 0 or total > budget:
                raise ValueError('ARCHIVE_DISK_LIMIT')
            out = target.joinpath(*PurePosixPath(name).parts)
            if member.isdir():
                out.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                out.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with source.extractfile(member) as inp, out.open('xb') as dest:
                    shutil.copyfileobj(inp, dest, 1024 * 1024)
                os.chmod(out, 0o600)
                if out.stat().st_size != member.size:
                    raise ValueError('TRUNCATED_ARCHIVE')
    if not (target / 'storage').is_dir():
        raise ValueError('STORAGE_REQUIRED')


def undo(storage, stage):
    journal = json.loads((stage / 'moves.json').read_text())
    for name in reversed(journal['new']):
        current = storage / name
        # Do not overwrite anything created after the adoption; keep it in staging.
        if current.exists() or current.is_symlink():
            current.rename(stage / 'incoming' / 'storage' / name)
    for name in reversed(journal['old']):
        (stage / 'before' / name).rename(storage / name)


def adopt(storage, stage):
    if storage.is_symlink() or not storage.is_dir():
        raise ValueError('REAL_STORAGE_REQUIRED')
    before = stage / 'before'
    before.mkdir(mode=0o700)
    journal = {'old': [], 'new': []}
    def save():
        (stage / 'moves.json').write_text(json.dumps(journal))
    save()
    try:
        for item in sorted(storage.iterdir()):
            if item.name in KEEP:
                continue
            item.rename(before / item.name)
            journal['old'].append(item.name)
            save()
        for item in sorted((stage / 'incoming' / 'storage').iterdir()):
            if item.name in KEEP:
                continue
            item.rename(storage / item.name)
            journal['new'].append(item.name)
            save()
    except Exception:
        try:
            undo(storage, stage)
        except Exception:
            print('[restore-files] ADOPTION_RECOVERY_FAILED', file=sys.stderr)
            sys.exit(2)
        raise


def main():
    if os.geteuid() == 0:
        raise ValueError('SERVICE_USER_REQUIRED')
    command, value, staging = sys.argv[1:]
    stage = Path(staging)
    if stage.is_symlink() or not stage.is_dir() or stage.stat().st_uid != os.geteuid() or stage.stat().st_mode & 0o077:
        raise ValueError('PRIVATE_STAGING_REQUIRED')
    if command == 'extract':
        extract(value, stage)
    elif command == 'adopt':
        adopt(Path(value), stage)
    elif command == 'undo':
        undo(Path(value), stage)
    else:
        raise ValueError('INVALID_OPERATION')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never echo archive names, environment contents or connection secrets.
        print('[restore-files] ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
