"""Create a source-only MoboComCMS update with a checksum."""
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = root / f'MoboComCMS-update-{version}.zip'
allowed_dirs = ('deploy', 'docs', 'prisma', 'public', 'scripts', 'src')
allowed_files = {'.dockerignore', '.env.example', '.env.production.example', '.gitignore', 'BUILD-VERIFIED.md', 'DEPLOY-FA.md', 'Dockerfile', 'README.md', 'RELEASE-NOTES.md', 'UPLOAD.md', 'next-env.d.ts', 'next.config.js', 'package-lock.json', 'package.json', 'tsconfig.json'}

files = [p for p in root.iterdir() if p.is_file() and (p.name in allowed_files or p.name.startswith('UPDATE-') and p.suffix == '.md')]
for name in allowed_dirs:
    files.extend(p for p in (root / name).rglob('*') if p.is_file())
files = sorted(p for p in files if not any(part in {'__pycache__', '.git', 'node_modules'} for part in p.parts) and p.suffix not in {'.db', '.pyc'} and not p.name.endswith('.log'))

with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=8) as archive:
    for file in files:
        archive.write(file, f'MoboComCMS-{version}/{file.relative_to(root).as_posix()}')

digest = sha256(target.read_bytes()).hexdigest()
(root / f'MoboComCMS-update-{version}.sha256').write_text(f'{digest}  {target.name}\n', encoding='ascii')
print(f'{target.name}: {len(files)} source files, {target.stat().st_size:,} bytes, sha256 {digest}')
