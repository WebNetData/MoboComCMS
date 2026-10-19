const assert = require('node:assert/strict'), fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript-api'), { PrismaClient } = require('@prisma/client'), fixtures = require('./fixtures/media-storage.cjs');
assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/mobocom_media_/);
assert.ok(process.env.DOWNLOADS_ROOT?.startsWith('/tmp/'));
process.env.NEXTAUTH_SECRET ||= 'owned-storage-fixture-not-production';
process.env.SERVER_PANEL_ENABLED = 'true';
const db = new PrismaClient(), cache = new Map(), repo = path.resolve(__dirname, '..'), mocks = { '@/platform/database/prisma': { db } };
function load(relative) { const file = path.resolve(repo, relative); if (cache.has(file))
    return cache.get(file).exports; const mod = { exports: {} }; cache.set(file, mod); new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => { if (Object.hasOwn(mocks, name))
    return mocks[name]; if (name.startsWith('@/') || name.startsWith('.')) {
    const base = name.startsWith('@/') ? path.join(repo, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
    if (base.endsWith('.json'))
        return require(base);
    for (const ext of ['.ts', '.tsx', '/index.ts'])
        if (fs.existsSync(base + ext))
            return load(path.relative(repo, base + ext));
} return require(name); }, mod, mod.exports); return mod.exports; }
const stamp = 'owned-storage-' + Date.now(), root = process.env.DOWNLOADS_ROOT, work = path.join(root, '.incoming', stamp), key = 'server-panel.downloads.v1', servers = [];
let original, user;
const delay = ms => new Promise(r => setTimeout(r, ms));
async function done(id) { for (let i = 0; i < 500; i++) {
    const j = await db.downloadJob.findUniqueOrThrow({ where: { id } });
    if (!['queued', 'running'].includes(j.status))
        return j;
    await delay(50);
} throw Error('transfer fixture timed out'); }
async function main() {
    try {
        original = await db.setting.findUnique({ where: { key } });
        assert.equal(await db.downloadJob.count({ where: { status: { in: ['queued', 'running'] } } }), 0);
        await db.setting.upsert({ where: { key }, create: { key, value: '{}' }, update: { value: '{}' } });
        await fsp.mkdir(work, { recursive: true });
        user = await db.user.create({ data: { email: stamp + '@example.invalid', name: stamp, role: 'ADMIN', passwordHash: 'owned', totpEnabledAt: new Date() } });
        const svc = load('src/modules/server-panel/server/downloads.ts'), req = { headers: new Headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }), nextUrl: new URL('http://localhost:3000/api/admin/server/downloads') }, context = { req, actor: { id: user.id, email: user.email, role: 'ADMIN' } };
        for (const kind of ['sftp', 'ftp']) {
            const fixtureRoot = path.join(work, kind), publicRoot = path.join(fixtureRoot, 'public');
            await fsp.mkdir(publicRoot, { recursive: true });
            await fsp.writeFile(path.join(publicRoot, 'original.txt'), 'remote original');
            const password = crypto.randomBytes(18).toString('hex'), server = await fixtures[kind](fixtureRoot, password);
            servers.push(server);
            const input = { kind, name: stamp + kind, host: '127.0.0.1', port: server.port, username: 'fixture', secret: password, root: '/public', baseUrl: 'https://' + kind + '.example.invalid' }, saved = await svc.saveStorage(input, context);
            assert.equal(saved.kind, kind);
            assert.equal(saved.hasSecret, true);
            assert.equal(Object.hasOwn(saved, 'secret'), false);
            const stored = JSON.parse((await db.setting.findUniqueOrThrow({ where: { key } })).value).storages.find(s => s.id === saved.id);
            assert.notEqual(stored.secret, password);
            assert.ok(!JSON.stringify(await svc.downloadsOverview()).includes(password));
            assert.ok((await svc.testStorage(saved.id)).entries >= 1);
            const list = await svc.listFiles(saved.id, '/');
            assert.ok(list.entries.some(e => e.name === 'original.txt' && e.url === 'https://' + kind + '.example.invalid/original.txt'));
            assert.equal((await svc.readTextFile(saved.id, '/original.txt')).content, 'remote original');
            await assert.rejects(() => svc.listFiles(saved.id, '../../etc'), /مسیر/);
            const upload = path.join(work, kind + '-upload.txt');
            await fsp.writeFile(upload, 'uploaded bytes');
            assert.deepEqual((await svc.storeUploads(saved.id, '/', [{ temp: upload, name: 'upload.txt' }])).saved, ['/upload.txt']);
            assert.equal((await svc.readTextFile(saved.id, '/upload.txt')).content, 'uploaded bytes');
            await svc.renamePath(saved.id, '/upload.txt', 'renamed.txt');
            assert.ok((await svc.listFiles(saved.id, '/')).entries.some(e => e.name === 'renamed.txt'));
            const updated = await svc.saveStorage({ ...input, id: saved.id, name: stamp + kind + ' edited', secret: '' }, context);
            assert.equal(updated.hasSecret, true);
            assert.ok((await svc.testStorage(saved.id)).entries >= 2);
            await svc.queueTransfer({ from: saved.id, paths: ['/renamed.txt'], to: 'local', dir: '/uploads/general/' + new Date().toISOString().slice(0, 7) + '/' + stamp }, user.id, { id: user.id, authAt: Date.now(), ip: '127.0.0.1' });
            const job = await db.downloadJob.findFirstOrThrow({ where: { createdBy: user.id }, orderBy: { id: 'desc' } }), result = await done(job.id);
            assert.equal(result.status, 'done', result.error);
            assert.equal(await fsp.readFile(path.join(root, result.result), 'utf8'), 'uploaded bytes');
            assert.ok((await svc.listFiles(saved.id, '/')).entries.some(e => e.name === 'renamed.txt'), 'copy must retain remote source');
            await svc.deletePaths(saved.id, ['/renamed.txt']);
            assert.ok(!(await svc.listFiles(saved.id, '/')).entries.some(e => e.name === 'renamed.txt'));
            await svc.removeStorage(saved.id, context);
            assert.ok(fs.existsSync(path.join(publicRoot, 'original.txt')), 'disconnect must preserve remote bytes');
            console.log(kind.toUpperCase() + ': real authenticated TCP list/read/upload/rename/copy-to-local, public URL reuse, encrypted/redacted/retained credentials, disconnect preservation passed');
        }
        const before = (await db.setting.findUniqueOrThrow({ where: { key } })).value, audit = load('src/platform/audit/server.ts'), real = audit.auditAdminStrict;
        audit.auditAdminStrict = async () => { throw Error('owned strict audit failure'); };
        try {
            await assert.rejects(() => svc.setLocalBaseUrl('https://must-rollback.invalid', context), /audit/);
            assert.equal((await db.setting.findUniqueOrThrow({ where: { key } })).value, before);
        }
        finally {
            audit.auditAdminStrict = real;
        }
        console.log('Storage configuration strict audit failure rolls back the aggregate transaction');
    }
    finally {
        for (const server of servers)
            await server.close();
        if (user) {
            await db.mediaAsset.deleteMany({ where: { createdById: user.id } });
            await db.downloadJob.deleteMany({ where: { createdBy: user.id } });
            await db.auditLog.deleteMany({ where: { actorUserId: user.id } });
            await db.user.deleteMany({ where: { id: user.id, email: { startsWith: stamp } } });
        }
        if (original)
            await db.setting.upsert({ where: { key }, create: original, update: { value: original.value } });
        else
            await db.setting.deleteMany({ where: { key } });
        const copied = path.join(root, 'uploads/general', new Date().toISOString().slice(0, 7), stamp);
        assert.ok(path.resolve(copied).startsWith(path.resolve(root) + path.sep));
        await fsp.rm(copied, { recursive: true, force: true });
        assert.ok(path.resolve(work).startsWith(path.resolve(root) + path.sep));
        await fsp.rm(work, { recursive: true, force: true });
        await db.$disconnect();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
