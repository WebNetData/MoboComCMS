const p = require('./protocol.cjs'), { fs, path, ROOT, TOOLS, hash, check, directory, state, writeState, command, git, filePath, safePath } = p;
const docker = args => command('/usr/bin/docker', args);
const source = id => path.join(directory(id), 'source');
function manifest(dir) {
    return git(dir, ['ls-files']).split('\n').filter(name => {
        try {
            return !!safePath(name);
        }
        catch {
            return false;
        }
    }).slice(0, 6000);
}
function changed(dir, base) {
    const paths = [...git(dir, ['diff', '--name-only', base]).split('\n'), ...git(dir, ['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean);
    for (const name of paths)
        safePath(name, true);
    return [...new Set(paths)];
}
function prepare(c, input) {
    const id = p.runId(input.runId), old = state(id);
    if (old) {
        check(old.phase !== 'cancelled', 'Run cancelled');
        return publicReceipt(old);
    }
    check(Number.isInteger(input.maxFiles) && input.maxFiles >= 1 && input.maxFiles <= 24, 'Invalid file budget');
    const root = directory(id);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const dir = source(id);
    if (fs.existsSync(dir))
        throw new Error('Incomplete clone retained for operator inspection; start a new request');
    git(root, ['clone', '--depth', '1', '--branch', 'main', 'https://github.com/' + c.repository + '.git', dir], { timeout: 20000 });
    const baseSha = git(dir, ['rev-parse', 'HEAD']);
    check(hash(fs.readFileSync(path.join(dir, 'package-lock.json'))) === c.dependencyLock, 'Dependency image differs from current main; operator must rebuild the trusted image');
    git(dir, ['checkout', '-b', 'ai/engineering-' + id]);
    const row = { id, phase: 'developing', baseSha, maxFiles: input.maxFiles, instruction: String(input.instruction || '').slice(0, 4000), steps: {}, createdAt: Date.now(), manifest: manifest(dir), changed: [] };
    writeState(id, row);
    return publicReceipt(row);
}
function read(c, input) { const row = state(input.runId); check(row && row.phase === 'developing', 'Workspace is not editable'); check(Array.isArray(input.paths) && input.paths.length <= 8, 'Too many reads'); let total = 0; const files = input.paths.map(name => { const file = filePath(source(row.id), name); check(fs.lstatSync(file).isFile(), 'Not a regular file'); const content = fs.readFileSync(file, 'utf8'); check(!content.includes('\0') && content.length <= 60000, 'File too large/binary; request a smaller owner'); total += content.length; check(total <= 160000, 'Read budget exceeded'); return { path: name, sha256: hash(content), content }; }); return { files }; }
function apply(c, input) {
    const row = state(input.runId);
    check(row && row.phase === 'developing', 'Workspace is sealed or cancelled');
    check(Number.isInteger(input.step) && input.step >= 1 && input.step <= 8 && Array.isArray(input.edits) && input.edits.length <= row.maxFiles, 'Invalid patch');
    const digest = hash(JSON.stringify(input.edits));
    if (row.steps[input.step]) {
        check(row.steps[input.step] === digest, 'Step already has another patch');
        return { changed: row.changed };
    }
    const names = new Set(row.changed), seen = new Set(), edits = [];
    let total = 0;
    for (const edit of input.edits) {
        const file = filePath(source(row.id), edit.path, true);
        check(!seen.has(edit.path) && typeof edit.content === 'string' && edit.content.length <= 60000 && !edit.content.includes('\0') && /^(?:new|[a-f\d]{64})$/.test(edit.before), 'Invalid file edit');
        p.credentialLiterals(edit.content);
        seen.add(edit.path);
        names.add(edit.path);
        total += edit.content.length;
        check(total <= 160000, 'Patch too large');
        if (/^scripts\//.test(edit.path)) {
            let existed = true;
            try {
                git(source(row.id), ['cat-file', '-e', row.baseSha + ':' + edit.path]);
            }
            catch {
                existed = false;
            }
            check(!existed, 'Existing test/guard files cannot be weakened');
        }
        const exists = fs.existsSync(file);
        if (exists)
            check(fs.lstatSync(file).isFile(), 'Not a regular file');
        const current = exists ? fs.readFileSync(file, 'utf8') : null;
        check((current === null && edit.before === 'new') || (current !== null && (hash(current) === edit.before || current === edit.content)), 'Source hash changed; read again');
        edits.push({ file, edit });
    }
    check(names.size <= row.maxFiles, 'Total changed-file budget exceeded');
    for (const { file, edit } of edits) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o644);
        try {
            fs.writeFileSync(fd, edit.content);
        }
        finally {
            fs.closeSync(fd);
        }
    }
    row.changed = changed(source(row.id), row.baseSha);
    row.steps[input.step] = digest;
    writeState(row.id, row);
    return { changed: row.changed };
}
function availableMemory() {
    try {
        return Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)[1]) / 1024;
    }
    catch {
        return 0;
    }
}
// Broker uses umask0077; the bind-mounted source must be readable by sandbox UID1000.
// Its parent remains root0700, and links/.git are never traversed here.
function readableSource(root) {
    fs.chmodSync(root, 0o755);
    for (const name of fs.readdirSync(root)) {
        if (name === '.git') continue;
        const file = path.join(root, name), stat = fs.lstatSync(file);
        if (stat.isDirectory()) readableSource(file);
        else if (stat.isFile()) fs.chmodSync(file, stat.mode & 0o111 ? 0o755 : 0o644);
    }
}
function validate(c, input) {
    const row = state(input.runId);
    check(row && ['developing', 'validating', 'validated'].includes(row.phase), 'Workspace cannot be built');
    if (row.phase !== 'developing')
        return publicReceipt(row);
    check(row.changed.length > 0, 'No changes to validate');
    check(availableMemory() >= c.buildMemoryMb + c.reserveMemoryMb + 384, 'Insufficient available memory; live-site reserve preserved');
    const swap = Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/^SwapFree:\s+(\d+)/m)?.[1] || 0) / 1024;
    check(!c.buildSwapMb || swap >= c.buildSwapMb + 512, 'Insufficient free swap for the configured build; no host settings were changed');
    const disk = fs.statfsSync(ROOT);
    check(Number(disk.bavail) * Number(disk.bsize) > 12 * 1024 ** 3, 'Insufficient free disk space for retained builds');
    const running = docker(['ps', '--filter', 'label=mobocom.engineering.build=1', '--format', '{{.ID}}']);
    check(!running, 'Another isolated build is active');
    row.changed = changed(source(row.id), row.baseSha);
    row.inputHash = hash(row.changed.map(name => name + '\0' + hash(fs.readFileSync(filePath(source(row.id), name, true)))).join('\n'));
    check(row.inputHash !== row.lastFailedInputHash, 'Unchanged failed source is not rebuilt');
    row.builds = (row.builds || 0) + 1;
    check(row.builds <= 3, 'Three distinct builds are the per-request ceiling');
    row.container = 'mc-eng-' + row.id + '-' + row.builds;
    row.volume = 'mc-eng-work-' + row.id + '-' + row.builds;
    row.socket = 'mc-eng-socket-' + row.id + '-' + row.builds;
    row.database = 'mc-eng-db-' + row.id + '-' + row.builds;
    row.phase = 'validating';
    row.buildStartedAt = Date.now();
    writeState(row.id, row);
    const manifestDir = path.join(directory(row.id), 'manifest');
    fs.mkdirSync(manifestDir, { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(manifestDir, 'changes.json'), JSON.stringify(row.changed), { mode: 0o644 });
    readableSource(source(row.id));
    fs.chmodSync(manifestDir, 0o755);
    fs.chmodSync(path.join(manifestDir, 'changes.json'), 0o644);
    docker(['volume', 'create', '--label', 'mobocom.engineering.run=' + row.id, row.volume]);
    docker(['volume', 'create', '--label', 'mobocom.engineering.run=' + row.id, row.socket]);
    docker(['run', '--rm', '--network', 'none', '--user', '0', '--mount', `type=volume,source=${row.volume},target=/work`, '--entrypoint', 'node', c.dependencyImage, '-e', "require('fs').chownSync('/work',1000,1000)"]);
    docker(['run', '-d', '--name', row.database, '--label', 'mobocom.engineering.run=' + row.id, '--network', 'none', '--memory', '384m', '--cpus', '0.5', '--pids-limit', '128', '--env', 'POSTGRES_USER=engineering', '--env', 'POSTGRES_PASSWORD=isolated-fixture', '--env', 'POSTGRES_DB=engineering', '--mount', `type=volume,source=${row.socket},target=/var/run/postgresql`, c.postgresImage, 'postgres', '-c', 'listen_addresses=']);
    docker(['run', '-d', '--name', row.container, '--label', 'mobocom.engineering.run=' + row.id, '--label', 'mobocom.engineering.build=1', '--network', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512', '--memory', c.buildMemoryMb + 'm', '--memory-swap', (c.buildMemoryMb + c.buildSwapMb) + 'm', '--cpus', '1.5', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m', '--env', 'BUILD_HEAP_MB=' + c.buildHeapMb, '--env', 'BUILD_DEADLINE_MS=1800000', '--mount', `type=bind,source=${source(row.id)},target=/input,readonly`, '--mount', `type=bind,source=${TOOLS},target=/tools,readonly`, '--mount', `type=bind,source=${manifestDir},target=/manifest,readonly`, '--mount', `type=volume,source=${row.volume},target=/work`, '--mount', `type=volume,source=${row.socket},target=/dbsocket`, '--entrypoint', 'node', c.dependencyImage, '/tools/validate.cjs']);
    return publicReceipt(row);
}
function poll(c, input) {
    const row = state(input.runId);
    check(row, 'Unknown workspace');
    if (row.phase !== 'validating')
        return publicReceipt(row);
    const inspect = JSON.parse(docker(['inspect', row.container]))[0];
    check(inspect.Config.Labels?.['mobocom.engineering.run'] === row.id, 'Container ownership mismatch');
    if (inspect.State.Running) {
        if (Date.now() - row.buildStartedAt > 32 * 60000) {
            docker(['stop', '-t', '5', row.container]);
            row.phase = 'failed';
            row.diagnostics = 'Isolated validation timed out; live site unchanged';
            writeState(row.id, row);
        }
        return publicReceipt(row);
    }
    row.phase = inspect.State.ExitCode === 0 ? 'validated' : 'failed';
    if (row.phase === 'failed') {
        row.failure = 'validation';
        row.lastFailedInputHash = row.inputHash;
    }
    row.diagnostics = inspect.State.ExitCode === 0 ? 'Isolated checks/build passed' : p.redact(docker(['logs', '--tail', '25', row.container]));
    if (row.phase === 'validated') {
        const text = docker(['cp', row.container + ':/work/.engineering-checks.json', path.join(directory(row.id), 'checks.json')]);
        void text;
        const receipt = JSON.parse(fs.readFileSync(path.join(directory(row.id), 'checks.json'), 'utf8'));
        check(receipt.passed === true && Array.isArray(receipt.checks), 'Missing validation receipt');
        row.checks = receipt.checks;
        row.artifact = hash(row.baseSha + '\n' + row.inputHash + '\n' + c.dependencyImage + '\n' + JSON.stringify(row.checks));
    }
    try {
        docker(['rm', '-f', '-v', row.database]);
        docker(['rm', row.container]);
        docker(['volume', 'rm', row.socket]);
    }
    catch { /* isolated fixture retained, never mistaken for production */ }
    writeState(row.id, row);
    return publicReceipt(row);
}
function cancel(c, input) {
    const row = state(input.runId);
    if (!row)
        return {};
    check(!['deployed', 'rolled-back'].includes(row.phase), 'Use explicit code rollback for deployed work');
    if (row.container) {
        try {
            const inspect = JSON.parse(docker(['inspect', row.container]))[0];
            check(inspect.Config.Labels?.['mobocom.engineering.run'] === row.id, 'Container ownership mismatch');
            docker(['stop', '-t', '5', row.container]);
        }
        catch { /* preserve unavailable fixture */ }
    }
    if (row.database) {
        try {
            docker(['rm', '-f', row.database]);
        }
        catch { }
    }
    row.phase = 'cancelled';
    writeState(row.id, row);
    return publicReceipt(row);
}
function reopen(c, input) { const row = state(input.runId); check(row && row.phase === 'failed' && row.failure === 'validation' && !row.artifact && row.builds < 3, 'Only a failed unsealed validation can be edited again'); row.phase = 'developing'; writeState(row.id, row); const files = (row.changed || []).slice(0, 8).map(name => { const content = fs.readFileSync(filePath(source(row.id), name, true), 'utf8'); check(content.length <= 60000, 'Changed file exceeds read budget'); return { path: name, sha256: hash(content), content }; }); return { ...publicReceipt(row), files }; }
function publicReceipt(row) { const { phase, baseSha, headSha, artifact, prUrl, checks, changed, diffSummary, diagnostics, previous } = row; return { phase, baseSha, headSha, artifact, prUrl, checks, changed, diffSummary, diagnostics, previous, allowedRepairs: row.allowedRepairs, diagnosticHash: row.diagnosticHash, runtimeId: row.runtimeId, repairId: row.repairId, ...(phase === 'developing' ? { manifest: row.manifest } : {}) }; }
module.exports = { prepare, read, apply, validate, poll, cancel, reopen, publicReceipt, source, availableMemory, manifest, changed, docker, readableSource };
