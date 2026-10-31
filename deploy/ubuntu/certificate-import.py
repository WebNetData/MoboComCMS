#!/usr/bin/env python3
"""Restricted root helper: bounded PEM on stdin, no user-controlled file paths."""
import base64, datetime, fcntl, json, os, pathlib, re, shutil, ssl, subprocess, sys, tempfile

def run(*args):
    return subprocess.check_output(['openssl', *args], stderr=subprocess.DEVNULL, timeout=10, env={**os.environ, 'LC_ALL': 'C'})

def root_path(value):
    root = pathlib.Path(value)
    if not root.is_absolute() or str(root.resolve()) != str(root):
        raise ValueError('unsafe root')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root

def entry(root, name):
    if not re.fullmatch(r'manual-[a-z0-9][a-z0-9.-]{0,85}', name) or '..' in name:
        raise ValueError('invalid name')
    path = root / name
    if path.is_symlink() or (path.exists() and path.resolve().parent != root):
        raise ValueError('unsafe entry')
    return path

def main():
    mode, directory = sys.argv[1:3]
    root = root_path(directory)
    # Serialize publication, rollback and deletion across separate helper processes.
    fd = os.open(root / '.operations.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        operate(mode, root)

def operate(mode, root):
    if mode == 'list':
        for path in sorted(root.iterdir()):
            try:
                path = entry(root, path.name)
                info = json.loads((path / 'current' / 'metadata.json').read_text())
                expires = datetime.datetime.fromisoformat(info['expiresAt'])
                days = (expires - datetime.datetime.now(datetime.timezone.utc)).days
                print('  Certificate Name: ' + path.name)
                print('    Domains: ' + ' '.join(info['domains']))
                print('    Expiry Date: ' + info['expiresAt'] + (' (VALID: %s days)' % days if days >= 0 else ' (INVALID: EXPIRED)'))
                print('    Certificate Path: ' + str(path / 'current' / 'fullchain.pem'))
            except (ValueError, OSError, KeyError):
                continue
        return
    name = sys.argv[3]
    dest = entry(root, name)
    if mode == 'delete':
        if dest.exists(): shutil.rmtree(dest)
        print('OK removed imported certificate')
        return
    domain = sys.argv[4]
    if mode != 'import' or not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,252}', domain) or '..' in domain:
        raise ValueError('invalid operation')
    payload = sys.stdin.buffer.read(262145)
    lines = payload.splitlines()
    if len(payload) > 262144 or len(lines) != 2: raise ValueError('invalid payload')
    cert, key = [base64.b64decode(line, validate=True) for line in lines]
    if len(cert) > 131072 or len(key) > 32768: raise ValueError('oversized PEM')
    dest.mkdir(mode=0o700, exist_ok=True)
    versions = dest / 'versions'
    versions.mkdir(mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.validate-', dir=root) as temp:
        chainfile, keyfile = pathlib.Path(temp) / 'fullchain.pem', pathlib.Path(temp) / 'privkey.pem'
        for file, content in [(chainfile, cert), (keyfile, key)]:
            fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as stream: stream.write(content)
        run('x509', '-in', str(chainfile), '-checkend', '0', '-noout')
        start = run('x509', '-in', str(chainfile), '-startdate', '-noout').decode().strip().split('=', 1)[1]
        if ssl.cert_time_to_seconds(start) > datetime.datetime.now(datetime.timezone.utc).timestamp(): raise ValueError('not valid yet')
        checked = run('x509', '-in', str(chainfile), '-checkhost', domain, '-noout')
        if b'does match certificate' not in checked: raise ValueError('wrong hostname')
        if run('x509', '-in', str(chainfile), '-pubkey', '-noout') != run('pkey', '-in', str(keyfile), '-pubout', '-passin', 'pass:'): raise ValueError('wrong key')
        expiry = run('x509', '-in', str(chainfile), '-enddate', '-noout').decode().strip().split('=', 1)[1]
        expires = datetime.datetime.fromtimestamp(ssl.cert_time_to_seconds(expiry), datetime.timezone.utc).isoformat()
        sans = run('x509', '-in', str(chainfile), '-ext', 'subjectAltName', '-noout').decode()
        domains = re.findall(r'DNS:([^,\s]+)', sans)
        if not domains: raise ValueError('SAN required')
        target = pathlib.Path(tempfile.mkdtemp(prefix='v-', dir=versions))
        for file in [chainfile, keyfile]: shutil.copyfile(file, target / file.name); os.chmod(target / file.name, 0o600)
        (target / 'metadata.json').write_text(json.dumps({'domains': domains, 'expiresAt': expires}))
        link = dest / ('.current-' + target.name)
        link.symlink_to(pathlib.Path('versions') / target.name)
        current = dest / 'current'
        previous = os.readlink(current) if current.is_symlink() else None
        os.replace(link, current)
        if len(sys.argv) > 5 and sys.argv[5] == 'reload':
            try:
                subprocess.run(['nginx', '-t'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                subprocess.run(['systemctl', 'reload', 'nginx'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
            except Exception:
                if previous is None: current.unlink()
                else:
                    link.symlink_to(previous)
                    os.replace(link, current)
                raise
    print('OK imported certificate')

if __name__ == '__main__':
    try: main()
    except Exception:
        print('ERROR: certificate import refused; verify PEM, private key, hostname and validity', file=sys.stderr)
        sys.exit(2)
