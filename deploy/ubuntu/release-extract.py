#!/usr/bin/env python3
"""Extract a verified release into a new private directory, never extractall."""
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile

FORBIDDEN = {'storage', 'var', '.git', '.next', '.next-dev', 'node_modules', '.env', '.serena', '.mobocom', '.agents', '.claude', '.codex', '.ai', '.vscode', '.idea', '.beads', '.graphify', 'AGENTS.md', 'CLAUDE.md', '.mcp.json'}
KEEP = {'storage', 'var', '.git'}


class RecoveryError(Exception):
    pass


def extract(archive, target, version):
    target = Path(target)
    target.mkdir(mode=0o700)
    seen = set()
    total = 0
    budget = min(4 * 1024 ** 3, shutil.disk_usage(target).free * 4 // 5)
    with tarfile.open(archive, 'r:gz') as source:
        for member in source:
            name = member.name.rstrip('/')
            parts = name.split('/')
            if (not name or '\\' in name or any(p in ('', '.', '..') for p in parts)
                    or parts[0] in FORBIDDEN or any(p.startswith('.env') for p in parts)
                    or (len(parts) > 1 and parts[0] == 'public' and parts[1] in ('demo', 'uploads'))
                    or name in seen or not (member.isdir() or member.isreg())
                    or member.type == tarfile.GNUTYPE_SPARSE or member.sparse
                    or any(k.startswith('GNU.sparse') for k in member.pax_headers)):
                raise ValueError('UNSAFE_RELEASE_PATH')
            seen.add(name)
            total += member.size
            if len(seen) > 100000 or member.size < 0 or total > budget:
                raise ValueError('RELEASE_LIMIT')
            dest = target.joinpath(*parts)
            if member.isdir():
                dest.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(member) as inp, dest.open('xb') as out:
                    shutil.copyfileobj(inp, out, 1024 * 1024)
                os.chmod(dest, 0o755 if member.mode & 0o111 else 0o644)
                if dest.stat().st_size != member.size:
                    raise ValueError('TRUNCATED_RELEASE')
    if json.loads((target / 'package.json').read_text())['version'] != version or not (target / 'package-lock.json').is_file():
        raise ValueError('RELEASE_VERSION_MISMATCH')


def kept(name):
    return name in KEEP or name.startswith('.env')


def pack(source, destination):
    # Immutable git archive is the publisher input, never the server's working tree.
    with tarfile.open(source, 'r:') as inp, tarfile.open(destination, 'w:gz') as out:
        for member in inp:
            parts = member.name.rstrip('/').split('/')
            if (parts[0] in FORBIDDEN or any(p.startswith('.env') for p in parts)
                    or member.name.rstrip('/') in ('public/demo', 'public/uploads')
                    or member.name.startswith(('public/demo/', 'public/uploads/'))
                    or member.name.lower().endswith(('.pem', '.key', '.p12', '.dump', '.enc'))):
                continue
            if not (member.isdir() or member.isreg()):
                raise ValueError('RELEASE_LINKS_NOT_SUPPORTED')
            out.addfile(member, inp.extractfile(member) if member.isreg() else None)


def adopt(app, stage):
    app, stage = Path(app), Path(stage)
    before = stage / 'before'
    before.mkdir(mode=0o700)
    journal = {'old': [], 'new': [], 'runtime': [], 'createdPublic': False}
    def save():
        (stage / 'moves.json').write_text(json.dumps(journal))
    save()
    try:
        for item in sorted(app.iterdir()):
            if kept(item.name):
                continue
            item.rename(before / item.name)
            journal['old'].append(item.name)
            save()
        for item in sorted((stage / 'source').iterdir()):
            if kept(item.name):
                raise ValueError('RUNTIME_DATA_IN_RELEASE')
            item.rename(app / item.name)
            journal['new'].append(item.name)
            save()
        # Legacy public runtime assets remain at their original URLs.
        for name in ('demo', 'uploads'):
            old = before / 'public' / name
            if old.exists() or old.is_symlink():
                if not (app / 'public').exists():
                    (app / 'public').mkdir(mode=0o755)
                    journal['createdPublic'] = True
                old.rename(app / 'public' / name)
                journal['runtime'].append(name)
                save()
    except Exception:
        try:
            undo(app, stage)
        except Exception as error:
            raise RecoveryError() from error
        raise


def undo(app, stage):
    app, stage = Path(app), Path(stage)
    journal = json.loads((stage / 'moves.json').read_text())
    for name in reversed(journal.get('runtime', [])):
        (app / 'public' / name).rename(stage / 'before' / 'public' / name)
    if journal.get('createdPublic'):
        (app / 'public').rmdir()
    for name in reversed(journal['new']):
        (app / name).rename(stage / 'source' / name)
    for name in reversed(journal['old']):
        (stage / 'before' / name).rename(app / name)


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'extract':
            extract(*sys.argv[2:])
        elif sys.argv[1] == 'adopt':
            adopt(*sys.argv[2:])
        elif sys.argv[1] == 'undo':
            undo(*sys.argv[2:])
        elif sys.argv[1] == 'pack':
            pack(*sys.argv[2:])
        else:
            raise ValueError('INVALID_RELEASE_COMMAND')
    except Exception as error:
        print('[release] release file operation refused; retain staging for recovery', file=sys.stderr)
        sys.exit(2 if isinstance(error, RecoveryError) else 1)
