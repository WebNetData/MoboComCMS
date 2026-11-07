const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), Module = require('node:module'), real = require('./engineering/protocol.cjs');
test('automatic public architecture records omit private instructions and reject common credential literals', () => {
    const f = fixture();
    try {
        const github = load('scripts/engineering/github.cjs', { './protocol.cjs': f.p, './workspace.cjs': f.w });
        for (const name of ['ARCHITECTURE', 'MOBOCOM_MAP', 'CAPABILITY_LEDGER']) {
            fs.mkdirSync(path.join(f.source, 'docs/agent/handoffs'), { recursive: true });
            fs.writeFileSync(path.join(f.source, 'docs/agent', name + '.md'), '# Existing owner document\n');
        }
        github.architectureReceipt({ id: f.id, instruction: 'owned-private-instruction-not-for-publication', changed: ['src/modules/store/server/owned.ts'], artifact: 'b'.repeat(64), baseSha: 'a'.repeat(40), checks: [{ name: 'owned focused check', passed: true }] });
        const report = fs.readFileSync(path.join(f.source, 'docs/agent/handoffs/AI_RUN_' + f.id + '.md'), 'utf8');
        assert(!report.includes('owned-private-instruction'));
        assert(report.includes('src/modules/store/server/owned.ts'));
        assert.throws(() => real.credentialLiterals('const key = "' + 'ghp_' + 'x'.repeat(36) + '"'), /Credential-like literal/);
        real.credentialLiterals('const apiKey = readEncryptedSettings()');
    }
    finally {
        f.cleanup();
    }
});
test('fixed server repair rejects stale facts and arbitrary commands before touching a service', async () => {
    const f = fixture();
    try {
        let proof = { repairId: 'reload-proxy', diagnosticHash: 'wrong', runtimeId: 'native' };
        const current = { id: 'native', port: 3000 }, d = { active: () => current, approval: () => proof, healthy: async () => true };
        const repair = load('scripts/engineering/repair.cjs', { './protocol.cjs': f.p, './workspace.cjs': f.w, './deployment.cjs': d });
        const diagnosticHash = repair.identity(f.c, current);
        f.records.set(f.id, { id: f.id, phase: 'repairing', diagnosticHash, runtimeId: 'native', allowedRepairs: ['reload-proxy'] });
        f.calls.length = 0;
        await assert.rejects(repair.repair(f.c, f.id), /Diagnostic changed/);
        assert.equal(f.calls.length, 0);
        proof = { ...proof, diagnosticHash, repairId: 'arbitrary-shell' };
        await assert.rejects(repair.repair(f.c, f.id), /Diagnostic changed/);
        proof.repairId = 'reload-proxy';
        const result = await repair.repair(f.c, f.id);
        assert.equal(result.phase, 'repaired');
        assert(f.calls.some(call => call.binary === '/usr/bin/systemctl' && call.args.join(' ') === 'reload nginx'));
        assert(f.calls.every(call => call.binary === '/usr/sbin/nginx' || call.binary === '/usr/bin/systemctl'));
    }
    finally {
        f.cleanup();
    }
});
function load(file, mocks) { const full = path.resolve(file), mod = new Module(full, module); mod.filename = full; mod.paths = Module._nodeModulePaths(path.dirname(full)); const normal = mod.require.bind(mod); mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : normal(id); mod._compile(fs.readFileSync(full, 'utf8'), full); return mod.exports; }
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-engineering-host-')), id = '12345678-1234-1234-1234-123456789012', records = new Map(), calls = [], runtime = path.join(root, 'run'), proxy = path.join(root, 'proxy.conf'), source = path.join(root, id, 'source');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(runtime);
    fs.mkdirSync(path.join(root, 'storage', 'update'), { recursive: true });
    fs.writeFileSync(proxy, '# Managed by MoboCom Engineering; include inside the existing location /.\nproxy_pass http://127.0.0.1:3000;\n');
    let badRoute = false, deny = false, merged = true;
    const saved = (file, value) => {
        if (file === '/run/mobocom-engineering/active.json')
            file = path.join(runtime, 'active.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(value));
    }, fakeFs = { ...fs, mkdirSync: (file, opts) => file === '/run/mobocom-engineering' ? undefined : fs.mkdirSync(file, opts), chmodSync: (file, mode) => (file === '/run/mobocom-engineering' || file === '/run/mobocom-engineering/active.json') ? undefined : fs.chmodSync(file, mode) };
    const command = (binary, args) => {
        calls.push({ binary, args });
        if (binary === '/usr/bin/node' && args.includes('--approval')) {
            if (deny)
                throw new Error('revoked');
            return JSON.stringify({ id, operation: args[2], artifact: 'b'.repeat(64), headSha: 'a'.repeat(40) });
        }
        if (binary === '/usr/sbin/nginx' && args[0] === '-T')
            return 'include ' + proxy + ';';
        return '';
    };
    const p = { ...real, fs: fakeFs, ROOT: root, TOOLS: root, owned: () => ({ uid: 0 }), environment: () => ({ DATABASE_URL: 'postgresql://synthetic-test-only' }), directory: () => path.join(root, id), state: key => records.get(key) || null, writeState: (key, value) => { records.set(key, JSON.parse(JSON.stringify(value))); return value; }, save: saved, command, git: () => '', asyncLock: async (name, work) => work() };
    const w = { source: () => source, availableMemory: () => 32000, docker: args => {
            calls.push({ binary: 'docker', args });
            if (args[0] === 'inspect')
                throw new Error('missing fixture container');
            return '';
        }, publicReceipt: row => ({ ...row }) };
    const c = { appDir: root, storage: path.join(root, 'storage'), proxyInclude: proxy, envFile: path.join(root, 'env'), runtimeUid: 1000, runtimeGid: 1000, runtimeMemoryMb: 1024, reserveMemoryMb: 1024, dependencyImage: 'sha256:' + 'c'.repeat(64), backupScript: path.join(root, 'backup.sh'), publicUrl: 'https://owned.invalid' };
    const native = { runtimeUnit: id => 'mobocom-ai-runtime-' + id, prepare: async (c, row) => ({ directory: '/owned/immutable/' + row.id, unit: 'mobocom-ai-runtime-' + row.id }), start: (c, row) => calls.push({ binary: 'native-start', args: [row.unit || 'mobocom'] }), stop: row => calls.push({ binary: 'native-stop', args: [row.unit] }), running: () => true };
    const deployment = load('scripts/engineering/deployment.cjs', { './protocol.cjs': p, './workspace.cjs': w, './native-runtime.cjs': native, './artifact.cjs': { artifactDigest: () => 'b'.repeat(64) }, './github.cjs': { merged: async () => { assert(merged, 'Exact merged-main requirement'); } } }), originalFetch = global.fetch;
    global.fetch = async (url) => Response.json({ ok: true, database: 'ready' }, { headers: { 'x-mobocom-runtime': String(url).startsWith('https:') && badRoute ? 'wrong' : id } });
    const reset = () => {
        records.set(id, { id, phase: 'promoting', artifact: 'b'.repeat(64), headSha: 'a'.repeat(40), volume: 'owned-work', checks: [{ name: 'build', passed: true }] });
        try {
            fs.unlinkSync(path.join(root, 'active.json'));
        }
        catch { }
        fs.writeFileSync(proxy, deployment.proxyText(3000));
        calls.length = 0;
        badRoute = false;
        deny = false;
        merged = true;
    };
    reset();
    return { root, id, p, w, c, deployment, records, calls, source, reset, setBad: () => badRoute = true, setDenied: () => deny = true, setUnmerged: () => merged = false, cleanup: () => { global.fetch = originalFetch; assert(root.startsWith(path.join(os.tmpdir(), 'owned-engineering-host-'))); fs.rmSync(root, { recursive: true, force: true }); } };
}
test('host promotion validates authority/merge, keeps old runtime, and falls back without restoring DB', async () => {
    const f = fixture();
    try {
        f.setDenied();
        await assert.rejects(f.deployment.promote(f.c, f.id), /revoked/);
        assert(!f.calls.some(c => c.binary === 'docker'));
        f.reset();
        f.setUnmerged();
        await assert.rejects(f.deployment.promote(f.c, f.id), /merged-main/);
        f.reset();
        let result = await f.deployment.promote(f.c, f.id);
        assert.equal(result.phase, 'deployed');
        assert.equal(f.deployment.active().port, 3101);
        assert.equal(f.deployment.active().previous.port, 3000);
        assert(f.calls.some(c => c.binary === 'native-start' && c.args[0] === 'mobocom-ai-runtime-' + f.id));
        assert(!f.calls.some(c => c.binary === 'docker'));
        assert(!f.calls.some(c => c.args.includes('stop') && c.args.includes('mobocom')));
        f.reset();
        f.setBad();
        result = await f.deployment.promote(f.c, f.id);
        assert.equal(result.phase, 'rolled-back');
        assert.equal(f.deployment.active().port, 3000);
        assert(fs.readFileSync(f.c.proxyInclude, 'utf8').includes(':3000'));
        assert(!f.calls.some(c => c.args.some(a => /restore|db:push|migrate reset/.test(a))));
    }
    finally {
        f.cleanup();
    }
});
test('workspace patch requires current hash, rejects symlinks and replays one step without another edit', () => {
    const f = fixture();
    try {
        const file = path.join(f.source, 'src/modules/store/owned.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'export const owned = 1\n');
        real.git(f.source, ['init']);
        real.git(f.source, ['add', '.']);
        real.git(f.source, ['-c', 'user.name=Owned fixture', '-c', 'user.email=owned@invalid.test', 'commit', '-m', 'owned baseline']);
        const baseSha = real.git(f.source, ['rev-parse', 'HEAD']);
        f.records.set(f.id, { id: f.id, phase: 'developing', maxFiles: 2, changed: [], steps: {}, baseSha });
        const p = { ...f.p, fs, git: real.git }, w = load('scripts/engineering/workspace.cjs', { './protocol.cjs': p });
        const edit = { path: 'src/modules/store/owned.ts', before: real.hash(fs.readFileSync(file, 'utf8')), content: 'export const owned = 2\n' };
        assert.throws(() => w.apply(f.c, { runId: f.id, step: 1, edits: [{ ...edit, before: '0'.repeat(64) }] }), /hash/);
        w.apply(f.c, { runId: f.id, step: 1, edits: [edit] });
        assert.equal(fs.readFileSync(file, 'utf8'), edit.content);
        w.apply(f.c, { runId: f.id, step: 1, edits: [edit] });
        assert.throws(() => w.apply(f.c, { runId: f.id, step: 1, edits: [{ ...edit, content: 'changed' }] }), /another patch/);
        fs.symlinkSync(os.tmpdir(), path.join(f.source, 'src/outside'));
        assert.throws(() => w.read(f.c, { runId: f.id, paths: ['src/outside/x.ts'] }), /Symlinks/);
    }
    finally {
        f.cleanup();
    }
});
test('native runtime persists fixed unprivileged units across reboot, refusing drift and native stop', () => {
    const calls = [], files = new Map(), p = { ...real, fs: { ...fs, existsSync: file => files.has(file), readFileSync: file => files.get(file), writeFileSync: (file, text) => files.set(file, text) }, owned: () => { }, command: (binary, args) => { calls.push({ binary, args }); return ''; } };
    const runtime = load('scripts/engineering/native-runtime.cjs', { './protocol.cjs': p });
    const id = '12345678-1234-1234-1234-123456789012', row = { id, unit: runtime.runtimeUnit(id), directory: runtime.RELEASES + '/' + id, port: 3101 }, c = { runtimeUid: 1000, runtimeGid: 1000, envFile: '/etc/mobocom/mobocom.env', runtimeMemoryMb: 2048 };
    runtime.start(c, row);
    const text = [...files.values()][0];
    assert(text.includes('User=1000'));
    assert(text.includes('WorkingDirectory="' + row.directory + '"'));
    assert(text.includes('EnvironmentFile="/etc/mobocom/mobocom.env"'));
    assert(text.includes('MemoryMax=2048M'));
    assert(text.includes('127.0.0.1 -p 3101'));
    assert(text.includes('WantedBy=multi-user.target'));
    assert(calls.some(call => call.binary === '/usr/bin/systemctl' && call.args.join(' ') === 'enable --now ' + row.unit));
    assert(!text.includes('docker.sock'));
    assert.throws(() => runtime.start({}, { ...row, directory: '/tmp/untrusted' }), /Unknown/);
    assert.throws(() => runtime.stop({ id: 'native' }), /never stopped/);
    assert.throws(() => runtime.start({ ...c, runtimeMemoryMb: 4096 }, row), /configuration changed/);
});
