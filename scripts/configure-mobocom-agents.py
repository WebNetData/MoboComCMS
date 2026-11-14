"""Install repository-scoped agent defaults without replacing local MCP/permissions.

Python 3.11+ uses tomllib; older Python may use tomli (or pip's bundled tomli).
No model calls, dependency installs, global configuration writes or networking.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        from pip._vendor import tomli as tomllib

SOURCE = Path(__file__).resolve().parents[1]
TOP = ('model', 'model_reasoning_effort', 'plan_mode_reasoning_effort',
       'tool_output_token_limit', 'web_search')
AGENTS = ('enabled', 'max_concurrent_threads_per_session', 'default_subagent_model',
          'default_subagent_reasoning_effort', 'interrupt_message', 'max_threads')
ROLE_NAMES = ('code_mapper', 'implementer', 'tester', 'docs', 'reviewer', 'security',
              'architect', 'mobocom-backend', 'mobocom-frontend', 'mobocom-checker')
GUIDANCE = '''Follow [the shared agent orchestration](docs/agent/AGENT_ORCHESTRATION.md)
alongside SESSION_BOOTSTRAP and the existing mobocom skills. Keep small/sequential
tasks with the lead; delegate only independent bounded work with explicit file
ownership. Sol leads, Terra implements, Luna maps/tests/documents; sensitive
decisions return to Sol. Shared architecture/workstate and required real evidence
remain authoritative for both Claude and Codex.'''
SKILL_GUIDANCE = '''For delegated work, follow `docs/agent/AGENT_ORCHESTRATION.md` in the
resolved checkout: explicit ownership, model routing, bounded checks and Sol
escalation. Keep the existing architecture and shared handoff/workstate.'''


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def merge_config(text: str, defaults: str) -> str:
    """Replace only owned scalar settings; compare parsed remainder before writing."""
    before = tomllib.loads(text)
    desired = tomllib.loads(defaults)
    lines = text.splitlines(keepends=True)
    section = ''
    multiline = None
    output: list[str] = []
    inserted_agents = False
    for line in lines:
        stripped = line.strip()
        if multiline:
            output.append(line)
            if stripped.count(multiline) % 2:
                multiline = None
            continue
        header = re.fullmatch(r'\[([^\[\]]+)\]\s*(?:#.*)?', stripped)
        if header:
            section = header.group(1).strip()
            output.append(line)
            if section == 'agents':
                output.extend(f'{key} = {json.dumps(value)}\n' for key, value in desired['agents'].items())
                inserted_agents = True
            continue
        key = re.match(r'^\s*([A-Za-z0-9_-]+)\s*=', line)
        owned = key and ((not section and key.group(1) in TOP) or
                         (section == 'agents' and key.group(1) in AGENTS))
        if owned:
            continue
        output.append(line)
        for delimiter in ('"""', "'''"):
            if line.count(delimiter) % 2:
                multiline = delimiter
                break
    prefix = '# MoboCom project agent defaults; unrelated local settings retained.\n'
    # Do not grow the marker on repeated installation.
    joined = ''.join(output)
    joined = joined.removeprefix(prefix).lstrip('\r\n')
    result = prefix + ''.join(f'{key} = {json.dumps(desired[key])}\n' for key in TOP) + '\n' + joined
    if not inserted_agents:
        result = result.rstrip() + '\n\n[agents]\n' + ''.join(
            f'{key} = {json.dumps(value)}\n' for key, value in desired['agents'].items())
    after = tomllib.loads(result)
    def unrelated(value):
        value = dict(value)
        for key in TOP:
            value.pop(key, None)
        agents = dict(value.get('agents', {}))
        for key in AGENTS:
            agents.pop(key, None)
        if agents:
            value['agents'] = agents
        else:
            value.pop('agents', None)
        return value
    if unrelated(before) != unrelated(after):
        raise ValueError('Refusing to change unrelated local configuration')
    return result if result.endswith('\n') else result + '\n'


def marked(text: str, name: str, body: str) -> str:
    start, end = f'<!-- {name}:start -->', f'<!-- {name}:end -->'
    block = start + '\n' + body.strip() + '\n' + end
    if start in text or end in text:
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError('Ambiguous guidance markers')
        return re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda _: block, text, flags=re.S)
    return text + ('\n' if text.endswith('\n') else '\n\n') + block + '\n'


def safe_path(target: Path, relative: str) -> Path:
    path = target / relative
    if path.resolve() != path.absolute() or any(p.is_symlink() for p in (path, *path.parents) if p != target.parent):
        raise ValueError('Linked or redirected install path refused: ' + relative)
    if not path.resolve().is_relative_to(target):
        raise ValueError('Install path escaped project')
    return path


def plan(target: Path) -> dict[str, bytes]:
    if not (target / 'package.json').is_file() or not (target / 'AGENTS.md').is_file():
        raise ValueError('Target must be an existing MoboCom checkout')
    if json.loads((target / 'package.json').read_text(encoding='utf-8-sig')).get('name') != 'mobocomcms':
        raise ValueError('Target package is not MoboCom')
    config = safe_path(target, '.codex/config.toml')
    text = config.read_bytes().decode('utf-8-sig') if config.exists() else ''
    defaults = (SOURCE / '.codex/config.toml').read_text(encoding='utf-8')
    changes = {'.codex/config.toml': merge_config(text, defaults).encode()}
    for name in ROLE_NAMES:
        relative = f'.codex/agents/{name}.toml'
        source = SOURCE / relative
        data = source.read_bytes()
        parsed = tomllib.loads(data.decode('utf-8'))
        if parsed.get('name') != name or not parsed.get('developer_instructions'):
            raise ValueError('Invalid role definition: ' + name)
        changes[relative] = data
    relative = 'docs/agent/AGENT_ORCHESTRATION.md'
    changes[relative] = (SOURCE / relative).read_bytes()
    # Seed the shared receipt in a checkout that lacks it; never overwrite history.
    relative = 'docs/agent/handoffs/AGENT_ORCHESTRATION.md'
    if not safe_path(target, relative).exists():
        changes[relative] = (SOURCE / relative).read_bytes()
    for relative in ('scripts/configure-mobocom-agents.py', 'scripts/configure-mobocom-agents.test.py'):
        changes[relative] = (SOURCE / relative).read_bytes()
    for relative, body in [('AGENTS.md', GUIDANCE),
                           ('docs/agent/SESSION_BOOTSTRAP.md', 'Team routing: [AGENT_ORCHESTRATION](AGENT_ORCHESTRATION.md). Use the same policy for Claude and Codex; retain this bootstrap and existing handoffs.')]:
        path = safe_path(target, relative)
        if not path.exists():
            raise ValueError('Required shared guidance missing: ' + relative)
        changes[relative] = marked(path.read_bytes().decode('utf-8'), 'mobocom-agent-orchestration', body).encode()
    for client in ('.agents', '.claude'):
        relative = f'{client}/skills/mobocom-develop/SKILL.md'
        path = safe_path(target, relative)
        if not path.exists():
            raise ValueError('Required existing skill missing: ' + relative)
        changes[relative] = marked(path.read_bytes().decode('utf-8'), 'mobocom-agent-orchestration', SKILL_GUIDANCE).encode()
    return {name: data for name, data in changes.items()
            if not safe_path(target, name).exists() or safe_path(target, name).read_bytes() != data}


def install(target: Path, changes: dict[str, bytes]) -> dict:
    # Precompute/validate the complete plan before writing. Keep exact old bytes.
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = safe_path(target, 'var/agent-orchestration-backups/' + stamp)
    backup.mkdir(parents=True, mode=0o700)
    receipt = {'files': [], 'globalConfigChanged': False, 'backup': str(backup)}
    applied = []
    try:
        for relative, data in changes.items():
            path = safe_path(target, relative)
            old = path.read_bytes() if path.exists() else None
            if old is not None:
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                saved.write_bytes(old)
            receipt['files'].append({'path': relative, 'existed': old is not None,
                                     'before': digest(old) if old is not None else None,
                                     'after': digest(data)})
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(path.name + '.mobocom-install.tmp')
            created = False
            try:
                with temporary.open('xb') as handle:
                    created = True
                    handle.write(data)
                os.replace(temporary, path)
            except Exception:
                if created and temporary.exists():
                    temporary.unlink()
                raise
            applied.append((path, old))
        (backup / 'receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    except Exception:
        for path, old in reversed(applied):
            if old is None:
                path.unlink()
            else:
                path.write_bytes(old)
        raise
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', type=Path, default=SOURCE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = args.target.resolve()
    changes = plan(target)
    if args.apply and changes:
        receipt = install(target, changes)
        print(json.dumps({'installed': list(changes), 'backup': receipt['backup'],
                          'globalConfigChanged': False}))
    else:
        print(json.dumps({'pending': list(changes), 'mode': 'check' if args.check else 'preview',
                          'globalConfigChanged': False}))
    if args.check and changes:
        return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        # Avoid echoing local config values/secrets in parser errors.
        print('Agent configuration refused: ' + type(error).__name__ + '; inspect paths/TOML and preserve backups.', file=sys.stderr)
        sys.exit(2)
