import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_files', Path(__file__).parents[1] / 'deploy/ubuntu/release-extract.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def archive(file, members):
    with tarfile.open(file, 'w:gz') as out:
        for name, data, kind in members:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            entry.size = len(data) if kind == tarfile.REGTYPE else 0
            out.addfile(entry, io.BytesIO(data) if entry.size else None)


class ReleaseFiles(unittest.TestCase):
    def test_signed_release_still_rejects_paths_links_runtime_secrets_and_wrong_versions(self):
        for name, kind in [('src/../../escape', tarfile.REGTYPE), ('/etc/escape', tarfile.REGTYPE), ('storage/user', tarfile.REGTYPE), ('.env.production', tarfile.REGTYPE), ('src/x', tarfile.SYMTYPE), ('src/x', tarfile.LNKTYPE), ('src/x', tarfile.FIFOTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as work:
                root = Path(work)
                archive(root / 'release.gz', [(name, b'bad', kind)])
                with self.assertRaises(ValueError):
                    release.extract(root / 'release.gz', root / 'source', '1.6.1')
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            archive(root / 'release.gz', [('package.json', b'{"version":"1.6.0"}', tarfile.REGTYPE), ('package-lock.json', b'{}', tarfile.REGTYPE)])
            with self.assertRaises(ValueError):
                release.extract(root / 'release.gz', root / 'source', '1.6.1')

    def test_code_adoption_and_undo_keep_storage_env_and_git(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            app, stage = root / 'app', root / 'stage'
            source = stage / 'source'
            for directory in [app / 'storage/update/lock', app / 'var', app / '.git', app / 'public/demo', app / 'public/uploads', source]:
                directory.mkdir(parents=True)
            (app / 'public/demo/cover.svg').write_text('legacy cover')
            (app / 'public/uploads/customer').write_text('legacy customer media')
            (app / '.env').write_text('secret stays')
            (app / 'code').write_text('old')
            (source / 'code').write_text('new')
            release.adopt(app, stage)
            self.assertEqual((app / 'code').read_text(), 'new')
            self.assertEqual((app / '.env').read_text(), 'secret stays')
            self.assertTrue((app / 'storage/update/lock').is_dir())
            self.assertEqual((app / 'public/demo/cover.svg').read_text(), 'legacy cover')
            self.assertEqual((app / 'public/uploads/customer').read_text(), 'legacy customer media')
            release.undo(app, stage)
            self.assertEqual((app / 'code').read_text(), 'old')
            self.assertEqual((app / 'public/demo/cover.svg').read_text(), 'legacy cover')

    def test_adoption_failure_compensates_code(self):
        with tempfile.TemporaryDirectory() as work:
            root = Path(work)
            app, stage = root / 'app', root / 'stage'
            source = stage / 'source'
            app.mkdir()
            source.mkdir(parents=True)
            (app / 'code').write_text('owner')
            (source / 'code').write_text('new')
            original = Path.rename
            def fail_incoming(self, target):
                if self == source / 'code':
                    raise OSError('injected rename failure')
                return original(self, target)
            with patch.object(Path, 'rename', fail_incoming), self.assertRaises(OSError):
                release.adopt(app, stage)
            self.assertEqual((app / 'code').read_text(), 'owner')


if __name__ == '__main__':
    unittest.main()
