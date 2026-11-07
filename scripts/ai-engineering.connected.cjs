const assert = require('node:assert/strict'), crypto = require('node:crypto'), { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server'), { encode } = require('next-auth/jwt'), sourceLoader = require('./connected-source-loader.cjs'), db = new PrismaClient();
const stamp = 'owned-ai-engineering-' + Date.now(), users = [], runs = [], backup = new Map(), prior = {}, keys = ['ai.engineering.v1', 'ai.routing.v1', 'ai.config.v1', 'ai.credentials.v1', 'ai.credentials.health.v1', 'extension.ai-assistant.state.v1', 'extension.server-panel.state.v1', 'security.policy.v1'];
let hostProtocol = 2, failAudit = false, planCalls = 0, hostCalls = [], phase = new Map(), rawAudit, secret;
async function main() {
    try {
        for (const key of ['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'PANEL_CREDENTIAL_KEY', 'SERVER_PANEL_ENABLED', 'SERVER_PANEL_ALLOWED_IPS'])
            prior[key] = process.env[key];
        secret = crypto.randomBytes(32).toString('hex');
        process.env.NEXTAUTH_SECRET = secret;
        process.env.NEXTAUTH_URL = 'https://owned.test';
        process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex');
        process.env.SERVER_PANEL_ENABLED = 'true';
        delete process.env.SERVER_PANEL_ALLOWED_IPS;
        for (const key of keys) {
            backup.set(key, await db.setting.findUnique({ where: { key } }));
            await db.setting.deleteMany({ where: { key } });
        }
        for (const role of ['ADMIN', 'ADMIN', 'USER'])
            users.push(await db.user.create({ data: { email: stamp + '-' + users.length + '@invalid.test', name: stamp, passwordHash: 'owned-password-hash', role, status: 'ACTIVE' } }));
        let nextPlan = () => ({ summary: 'Inspect canonical owner', reads: ['src/modules/store/server/owned.ts', 'docs/agent/ARCHITECTURE.md'], edits: [], done: false }), fakeSource = 'export const owned = 1\n';
        const fakeHost = async (action, input = {}) => {
            hostCalls.push({ action, id: input.runId });
            const id = input.runId;
            if (action === 'status')
                return { ok: true, ready: true, supported: true, knowledgeProtocol: hostProtocol };
            if (action === 'prepare') {
                phase.set(id, 'developing');
                return { phase: 'developing', baseSha: 'a'.repeat(40), manifest: ['src/modules/store/server/owned.ts'] };
            }
            if (action === 'read')
                return { files: input.paths.map(path => ({ path, content: fakeSource, sha256: crypto.createHash('sha256').update(fakeSource).digest('hex') })) };
            if (action === 'apply')
                return { changed: input.edits.map(edit => edit.path) };
            if (action === 'validate') {
                phase.set(id, 'validating');
                return { phase: 'validating' };
            }
            if (action === 'poll')
                return { phase: phase.get(id) === 'validating' ? 'validated' : phase.get(id), diagnosticHash: 'd'.repeat(64), runtimeId: 'native', artifact: 'b'.repeat(64), checks: [{ name: 'owned isolated build', passed: true }] };
            if (action === 'publish') {
                phase.set(id, 'published');
                return { phase: 'published', headSha: 'c'.repeat(40), artifact: 'b'.repeat(64), prUrl: 'https://github.com/WebNetData/MoboComCMS/pull/999999', checks: [{ name: 'owned isolated build', passed: true }] };
            }
            if (action === 'promote') {
                phase.set(id, 'deployed');
                return { phase: 'deployed', headSha: 'c'.repeat(40), artifact: 'b'.repeat(64) };
            }
            if (action === 'rollback') {
                phase.set(id, 'rolled-back');
                return { phase: 'rolled-back', headSha: 'c'.repeat(40), artifact: 'b'.repeat(64) };
            }
            if (action === 'cancel') {
                phase.set(id, 'cancelled');
                return { phase: 'cancelled' };
            }
            if (action === 'diagnose') {
                phase.set(id, 'diagnosed');
                return { diagnostics: 'synthetic runtime stopped, memory available', allowedRepairs: ['start-current-runtime'], diagnosticHash: 'd'.repeat(64), runtimeId: 'native' };
            }
            if (action === 'repair') {
                phase.set(id, 'repaired');
                return { phase: 'repaired', repairId: 'start-current-runtime', diagnosticHash: 'd'.repeat(64), runtimeId: 'native' };
            }
            throw Error('Unexpected host action ' + action);
        };
        const load = sourceLoader({ '@/platform/database/prisma': { db }, '@/platform/cache/kv': { cached: async (k, t, fn) => fn(), invalidate: async () => { } }, '@/platform/audit/server': { auditAdminStrict: (...args) => {
                    if (failAudit)
                        throw Error('owned audit refusal');
                    return rawAudit.auditAdminStrict(...args);
                }, auditSystemStrict: (...args) => {
                    if (failAudit)
                        throw Error('owned audit refusal');
                    return rawAudit.auditSystemStrict(...args);
                } }, '@/modules/ai/server/engineering/host': { engineeringHost: fakeHost }, '@/modules/social/server/egress': { egressRoute: async () => 'direct', egressFetch: async () => { planCalls++; return Response.json({ choices: [{ message: { content: JSON.stringify(nextPlan()) } }] }); } } });
        // Relative imports use the same actual module, replacing only its external host boundary.
        const host = load('src/modules/ai/server/engineering/host.ts');
        host.engineeringHost = fakeHost;
        rawAudit = load('src/platform/audit/server.ts');
        const service = load('src/modules/ai/server/engineering/service.ts'), policy = load('src/modules/ai/server/engineering/policy.ts'), domain = load('src/modules/ai/domain/engineering.ts'), gate = load('src/modules/server-panel/server/gate.ts'), worker = load('src/modules/ai/server/engineering/worker.ts'), http = load('src/modules/ai/server/http/engineering.ts'), routing = load('src/modules/ai/server/routing.ts'), authAt = Date.now() - 10000;
        async function request(user = users[0], body, unlock = true, origin = true) { const jwt = await encode({ secret, token: { uid: user.id, role: user.role, authAt }, maxAge: 3600 }), panel = gate.unlockToken(user.id, user.passwordHash, '127.0.0.1', 15).value; return new NextRequest('https://owned.test/api/admin/server/engineering', { method: body ? 'POST' : 'GET', headers: { Host: 'owned.test', 'x-forwarded-for': '127.0.0.1', Cookie: '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt + (unlock ? '; mc_srv=' + panel : ''), ...(origin ? { Origin: 'https://owned.test' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
        const req = await request(), audit = { req, actor: { id: users[0].id, email: users[0].email }, action: 'ai.engineering.fixture', targetType: 'setting', targetId: stamp };
        let base = domain.defaultEngineeringPolicy();
        await policy.saveEngineeringPolicy({ ...base, enabled: true }, audit);
        base = await policy.readEngineeringPolicy();
        assert.equal((await http.GET(await request(users[2]))).status, 403, 'canonical customer denial');
        assert.equal((await http.GET(await request(users[0], undefined, false))).status, 401, 'canonical unlock required');
        assert.equal((await http.POST(await request(users[0], { action: 'request' }, true, false))).status, 403, 'Origin required');
        const changes = await Promise.allSettled([policy.saveEngineeringPolicy({ ...base, maxSteps: 3 }, audit), policy.saveEngineeringPolicy({ ...base, maxSteps: 5 }, audit)]);
        assert.equal(changes.filter(r => r.status === 'fulfilled').length, 1, 'one revision wins');
        base = await policy.readEngineeringPolicy();
        const oldValue = (await db.setting.findUnique({ where: { key: 'ai.engineering.v1' } })).value;
        failAudit = true;
        await assert.rejects(policy.saveEngineeringPolicy({ ...base, maxSteps: 4 }, audit));
        failAudit = false;
        assert.equal((await db.setting.findUnique({ where: { key: 'ai.engineering.v1' } })).value, oldValue, 'audit failure rolls back settings');
        await routing.saveAiRoute('engineering', { source: 'api', config: { provider: 'gemini', apiKey: 'owned-fixture-only', model: 'owned-engineer' } }, audit);
        async function create(extra = {}) { const input = { action: 'request', requestId: crypto.randomUUID(), instruction: 'Implement owned store feature without touching live data', mode: 'DEVELOP', skillIds: [], ...extra }; const before = await db.aiEngineeringRun.count(); await service.createEngineeringRun(req, input); const row = await db.aiEngineeringRun.findUnique({ where: { requestKey: users[0].id + ':' + input.requestId } }); assert(row); runs.push(row.id); assert.equal(await db.aiEngineeringRun.count(), before + 1); return { input, row }; }
        hostProtocol = 1;assert.equal((await service.engineeringView(req)).host.ready,false,'old host is not advertised ready');await assert.rejects(create(),e=>e.status===409);hostProtocol=2;
        let current = await create();
        await service.createEngineeringRun(req, current.input);
        assert.equal(await db.aiEngineeringRun.count(), 1, 'request replay does not enqueue twice');
        await assert.rejects(service.createEngineeringRun(req, { ...current.input, instruction: 'different instruction' }), /شناسه/);
        assert.equal((await service.engineeringView(await request(users[1]))).runs.length, 0, 'other admin cannot list private run');
        await assert.rejects(service.decideEngineeringRun(await request(users[1]), { action: 'cancel', id: current.row.id, revision: 0 }), /حساب/);
        await worker.runEngineeringStep({ runId: current.row.id });
        await worker.runEngineeringStep({ runId: current.row.id });
        nextPlan = () => ({ summary: 'Implemented typed owned feature', reads: [], edits: [{ path: 'src/modules/store/server/owned.ts', before: crypto.createHash('sha256').update(fakeSource).digest('hex'), content: 'export const owned = 2\n' }, { path: 'docs/agent/ARCHITECTURE.md', before: crypto.createHash('sha256').update(fakeSource).digest('hex'), content: 'Store owns the new typed feature; existing data and rollback are preserved.\n' }], done: true });
        await worker.runEngineeringStep({ runId: current.row.id });
        await worker.runEngineeringStep({ runId: current.row.id });
        await worker.runEngineeringStep({ runId: current.row.id });
        let row = await db.aiEngineeringRun.findUnique({ where: { id: current.row.id } });
        assert.equal(row.status, 'PR_OPEN', 'native owner sequence reaches reviewed PR');
        assert.equal(hostCalls.filter(c => c.action === 'validate').length, 1, 'one build per unchanged run');
        assert.equal(planCalls, 2, 'bounded lazy context uses two model calls');
        await assert.rejects(service.decideEngineeringRun(req, { action: 'promote', id: row.id, revision: row.revision, artifact: row.result.artifact, approved: false }), /تأیید/);
        const result = JSON.parse(row.result);
        await assert.rejects(service.decideEngineeringRun(req, { action: 'promote', id: row.id, revision: row.revision, artifact: 'wrong', headSha: result.headSha, approved: true }), /تأیید/);
        await service.decideEngineeringRun(req, { action: 'promote', id: row.id, revision: row.revision, artifact: result.artifact, headSha: result.headSha, approved: true });
        await worker.runEngineeringStep({ runId: row.id });
        row = await db.aiEngineeringRun.findUnique({ where: { id: row.id } });
        assert.equal(row.status, 'DEPLOYED');
        await service.decideEngineeringRun(req, { action: 'rollback', id: row.id, revision: row.revision, artifact: result.artifact, headSha: result.headSha, approved: true });
        await worker.runEngineeringStep({ runId: row.id });
        assert.equal((await db.aiEngineeringRun.findUnique({ where: { id: row.id } })).status, 'ROLLED_BACK');
        current = await create();
        const callsBefore = hostCalls.length;
        await db.user.update({ where: { id: users[0].id }, data: { status: 'SUSPENDED' } });
        await worker.runEngineeringStep({ runId: current.row.id });
        assert.equal(hostCalls.length, callsBefore, 'revocation stops before host access');
        assert.equal((await db.aiEngineeringRun.findUnique({ where: { id: current.row.id } })).status, 'FAILED');
        await db.user.update({ where: { id: users[0].id }, data: { status: 'ACTIVE' } });
        current = await create();
        await service.decideEngineeringRun(req, { action: 'cancel', id: current.row.id, revision: 0 });
        const cancelledCalls = hostCalls.length;
        await worker.runEngineeringStep({ runId: current.row.id });
        assert.equal(hostCalls.length, cancelledCalls, 'cancelled work cannot resume');
        current = await create();
        await db.user.update({ where: { id: users[0].id }, data: { passwordChangedAt: new Date(Date.now() - 2000) } });
        const passwordCalls = hostCalls.length;
        await worker.runEngineeringStep({ runId: current.row.id });
        assert.equal(hostCalls.length, passwordCalls, 'password reset revokes captured engineering authority');
        await db.user.update({ where: { id: users[0].id }, data: { passwordChangedAt: null } });
        current = await create({ mode: 'REPAIR', instruction: 'Diagnose and propose the fixed recovery of a stopped runtime' });
        nextPlan = () => ({ repairId: 'start-current-runtime', reason: 'The synthetic current runtime is stopped; propose only starting that exact runtime.' });
        const repairsBefore = hostCalls.filter(c => c.action === 'repair').length;
        await worker.runEngineeringStep({ runId: current.row.id });
        row = await db.aiEngineeringRun.findUnique({ where: { id: current.row.id } });
        assert.equal(row.status, 'REPAIR_READY');
        assert.equal(hostCalls.filter(c => c.action === 'repair').length, repairsBefore, 'no server action before approval');
        let repairResult = JSON.parse(row.result);
        await assert.rejects(service.decideEngineeringRun(req, { action: 'repair', id: row.id, revision: row.revision, approved: true, repairId: repairResult.repairId, runtimeId: repairResult.runtimeId, diagnosticHash: 'wrong' }), /تأیید/);
        await service.decideEngineeringRun(req, { action: 'repair', id: row.id, revision: row.revision, approved: true, ...repairResult });
        await worker.runEngineeringStep({ runId: row.id });
        assert.equal((await db.aiEngineeringRun.findUnique({ where: { id: row.id } })).status, 'REPAIRED');
        await db.aiEngineeringRun.updateMany({ where: { id: row.id, status: 'REPAIRED' }, data: { status: 'REPAIR_QUEUED' } });
        await db.user.update({ where: { id: users[0].id }, data: { status: 'SUSPENDED' } });
        const repairCalls = hostCalls.filter(c => c.action === 'repair').length;
        await worker.reconcileEngineeringRuns();
        assert.equal((await db.aiEngineeringRun.findUnique({ where: { id: row.id } })).status, 'REPAIRED', 'completed host fact is reconciled after revocation without granting another action');
        assert.equal(hostCalls.filter(c => c.action === 'repair').length, repairCalls);
        await db.user.update({ where: { id: users[0].id }, data: { status: 'ACTIVE' } });
        base = await policy.readEngineeringPolicy();
        await policy.saveEngineeringPolicy({ ...base, maxSteps: 1 }, audit);
        current = await create();
        nextPlan = () => ({ summary: 'Need one bounded owner read', reads: ['src/modules/store/server/owned.ts'], edits: [], done: false });
        const modelBefore = planCalls;
        await worker.runEngineeringStep({ runId: current.row.id });
        await worker.runEngineeringStep({ runId: current.row.id });
        await worker.runEngineeringStep({ runId: current.row.id });
        assert.equal(planCalls - modelBefore, 1, 'model call budget cannot be exceeded');
        assert.equal((await db.aiEngineeringRun.findUnique({ where: { id: current.row.id } })).status, 'FAILED');
        base = await policy.readEngineeringPolicy();
        await policy.saveEngineeringPolicy({ ...base, maxSteps: 4 }, audit);
        current = await create();
        base = await policy.readEngineeringPolicy();
        await policy.saveEngineeringPolicy({ ...base, enabled: false }, audit);
        const disabledCalls = hostCalls.length;
        await worker.runEngineeringStep({ runId: current.row.id });
        assert.equal(hostCalls.length, disabledCalls, 'disabled policy stops queued work before any host action');
        base = await policy.readEngineeringPolicy();
        await policy.saveEngineeringPolicy({ ...base, enabled: true }, audit);
        assert(await db.auditLog.count({ where: { actorUserId: users[0].id, action: 'ai.engineering.step' } }) > 0);
        console.log('PASS native engineering: canonical access/unlock/Origin, CAS/audit, one request/build, bounded provider, private history, exact approval, rollback, revocation/password reset cancellation, explicit repair, completed-fact reconciliation and model budgets');
    }
    finally {
        if (runs.length) {
            for (const id of runs)
                await db.backgroundJob.deleteMany({ where: { kind: 'ai.engineering', payload: { contains: id } } });
            await db.aiEngineeringRun.deleteMany({ where: { id: { in: runs } } });
        }
        await db.auditLog.deleteMany({ where: { actorUserId: { in: users.map(u => u.id) } } });
        for (const key of keys) {
            const old = backup.get(key);
            if (old)
                await db.setting.upsert({ where: { key }, create: { key, value: old.value }, update: { value: old.value } });
            else
                await db.setting.deleteMany({ where: { key } });
        }
        if (users.length)
            await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
        for (const [key, value] of Object.entries(prior))
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        await db.$disconnect();
    }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
