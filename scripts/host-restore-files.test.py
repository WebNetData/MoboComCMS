"""Archive traversal/type limits and compensated adoption, without a database."""
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('restore_files', Path(__file__).parents[1] / 'deploy/ubuntu/restore-files.py')
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class HostFiles(unittest.TestCase):
    def test_rejects_unsafe_entries(self):
        for name, kind in [('storage/../../escape', tarfile.REGTYPE), ('/storage/a', tarfile.REGTYPE),
                           ('storage/x', tarfile.SYMTYPE), ('storage/x', tarfile.LNKTYPE),
                           ('storage/x', tarfile.FIFOTYPE), ('storage/x', tarfile.CHRTYPE),
                           ('storage\\x', tarfile.REGTYPE), ('storage/./x', tarfile.REGTYPE)]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as work:
                stage = Path(work)
                archive = stage / 'archive.tar.gz'
                with tarfile.open(archive, 'w:gz') as target:
                    member = tarfile.TarInfo(name)
                    member.type = kind
                    target.addfile(member)
                with self.assertRaises(ValueError):
                    restore.extract(archive, stage)

    def test_duplicate_and_disk_budget(self):
        for duplicate in [True, False]:
            with tempfile.TemporaryDirectory() as work:
                stage = Path(work)
                archive = stage / 'archive.tar.gz'
                with tarfile.open(archive, 'w:gz') as target:
                    for _ in range(2 if duplicate else 1):
                        member = tarfile.TarInfo('storage/a')
                        member.size = 10
                        target.addfile(member, io.BytesIO(b'0123456789'))
                usage = type('Disk', (), {'free': 1000 if duplicate else 1})
                with patch.object(restore.shutil, 'disk_usage', return_value=usage), self.assertRaises(ValueError):
                    restore.extract(archive, stage)

    def test_adopt_failure_compensates_and_preserves_lock_and_config(self):
        with tempfile.TemporaryDirectory() as work:
            stage = Path(work) / 'stage'
            incoming = stage / 'incoming/storage'
            live = Path(work) / 'storage'
            for directory in [incoming, live / 'update/lock', live / 'config']:
                directory.mkdir(parents=True)
            (live / 'a').write_text('old')
            (incoming / 'a').write_text('backup')
            (live / 'config/local').write_text('keep')
            original = Path.rename
            def fail_incoming(self, target):
                if self == incoming / 'a':
                    raise OSError('injected failure')
                return original(self, target)
            with patch.object(Path, 'rename', fail_incoming), self.assertRaises(OSError):
                restore.adopt(live, stage)
            self.assertEqual((live / 'a').read_text(), 'old')
            self.assertEqual((live / 'config/local').read_text(), 'keep')
            self.assertTrue((live / 'update/lock').is_dir())


if __name__ == '__main__':
    unittest.main()
