const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), load = require('./connected-source-loader.cjs')(), domain = load('src/modules/ai/domain/engineering.ts'), host = require('./engineering/protocol.cjs');
test('engineering paths reject secrets/traversal/host and guard edits at both boundaries', () => {
    for (const p of ['../../etc/passwd', 'src/../.env', 'src/.env.local', 'storage/x.ts', 'src/a\\b.ts', 'src/a.ts\n', 'src/modules/ai/server/engineering/authority.ts', 'src/platform/http/x.ts', 'prisma/schema.prisma', 'deploy/ubuntu/x.sh', 'package.json', '.github/workflows/checks.yml']) {
        assert.throws(() => domain.engineeringPath(p, true), p);
        assert.throws(() => host.safePath(p, true), p);
    }
    for (const p of ['src/modules/store/server/feature.ts', 'src/app/dashboard/feature/page.tsx', 'docs/agent/ARCHITECTURE.md']) {
        assert.equal(domain.engineeringPath(p, true), p);
        assert.equal(host.safePath(p, true), p);
    }
});
test('engineering plans are bounded data and require exact source hashes', () => { const plan = { summary: 'bounded change', reads: ['src/modules/store/server/catalog.ts'], edits: [{ path: 'src/modules/store/server/new.ts', before: 'new', content: 'export const x = 1' }], done: true }; assert.equal(domain.engineeringPlan(JSON.stringify(plan), 2).edits.length, 1); assert.throws(() => domain.engineeringPlan(JSON.stringify({ ...plan, command: 'rm -rf /' }), 2)); assert.throws(() => domain.engineeringPlan(JSON.stringify({ ...plan, edits: [{ ...plan.edits[0], before: 'unknown' }] }), 2)); assert.throws(() => domain.engineeringPlan(JSON.stringify({ ...plan, edits: [...plan.edits, ...plan.edits] }), 2)); assert.throws(() => domain.engineeringPlan(JSON.stringify({ ...plan, edits: [{ ...plan.edits[0], content: 'x'.repeat(60001) }] }), 2)); });
test('policy is disabled by default, rejects malformed budgets and keeps inert named skills', () => { const p = domain.defaultEngineeringPolicy(); assert.equal(p.enabled, false); assert.throws(() => domain.engineeringPolicy({ ...p, maxSteps: 99 })); const skill = { id: 'site-expert', title: 'expert', body: 'Follow owner boundaries.', tags: ['store'], enabled: true }; assert.equal(domain.engineeringPolicy({ ...p, skills: [skill] }).skills.length, 1); assert.throws(() => domain.engineeringPolicy({ ...p, skills: [skill, skill] })); assert.throws(() => domain.engineeringPolicy({ ...p, skills: [{ ...skill, id: '../../root' }] })); });
test('broker repository file access refuses symlink escapes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-engineering-path-'));
    try {
        fs.mkdirSync(path.join(dir, 'src'));
        fs.symlinkSync(os.tmpdir(), path.join(dir, 'src', 'outside'));
        assert.throws(() => host.filePath(dir, 'src/outside/value.ts', true));
        assert.equal(host.filePath(dir, 'src/new.ts', true), path.join(dir, 'src/new.ts'));
    }
    finally {
        assert(dir.startsWith(path.join(os.tmpdir(), 'owned-engineering-path-')));
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
test('canonical knowledge is selected and pinned under a budget, not all sent to model', () => { const knowledge = load('src/modules/ai/server/engineering/knowledge.ts'), p = { ...domain.defaultEngineeringPolicy(), skills: [{ id: 'store-rules', title: 'Store', tags: ['store'], enabled: true, body: 'Prefer current store owner and claims.' }] }, a = knowledge.engineeringKnowledge('store order fields feature', p, ['store-rules']); assert(a.context.length < p.contextChars * .7); assert(a.pins.some(pin => pin.path === 'custom:store-rules')); assert.equal(a.bundleHash.length, 64); assert.throws(() => knowledge.engineeringKnowledge('store', p, ['missing'])); });
require('./ai-engineering.host.cases.cjs');
test('only the active runtime owns scheduled work and corrupt markers fail closed', () => {
    const old = process.env.ENGINEERING_RUN_ID;
    let marker = null;
    const owned = require('./connected-source-loader.cjs')({ 'node:fs': { readFileSync: () => { if (marker === null) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return marker; } } })('src/modules/operations/server/runtime.ts').runtimeOwnsBackgroundWork;
    try {
        delete process.env.ENGINEERING_RUN_ID;
        assert.equal(owned(), true);
        process.env.ENGINEERING_RUN_ID = 'candidate';
        assert.equal(owned(), false);
        marker = JSON.stringify({ id: 'candidate' });
        assert.equal(owned(), true);
        process.env.ENGINEERING_RUN_ID = 'retained';
        assert.equal(owned(), false);
        marker = 'corrupt';
        assert.equal(owned(), false);
    } finally { if (old === undefined) delete process.env.ENGINEERING_RUN_ID; else process.env.ENGINEERING_RUN_ID = old; }
});
test('private broker source is readable by a different sandbox user without exposing Git or traversing links', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-engineering-readable-'));
    try {
        fs.mkdirSync(path.join(root, 'src'), { mode: 0o700 });
        fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
        fs.writeFileSync(path.join(root, 'src/value.ts'), 'export const value = 1', { mode: 0o600 });
        fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
        require('./engineering/workspace.cjs').readableSource(root);
        assert.equal(fs.statSync(path.join(root, 'src')).mode & 0o777, 0o755);
        assert.equal(fs.statSync(path.join(root, 'src/value.ts')).mode & 0o777, 0o644);
        assert.equal(fs.statSync(path.join(root, '.git')).mode & 0o777, 0o700);
        assert(fs.lstatSync(path.join(root, 'outside')).isSymbolicLink());
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('artifact seal follows runtime bytes, ignores mutable storage and refuses escaping links', async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-engineering-seal-')); try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'storage'));
    fs.writeFileSync(path.join(root, 'src/owned.js'), 'export const value=1');
    const seal = require('./engineering/seal.cjs').sealDirectory, first = await seal(root);
    fs.writeFileSync(path.join(root, 'storage/new-customer-state.txt'), 'retained runtime data');
    assert.equal(await seal(root), first);
    fs.writeFileSync(path.join(root, 'src/owned.js'), 'export const value=2');
    assert.notEqual(await seal(root), first);
    fs.symlinkSync(os.tmpdir(), path.join(root, 'src/outside'));
    await assert.rejects(seal(root), /escapes/);
}
finally {
    assert(root.startsWith(path.join(os.tmpdir(), 'owned-engineering-seal-')));
    fs.rmSync(root, { recursive: true, force: true });
} });
test('runtime knowledge accepts a refreshed valid document and fails closed on tampering', () => { const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/modules/ai/domain/engineering-knowledge.generated.json'), 'utf8')), crypto = require('node:crypto'); bundle.entries[0].body += '\nOwned architecture refresh'; bundle.entries[0].sha256 = crypto.createHash('sha256').update(bundle.entries[0].body).digest('hex'); let text = JSON.stringify(bundle); const l = require('./connected-source-loader.cjs')({ 'node:fs': { readFileSync: () => text } }), knowledge = l('src/modules/ai/server/engineering/knowledge.ts'); assert(knowledge.currentEngineeringKnowledge().entries[0].body.includes('Owned architecture refresh')); bundle.entries[0].body += 'tampered'; text = JSON.stringify(bundle); assert.throws(() => knowledge.currentEngineeringKnowledge(), /معماری/); });
test('managed Server Panel APIs retain native authority without forwarding engineering or public paths', () => { const target = load('src/modules/server-panel/domain/control-plane.ts').nativeControlPlaneTarget; assert.equal(target('/api/admin/server/files', '?path=%2Fetc', true).href, 'http://127.0.0.1:3000/api/admin/server/files?path=%2Fetc'); for (const p of ['/api/admin/server/engineering', '/api/admin/server/engineering/status', '/dashboard', '//external.invalid/api/admin/server/files'])
    assert.equal(target(p, '', true), null); assert.equal(target('/api/admin/server/files', '', false), null); });
test('repair proposals contain a permitted runbook, never a command or new authority', () => { assert.equal(domain.engineeringRepairPlan(JSON.stringify({ repairId: 'reload-proxy', reason: 'The configured proxy can reload safely.' }), ['reload-proxy']).repairId, 'reload-proxy'); assert.throws(() => domain.engineeringRepairPlan(JSON.stringify({ repairId: 'start-proxy', reason: 'not currently allowed' }), ['reload-proxy'])); assert.throws(() => domain.engineeringRepairPlan(JSON.stringify({ repairId: 'reload-proxy', reason: 'unsafe extra command', command: 'arbitrary shell' }), ['reload-proxy'])); });
