/* Portable launcher. npm ci --prefix tools/devstack --ignore-scripts first. */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2];
const targets = { context7: '@upstash/context7-mcp/dist/index.js', playwright: '@playwright/mcp/cli.js' };
if (!Object.hasOwn(targets, mode)) throw new Error('Expected context7 or playwright');
const target = path.join(root, 'tools/devstack/node_modules', targets[mode]);
if (!fs.existsSync(target)) throw new Error('Run npm ci --prefix tools/devstack --ignore-scripts');
const args = mode === 'playwright' ? ['--browser', 'msedge', '--headless', '--isolated', '--output-dir', path.join(root, '.mobocom/browser-mcp')] : [];
const child = spawn(process.execPath, [target, ...args], { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...process.env, OTEL_SDK_DISABLED: 'true' } });
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
