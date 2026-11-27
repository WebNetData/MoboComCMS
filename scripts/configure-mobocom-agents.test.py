"""Focused installer behavior checks; no model calls or real user configuration."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('agent_setup', Path(__file__).with_name('configure-mobocom-agents.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
DEFAULTS = (setup.SOURCE / '.codex/config.toml').read_text(encoding='utf-8')


class ConfigurationMerge(unittest.TestCase):
    def test_preserves_local_mcp_permissions_and_provider_with_legacy_agent_alias(self):
        old = '''model = "old-model"
approval_policy = "never"
sandbox_mode = "workspace-write"
model_provider = "local-provider"
[mcp_servers.local]
command = "local-tool"
args = ["a", "b"]
[sandbox_workspace_write]
network_access = false
[agents]
max_threads = 5
[agents.existing]
description = "Keep custom role"
config_file = "agents/custom.toml"
'''
        result = setup.tomllib.loads(setup.merge_config(old, DEFAULTS))
        original = setup.tomllib.loads(old)
        for key in ('approval_policy', 'sandbox_mode', 'model_provider', 'mcp_servers', 'sandbox_workspace_write'):
            self.assertEqual(result[key], original[key])
        self.assertEqual(result['agents']['existing'], original['agents']['existing'])
        self.assertNotIn('max_threads', result['agents'])
        self.assertEqual(result['agents']['max_concurrent_threads_per_session'], 3)
        self.assertEqual(result['model'], 'gpt-6.1-sol')

    def test_repeat_install_does_not_grow_or_change_configuration(self):
        first = setup.merge_config('[mcp_servers.local]\ncommand="local"\n', DEFAULTS)
        self.assertEqual(setup.merge_config(first, DEFAULTS), first)
        once = setup.marked('# Existing owner rules\n', 'team', setup.GUIDANCE)
        self.assertEqual(setup.marked(once, 'team', setup.GUIDANCE), once)

    def test_preserves_table_like_text_in_multiline_instructions(self):
        old = 'developer_instructions = """\n[agents]\nmodel = "example only"\n"""\n'
        merged = setup.tomllib.loads(setup.merge_config(old, DEFAULTS))
        self.assertEqual(merged['developer_instructions'], setup.tomllib.loads(old)['developer_instructions'])
        self.assertEqual(merged['agents']['default_subagent_model'], 'gpt-6-luna')

    def test_malformed_input_fails_before_mutation(self):
        with self.assertRaises(Exception):
            setup.merge_config('[agents\nsecret="never print"', DEFAULTS)

    def test_hierarchical_roles_are_installed_with_exact_model_and_effort(self):
        expected = {
            'development_lead': ('gpt-6.2-sol', 'high'),
            'development_worker': ('gpt-6.2-sol', 'medium'),
            'quality_lead': ('gpt-6-luna', 'high'),
            'quality_worker': ('gpt-6-luna', 'low'),
        }
        for name, settings in expected.items():
            with self.subTest(name=name):
                self.assertIn(name, setup.ROLE_NAMES)
                role = setup.tomllib.loads((setup.SOURCE / '.codex/agents' / f'{name}.toml').read_text(encoding='utf-8'))
                self.assertEqual(role['name'], name)
                self.assertEqual((role['model'], role['model_reasoning_effort']), settings)

    def test_install_preserves_exact_backup_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve()
            existing = {
                'package.json': b'{"name":"mobocomcms"}',
                'AGENTS.md': b'# Owner rules\r\nKeep these bytes.\r\n',
                '.codex/config.toml': b'[mcp_servers.local]\r\ncommand = "existing"\r\n',
                'docs/agent/SESSION_BOOTSTRAP.md': b'# Existing bootstrap\n',
                '.agents/skills/mobocom-develop/SKILL.md': b'# Existing Codex skill\n',
                '.claude/skills/mobocom-develop/SKILL.md': b'# Existing Claude skill\n',
            }
            for file, data in existing.items():
                path = target / file
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            changes = setup.plan(target)
            self.assertIn('.codex/agents/development_lead.toml', changes)
            self.assertIn('.codex/agents/quality_worker.toml', changes)
            receipt = setup.install(target, changes)
            backup = Path(receipt['backup'])
            for entry in receipt['files']:
                if entry['existed']:
                    self.assertEqual((backup / entry['path']).read_bytes(), existing[entry['path']])
                self.assertEqual(setup.digest((target / entry['path']).read_bytes()), entry['after'])
            self.assertEqual(setup.plan(target), {})
            self.assertIn(b'Keep these bytes.\r\n', (target / 'AGENTS.md').read_bytes())
            self.assertFalse(receipt['globalConfigChanged'])
            self.assertFalse((target / '.codex/auth.json').exists())
            handoff = target / 'docs/agent/handoffs/AGENT_ORCHESTRATION.md'
            handoff.write_bytes(b'# Later owner evidence\n')
            self.assertNotIn('docs/agent/handoffs/AGENT_ORCHESTRATION.md', setup.plan(target))

    def test_rejects_path_outside_target(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                setup.safe_path(Path(directory).resolve(), '../escape.toml')

    def test_failed_second_write_restores_first_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory).resolve()
            first = target / 'first.txt'
            first.write_bytes(b'original\r\n')
            original_replace = setup.os.replace
            def fail_second(source, destination):
                if Path(destination).name == 'second.txt':
                    raise PermissionError('controlled write failure')
                return original_replace(source, destination)
            with patch.object(setup.os, 'replace', side_effect=fail_second):
                with self.assertRaises(PermissionError):
                    setup.install(target, {'first.txt': b'changed', 'second.txt': b'new'})
            self.assertEqual(first.read_bytes(), b'original\r\n')
            self.assertFalse((target / 'second.txt').exists())
            self.assertFalse((target / 'second.txt.mobocom-install.tmp').exists())


if __name__ == '__main__':
    unittest.main()
