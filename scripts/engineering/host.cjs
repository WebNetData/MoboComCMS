#!/usr/bin/env node
const p = require('./protocol.cjs'), w = require('./workspace.cjs'), d = require('./deployment.cjs'), { fs, path, ROOT, TOOLS, check, state, writeState, command } = p;
const actions = ['status', 'prepare', 'read', 'apply', 'validate', 'poll', 'publish', 'promote', 'rollback', 'cancel', 'diagnose', 'repair', 'reopen'];
function start(c, action, id) {
    const row = state(id);
    check(row, 'Unknown workspace');
    const phase = { publish: 'publishing', promote: 'promoting', rollback: 'rolling-back', repair: 'repairing' }[action], before = { publish: ['validated'], promote: ['published'], rollback: ['deployed'], repair: ['diagnosed'] }[action];
    if (row.phase === phase || ['publish:published', 'promote:deployed', 'promote:rolled-back', 'rollback:rolled-back', 'repair:repaired'].includes(action + ':' + row.phase))
        return w.publicReceipt(row);
    check(before.includes(row.phase), 'Stage is not ready for this operation');
    if (action !== 'publish') {
        const proof = d.approval(c, id, action);
        check(action === 'repair' ? proof.diagnosticHash === row.diagnosticHash && proof.runtimeId === row.runtimeId : proof.artifact === row.artifact && proof.headSha === row.headSha, 'Exact approved artifact required');
        if (row.lastFailureAt && row.attemptApprovedAt === proof.approvedAt)
            return w.publicReceipt(row);
        row.attemptApprovedAt = proof.approvedAt;
        delete row.lastFailureAt;
    }
    row.phase = phase;
    writeState(id, row);
    try {
        command('/usr/bin/systemd-run', ['--quiet', '--collect', '--unit', 'mobocom-ai-' + action + '-' + id, '--property', 'UMask=0077', '/usr/bin/node', path.join(TOOLS, 'host-job.cjs'), action, id]);
    }
    catch (e) {
        row.phase = before[0];
        writeState(id, row);
        throw e;
    }
    return w.publicReceipt(row);
}
async function dispatch(c, action, input) {
    check(input.protocol === 1 && actions.includes(action), 'Invalid host protocol/action');
    if (action === 'status') {
        let ready = true;
        try {
            for (const image of [c.dependencyImage, c.postgresImage])
                w.docker(['image', 'inspect', image]);
            p.owned(path.join(TOOLS, 'worker.cjs'));
            check(command('/usr/bin/systemctl', ['is-active', 'mobocom-ai-engineering-worker']) === 'active', 'Independent worker is not active');
        }
        catch {
            ready = false;
        }
        return { ready, supported: true, knowledgeProtocol: 2, phase: d.active().id === 'native' ? 'native' : 'managed', diagnostics: ready ? 'محیط جدا و worker مستقل آماده‌اند؛ انتشار نیاز به مرج و تأیید دارد.' : 'تصویرهای ثابت و worker مستقل باید طبق راهنما آماده و فعال شوند.' };
    }
    p.runId(input.runId);
    if (action === 'diagnose')
        return require('./repair.cjs').diagnose(c, input);
    if (action === 'poll') {
        const current = state(input.runId);
        if (current && current.phase !== 'validating')
            return w.publicReceipt(current);
    }
    if (['publish', 'promote', 'rollback', 'repair'].includes(action)) {
        const current = state(input.runId);
        if (current && ['publishing', 'published', 'promoting', 'deployed', 'rolling-back', 'rolled-back', 'repairing', 'repaired', 'failed'].includes(current.phase)) {
            const starts = action === 'promote' && current.phase === 'published' || action === 'rollback' && current.phase === 'deployed' || action === 'repair' && current.phase === 'diagnosed';
            if (!starts)
                return w.publicReceipt(current);
        }
    }
    return p.asyncLock(input.runId, async () => {
        if (['publish', 'promote', 'rollback', 'repair'].includes(action))
            return start(c, action, input.runId);
        return action === 'validate' ? p.asyncLock('validation-start', () => w.validate(c, input)) : w[action](c, input);
    });
}
async function main() {
    check(process.getuid?.() === 0, 'Use the root-installed broker');
    const action = process.argv[2];
    let raw = '';
    for await (const chunk of process.stdin) {
        raw += chunk;
        check(Buffer.byteLength(raw) <= 512 * 1024, 'Request too large');
    }
    const input = JSON.parse(raw || '{}'), c = p.config();
    return dispatch(c, action, input);
}
if (require.main === module)
    main().then(receipt => process.stdout.write(JSON.stringify({ protocol: 1, ok: true, ...receipt }) + '\n')).catch(e => { const status = process.argv[2] === 'status'; process.stdout.write(JSON.stringify({ protocol: 1, ok: status, ready: false, supported: true, ...(status ? { diagnostics: p.redact(e.message) } : { error: p.redact(e.message) }) }) + '\n'); });
module.exports = { dispatch, start, actions };
