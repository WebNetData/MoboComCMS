const p = require('./protocol.cjs'), w = require('./workspace.cjs'), d = require('./deployment.cjs'), { fs, path, check, command } = p;
function identity(c, current) {
    let native = '';
    if (current.id === 'native') {
        try {
            native = fs.readFileSync(path.join(c.appDir, '.next', 'BUILD_ID'), 'utf8').trim();
        }
        catch {
            native = 'missing-build';
        }
    }
    return p.hash(JSON.stringify({ id: current.id, artifact: current.artifact || native, proxy: fs.readFileSync(c.proxyInclude, 'utf8') }));
}
function service(id) {
    try {
        return command('/usr/bin/systemctl', ['is-active', id]);
    }
    catch {
        return 'not-active';
    }
}
function nginxValid() {
    try {
        command('/usr/sbin/nginx', ['-t']);
        return true;
    }
    catch {
        return false;
    }
}
async function diagnose(c, input) {
    const existing = p.state(input.runId);
    if (existing) {
        check(existing.phase === 'diagnosed', 'Existing run cannot be replaced by diagnostics');
        return w.publicReceipt(existing);
    }
    const current = d.active(), allowedRepairs = [], syntax = nginxValid(), proxy = service('nginx');
    if (syntax)
        allowedRepairs.push(proxy === 'active' ? 'reload-proxy' : 'start-proxy');
    const runtime = require('./native-runtime.cjs').running(current) ? 'active' : 'not-active';
    if (runtime !== 'active' && runtime !== 'unknown')
        allowedRepairs.push('start-current-runtime');
    const ready = await d.healthy(current.port), row = { id: p.runId(input.runId), phase: 'diagnosed', diagnosticHash: identity(c, current), runtimeId: current.id, allowedRepairs, diagnostics: JSON.stringify({ runtime: current.id, readiness: ready, runtimeState: runtime, nginxState: proxy, nginxSyntax: syntax, availableMemoryMb: Math.floor(w.availableMemory()), freeDiskGb: Math.floor(Number(fs.statfsSync(p.ROOT).bavail) * Number(fs.statfsSync(p.ROOT).bsize) / 1024 ** 3), noActionExecuted: true }), createdAt: Date.now() };
    p.writeState(row.id, row);
    return w.publicReceipt(row);
}
async function repair(c, id) {
    const row = p.state(id);
    check(row && row.phase === 'repairing', 'No approved repair request');
    const proof = d.approval(c, id, 'repair'), current = d.active();
    check(row.diagnosticHash === proof.diagnosticHash && row.runtimeId === proof.runtimeId && current.id === row.runtimeId && identity(c, current) === row.diagnosticHash && row.allowedRepairs.includes(proof.repairId), 'Diagnostic changed; a new diagnosis/approval is required');
    const lock = path.join(c.storage, 'update', 'lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    try {
        fs.mkdirSync(lock);
    }
    catch {
        throw new Error('Existing update/restore holds the shared lock');
    }
    try {
        d.approval(c, id, 'repair');
        switch (proof.repairId) {
            case 'reload-proxy':
                check(nginxValid(), 'Invalid proxy configuration; no reload executed');
                command('/usr/bin/systemctl', ['reload', 'nginx']);
                break;
            case 'start-proxy':
                check(nginxValid(), 'Invalid proxy configuration; no start executed');
                command('/usr/bin/systemctl', ['start', 'nginx']);
                break;
            case 'start-current-runtime':
                check(w.availableMemory() >= c.runtimeMemoryMb + c.reserveMemoryMb, 'Live-site memory reserve must be retained');
                require('./native-runtime.cjs').start(c, current);
                break;
            default: throw new Error('Unknown repair runbook');
        }
        row.repairId = proof.repairId;
        row.phase = 'repaired';
        row.diagnostics = await d.healthy(current.port, 10) ? 'اقدام مشخص تأییدشده اجرا شد و آمادگی پایهٔ برنامه بررسی شد؛ کد، پیکربندی و داده‌ها تغییر نکردند.' : 'اقدام مشخص تأییدشده اجرا شد؛ آمادگی برنامه هنوز تأیید نشده و بررسی بیشتری لازم است. کد و داده‌ها تغییر نکردند.';
        p.writeState(id, row);
        return w.publicReceipt(row);
    }
    finally {
        fs.rmdirSync(lock);
    }
}
module.exports = { identity, diagnose, repair };
