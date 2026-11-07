const p = require('./protocol.cjs'), w = require('./workspace.cjs'), { fs, path, ROOT, TOOLS, check, state, writeState, command, save } = p;
const runtime = require('./native-runtime.cjs');
const ACTIVE = path.join(ROOT, 'active.json'), MARKER = '/run/mobocom-engineering/active.json';
function markRuntime(runtime, phase) {
    if (runtime.id === 'native')
        return;
    const row = state(runtime.id);
    if (row) {
        row.phase = phase;
        writeState(row.id, row);
    }
}
function freeSlot(port, except) {
    check([3101, 3102].includes(port), 'Only managed runtime ports can be freed');
    for (const id of fs.readdirSync(ROOT)) {
        if (!/^[a-f\d-]{36}$/.test(id))
            continue;
        const slot = state(id)?.candidate;
        if (!slot || slot.port !== port || slot.unit === except)
            continue;
        check(slot.id === id && slot.unit === runtime.runtimeUnit(id), 'Retained runtime ownership mismatch');
        if (runtime.running(slot))
            runtime.stop(slot);
    }
}
function active() { return fs.existsSync(ACTIVE) ? JSON.parse(fs.readFileSync(ACTIVE, 'utf8')) : { id: 'native', port: 3000, previous: null }; }
function proxyText(port) { check([3000, 3101, 3102].includes(port), 'Invalid runtime slot'); return `# Managed by MoboCom Engineering; include inside the existing location /.\nproxy_pass http://127.0.0.1:${port};\n`; }
async function healthy(port, attempts = 1) {
    for (let n = 0; n < attempts; n++) {
        try {
            const response = await fetch('http://127.0.0.1:' + port + '/api/health/ready', { signal: AbortSignal.timeout(2000), redirect: 'error' });
            const body = await response.json();
            if (response.status === 200 && body.ok === true && body.database === 'ready')
                return true;
        }
        catch { }
        if (n + 1 < attempts)
            await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}
function switchProxy(c, port) {
    p.owned(c.proxyInclude);
    check(command('/usr/sbin/nginx', ['-T']).includes('include ' + c.proxyInclude + ';'), 'Pinned proxy include is not active in Nginx');
    const old = fs.readFileSync(c.proxyInclude, 'utf8');
    fs.writeFileSync(c.proxyInclude, proxyText(port), { mode: 0o644 });
    try {
        command('/usr/sbin/nginx', ['-t']);
        command('/usr/bin/systemctl', ['reload', 'nginx']);
    }
    catch (e) {
        fs.writeFileSync(c.proxyInclude, old);
        try {
            command('/usr/sbin/nginx', ['-t']);
            command('/usr/bin/systemctl', ['reload', 'nginx']);
        }
        catch { }
        throw new Error('Proxy reload failed; previous routing restored');
    }
}
function marker(value) { fs.mkdirSync('/run/mobocom-engineering', { recursive: true, mode: 0o755 }); fs.chmodSync('/run/mobocom-engineering', 0o755); save(ACTIVE, value); save(MARKER, { id: value.id, port: value.port, managed: true }); fs.chmodSync(MARKER, 0o644); }
function approval(c, id, operation) {
    const env = p.environment(c.envFile);
    const text = command('/usr/bin/node', [path.join(TOOLS, 'worker.cjs'), '--approval', operation, id], { env: { ...env, NODE_ENV: 'production' }, timeout: 20000, cwd: c.appDir });
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new Error('Canonical approval could not be verified');
    }
    check(value.id === id && value.operation === operation, 'Fresh owner approval required');
    return value;
}
function backup(c, id) { check(/^postgres(?:ql)?:/.test(p.environment(c.envFile).DATABASE_URL || ''), 'Root-owned DATABASE_URL required; app source is never evaluated for backup'); const out = command('/usr/bin/bash', [c.backupScript], { cwd: c.appDir, env: { ...p.environment(c.envFile), MOBOCOM_ENV_FILE: c.envFile, MOBOCOM_APP_DIR: c.appDir }, timeout: 300000 }); const receipt = { at: new Date().toISOString(), run: id, completed: true }; save(path.join(p.directory(id), 'backup-receipt.json'), receipt); void out; return receipt; }
async function promote(c, id) {
    const row = state(id);
    check(row && row.phase === 'promoting', 'No promotion request');
    const proof = approval(c, id, 'promote');
    check(proof.artifact === row.artifact && proof.headSha === row.headSha, 'Approval artifact mismatch');
    await require('./github.cjs').merged(c, row);
    check(require('./artifact.cjs').artifactDigest(c, row) === row.artifact, 'Approved runtime bytes changed; promotion refused');
    const current = active();
    if (current.id === id) {
        row.phase = 'deployed';
        writeState(id, row);
        return w.publicReceipt(row);
    }
    check(w.availableMemory() >= Number(c.runtimeMemoryMb) + Number(c.reserveMemoryMb), 'Insufficient headroom for both runtime slots');
    check(Number.isInteger(c.runtimeMemoryMb) && c.runtimeMemoryMb >= 1024 && c.runtimeMemoryMb <= 8192, 'Invalid runtime memory');
    check(fs.readFileSync(c.proxyInclude, 'utf8') === proxyText(current.port), 'Proxy is not using the pinned current slot');
    const lock = path.join(c.storage, 'update', 'lock');
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    try {
        fs.mkdirSync(lock);
    }
    catch {
        throw new Error('Existing Updater/restore operation holds the update lock');
    }
    let candidate = null, switched = false;
    try {
        row.backup = backup(c, id);
        writeState(id, row);
        approval(c, id, 'promote');
        const port = current.port === 3101 ? 3102 : 3101;
        freeSlot(port, runtime.runtimeUnit(id));
        const prepared = await runtime.prepare(c, row);
        candidate = { id, port, ...prepared, artifact: row.artifact, headSha: row.headSha, previous: current, at: Date.now() };
        runtime.start(c, candidate);
        row.candidate = candidate;
        writeState(id, row);
        check(await healthy(port, 30), 'Candidate readiness failed; current site retained');
        approval(c, id, 'promote');
        switchProxy(c, port);
        switched = true;
        check(await healthy(port, 5), 'Candidate readiness failed after switch');
        const routed = await fetch(new URL('/api/health/ready', c.publicUrl), { redirect: 'error', signal: AbortSignal.timeout(5000) });
        check(routed.status === 200 && routed.headers.get('x-mobocom-runtime') === id, 'Public proxy did not reach the exact candidate');
        marker(candidate);
        markRuntime(current, 'retained');
        row.phase = 'deployed';
        row.previous = current.id;
        row.diagnostics = 'نسخهٔ تأییدشده فعال شد. نسخهٔ قبلی نگه داشته شده و پایگاه داده تغییر یا بازنویسی نشد.';
        writeState(id, row);
        // Keep the immediately previous release warm; never stop the native control plane.
        if (current.previous?.unit) {
            try {
                runtime.stop(current.previous);
            }
            catch { }
        }
        return w.publicReceipt(row);
    }
    catch (error) {
        if (switched) {
            switchProxy(c, current.port);
            marker(current);
            row.phase = 'rolled-back';
            row.diagnostics = 'نسخهٔ تازه سالم نماند؛ مسیر کد قبلی برگشت. اطلاعات پایگاه داده حفظ شد.';
        }
        else {
            row.phase = 'failed';
            row.diagnostics = p.redact(error.message);
        }
        if (candidate?.unit) {
            try {
                runtime.stop(candidate);
            }
            catch { }
        }
        writeState(id, row);
        return w.publicReceipt(row);
    }
    finally {
        fs.rmdirSync(lock);
    }
}
async function rollback(c, id) {
    const row = state(id);
    check(row && row.phase === 'rolling-back', 'No rollback request');
    const proof = approval(c, id, 'rollback');
    check(proof.artifact === row.artifact && proof.headSha === row.headSha, 'Rollback artifact mismatch');
    const current = active();
    check(current.id === id && current.previous, 'Only the current managed runtime can roll back');
    const previous = current.previous;
    const shared = path.join(c.storage, 'update', 'lock');
    try {
        fs.mkdirSync(shared);
    }
    catch {
        throw new Error('Existing update/restore holds the shared lock');
    }
    try {
        if (previous.unit)
            freeSlot(previous.port, previous.unit);
        runtime.start(c, previous);
        check(await healthy(previous.port, 15), 'Previous runtime is not ready; current route retained');
        switchProxy(c, previous.port);
        marker(previous);
        markRuntime(previous, 'deployed');
        row.phase = 'rolled-back';
        row.diagnostics = 'کد قبلی فعال شد؛ هیچ داده‌ای بازیابی یا حذف نشد.';
        writeState(id, row);
        return w.publicReceipt(row);
    }
    finally {
        fs.rmdirSync(shared);
    }
}
module.exports = { ACTIVE, MARKER, active, proxyText, healthy, switchProxy, approval, backup, promote, rollback, marker, markRuntime, freeSlot };
