// Real PostgreSQL + installed ZIP/RAR tools. Always use an isolated, empty-migrated test database.
const assert = require('node:assert/strict'), fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), ts = require('typescript'), { PrismaClient } = require('@prisma/client');
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/mobocom_media_/, 'isolated media database required');
assert.ok(process.env.DOWNLOADS_ROOT?.startsWith('/tmp/'), 'private Linux test storage required');
process.env.SERVER_PANEL_ENABLED = 'true';
process.env.NEXTAUTH_SECRET ||= 'owned-archive-test-secret-not-production';
const db = new PrismaClient(), cache = new Map(), mocks = { '@/platform/database/prisma': { db } }, repo = path.resolve(__dirname, '..');
function load(relative) { const file = path.resolve(repo, relative); if (cache.has(file))
    return cache.get(file).exports; const mod = { exports: {} }; cache.set(file, mod); const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText; new Function('require', 'module', 'exports', code)(name => { if (Object.hasOwn(mocks, name))
    return mocks[name]; if (name.startsWith('@/') || name.startsWith('.')) {
    const base = name.startsWith('@/') ? path.join(repo, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
    if (base.endsWith('.json'))
        return require(base);
    for (const ext of ['.ts', '.tsx', '/index.ts'])
        if (fs.existsSync(base + ext))
            return load(path.relative(repo, base + ext));
} return require(name); }, mod, mod.exports); return mod.exports; }
const stamp = 'owned-archive-' + Date.now(), root = process.env.DOWNLOADS_ROOT, month = new Date().toISOString().slice(0, 7), dir = path.join(root, 'uploads/general', month), work = path.join(root, '.incoming', stamp), jobs = [], assets = [], users = [], keys = new Map();
const relative = file => '/' + path.relative(root, file).split(path.sep).join('/'), hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function tool(file, args, cwd) { const result = cp.spawnSync(file, args, { cwd, encoding: 'utf8', timeout: 30000 }); assert.equal(result.status, 0, 'archive fixture tool failed (no command/password output)'); return result.stdout; }
const delay = ms => new Promise(r => setTimeout(r, ms));
async function finished(id) { for (let i = 0; i < 600; i++) {
    const job = await db.downloadJob.findUniqueOrThrow({ where: { id } });
    if (!['queued', 'running'].includes(job.status))
        return job;
    await delay(50);
} throw Error('archive job timed out'); }
async function remember(key) { keys.set(key, await db.setting.findUnique({ where: { key } })); }
async function main() {
    try {
        for (const key of ['server-panel.downloads.v1', 'extension.server-panel.state.v1'])
            await remember(key);
        await db.setting.upsert({ where: { key: 'extension.server-panel.state.v1' }, create: { key: 'extension.server-panel.state.v1', value: '{"enabled":true,"settings":{}}' }, update: { value: '{"enabled":true,"settings":{}}' } });
        assert.equal(await db.downloadJob.count({ where: { status: { in: ['queued', 'running'] } } }), 0, 'test database has unfinished jobs');
        await fsp.mkdir(work, { recursive: true });
        await fsp.mkdir(dir, { recursive: true });
        const user = await db.user.create({ data: { email: stamp + '@example.invalid', name: 'owned archive fixture', role: 'ADMIN', passwordHash: 'owned', totpEnabledAt: new Date() } });
        users.push(user.id);
        const authority = { id: user.id, authAt: Date.now(), ip: '127.0.0.1' }, svc = load('src/modules/server-panel/server/downloads.ts'), lib = load('src/modules/media/server/library.ts'), tools = await svc.archiveTools();
        assert.ok(tools.sevenZip, '7zz is required for connected archive checks');
        assert.ok(tools.rar, 'RAR writer is required for the full connected check');
        const input = path.join(work, 'input');
        await fsp.mkdir(path.join(input, 'docs'), { recursive: true });
        await fsp.writeFile(path.join(input, 'docs/readme.txt'), 'original text');
        await fsp.writeFile(path.join(input, 'delete.txt'), 'delete');
        await fsp.writeFile(path.join(input, 'rename.txt'), 'rename');
        const password = 'owned archive password', replacement = path.join(dir, stamp + '-replacement.txt');
        await fsp.writeFile(replacement, 'replacement bytes');
        const replacementAsset = await lib.registerLocalAsset('/files' + relative(replacement), user.id);
        assets.push(replacementAsset.id);
        for (const format of ['zip', 'rar']) {
            const file = path.join(dir, stamp + '.' + format);
            tool(format === 'zip' ? tools.sevenZip : tools.rar, format === 'zip' ? ['a', '-tzip', '-mem=AES256', '-p' + password, file, './docs', './delete.txt', './rename.txt'] : ['a', '-r', '-hp' + password, file, './docs', './delete.txt', './rename.txt'], input);
            const original = hash(file), listing = await svc.listArchive('local', relative(file), password);
            assert.equal(listing.needsPassword, false);
            assert.equal(listing.files, 3);
            assert.equal((await svc.listArchive('local', relative(file), 'wrong')).needsPassword, true);
            assert.equal((await svc.readArchiveText('local', relative(file), 'docs/readme.txt', password)).content, 'original text');
            await assert.rejects(() => svc.queueArchive({ op: 'repack', storage: 'local', path: relative(file), password, format, stamp: 'stale', newPassword: '' }, user.id), /تغییر/);
            const requested = await svc.queueArchive({ op: 'repack', storage: 'local', path: relative(file), password, newPassword: password, format, replace: true, stamp: listing.stamp, authority, edits: [{ op: 'delete', path: 'delete.txt' }, { op: 'rename', path: 'rename.txt', to: 'renamed.txt' }, { op: 'text', path: 'docs/readme.txt', text: 'edited text' }, { op: 'asset', path: 'added.txt', assetId: replacementAsset.id }] }, user.id);
            jobs.push(requested.id);
            assert.equal(requested.params.includes(password), false, 'password must not be persisted');
            const completed = await finished(requested.id);
            assert.equal(completed.status, 'done', completed.error);
            assert.notEqual(completed.result, relative(file));
            assert.equal(hash(file), original, 'source archive bytes must remain unchanged');
            const local = path.join(root, completed.result), result = await svc.listArchive('local', completed.result, password);
            assert.equal(result.needsPassword, false);
            assert.equal(result.files, 3);
            assert.equal((await svc.readArchiveText('local', completed.result, 'docs/readme.txt', password)).content, 'edited text');
            assert.equal((await svc.readArchiveText('local', completed.result, 'added.txt', password)).content, 'replacement bytes');
            assert.ok(result.entries.some(e => e.path === 'renamed.txt'));
            assert.ok(!result.entries.some(e => e.path === 'delete.txt'));
            assert.ok(await db.mediaAsset.findFirst({ where: { createdById: user.id, key: path.relative(root, local).split(path.sep).join('/') } }), 'new archive output must join shared catalog');
            const remove = await svc.queueArchive({ op: 'repack', storage: 'local', path: relative(file), password, newPassword: '', format, replace: false, authority }, user.id);
            jobs.push(remove.id);
            const clear = await finished(remove.id);
            assert.equal(clear.status, 'done', clear.error);
            assert.equal((await svc.listArchive('local', clear.result, '')).encrypted, false);
            assert.equal(hash(file), original);
            console.log(format.toUpperCase() + ': real encrypted archive inspect/text read/edit/delete/rename/library replacement/password removal/verified output/catalog and original preservation passed');
        }
        const local = path.join(dir, stamp + '-plain.zip');
        tool(tools.sevenZip, ['a', '-tzip', local, './docs'], input);
        const runner = globalThis.__mobocomDownloads;
        assert.ok(runner);
        runner.pumping = true;
        const lost = await svc.queueArchive({ op: 'repack', storage: 'local', path: relative(local), format: 'zip', newPassword: 'never persist this output password', authority }, user.id);
        jobs.push(lost.id);
        assert.equal(JSON.parse(lost.params).needsSecrets, true);
        runner.secrets.delete(lost.id);
        await db.downloadJob.update({ where: { id: lost.id }, data: { status: 'failed' } });
        runner.pumping = false;
        await assert.rejects(() => svc.retryJob(lost.id), /دوباره/);
        runner.pumping = true;
        const revoked = await svc.queueArchive({ op: 'repack', storage: 'local', path: relative(local), format: 'zip', newPassword: '', authority }, user.id);
        jobs.push(revoked.id);
        await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
        await db.downloadJob.update({ where: { id: revoked.id }, data: { status: 'failed' } });
        runner.pumping = false;
        await svc.retryJob(revoked.id);
        const denied = await finished(revoked.id);
        assert.equal(denied.status, 'failed');
        assert.match(denied.error, /اختیار/);
        await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
        const { changeDownloadSettings } = load('src/modules/server-panel/server/downloads/settings.ts');
        const key = 'server-panel.downloads.v1';
        await db.setting.upsert({ where: { key }, create: { key, value: '{}' }, update: { value: '{}' } });
        await Promise.all([changeDownloadSettings(c => ({ ...c, localBaseUrl: 'https://downloads.example.invalid' })), changeDownloadSettings(c => ({ ...c, sentinel: stamp }))]);
        const config = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key } })).value);
        assert.equal(config.localBaseUrl, 'https://downloads.example.invalid');
        assert.equal(config.sentinel, stamp);
        await db.setting.update({ where: { key }, data: { value: 'invalid-json' } });
        await assert.rejects(() => svc.setLocalBaseUrl('https://must-not-reset.invalid'), /خوانده نشد/);
        assert.equal((await db.setting.findUniqueOrThrow({ where: { key } })).value, 'invalid-json');
        const unsafe = path.join(dir, stamp + '-unsafe.zip');
        const link = path.join(input, 'link');
        await fsp.symlink('../outside', link);
        tool(tools.sevenZip, ['a', '-tzip', '-snl', unsafe, './link'], input);
        await assert.rejects(() => load('src/modules/server-panel/server/downloads/archive-content.ts').materializeArchive(unsafe, path.join(work, 'unsafe'), ' ', tools.sevenZip, async (file, args) => { const r = cp.spawnSync(file, args, { encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout }; }, new AbortController().signal, async () => { }), /لینک|مسیر|معتبر/);
        const traversal = path.join(dir, stamp + '-traversal.zip');
        await fsp.writeFile(traversal, require('./fixtures/archive-zip.cjs').zipEntry('../archive-escape.txt', 'must stay unextracted'));
        await assert.rejects(() => load('src/modules/server-panel/server/downloads/archive-content.ts').materializeArchive(traversal, path.join(work, 'target'), '', tools.sevenZip, async (file, args) => { const r = cp.spawnSync(file, args, { encoding: 'utf8' }); return { ok: r.status === 0, out: r.stdout }; }, new AbortController().signal, async () => {}), /مسیر/);
        assert.equal(fs.existsSync(path.join(work, 'archive-escape.txt')), false);
        console.log('Current actor denial, restart-lost output secret refusal, stale listing, real symlink archive refusal and concurrent/failing Settings merges passed');
    }
    finally {
        const runner = globalThis.__mobocomDownloads;
        const ownedJobs = await db.downloadJob.findMany({ where: { createdBy: { in: users } }, select: { id: true } });
        for (const job of ownedJobs) if (!jobs.includes(job.id)) jobs.push(job.id);
        if (runner) {
            runner.pumping = false;
            for (const id of jobs)
                runner.running.get(id)?.abort();
            for (const id of jobs)
                runner.secrets.delete(id);
        }
        if (runner)
            for (let i = 0; i < 100 && jobs.some(id => runner.running.has(id)); i++)
                await delay(20);
        await db.downloadJob.deleteMany({ where: { id: { in: jobs } } });
        await db.mediaAsset.deleteMany({ where: { createdById: { in: users } } });
        await db.user.deleteMany({ where: { id: { in: users }, email: { startsWith: stamp } } });
        for (const [key, row] of keys) {
            if (row)
                await db.setting.upsert({ where: { key }, create: row, update: { value: row.value } });
            else
                await db.setting.deleteMany({ where: { key } });
        }
        for (const name of await fsp.readdir(dir).catch(() => []))
            if (name.startsWith(stamp))
                await fsp.rm(path.join(dir, name), { force: true });
        assert.ok(path.resolve(work).startsWith(path.resolve(root) + path.sep));
        await fsp.rm(work, { recursive: true, force: true });
        await db.$disconnect();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
