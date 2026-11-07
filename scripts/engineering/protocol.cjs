const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = '/var/lib/mobocom-engineering', TOOLS = '/usr/local/lib/mobocom-engineering', CONFIG = '/etc/mobocom/engineering.json';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function check(condition, message) {
    if (!condition)
        throw new Error(message);
}
function owned(file) { const s = fs.lstatSync(file); check(s.uid === 0 && !(s.mode & 0o022) && !s.isSymbolicLink(), 'Host configuration/tools must be root-owned and not group/world writable'); return s; }
function config() {
    owned(CONFIG);
    owned(TOOLS);
    const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    check(c.protocol === 1 && /^[\w.-]+\/[\w.-]+$/.test(c.repository), 'Invalid pinned repository');
    for (const key of ['dependencyImage', 'postgresImage'])
        check(/^(?:sha256:[a-f\d]{64}|[\w./:-]+@sha256:[a-f\d]{64})$/.test(c[key] || ''), 'Use a pinned local container image');
    check(/^[a-f\d]{64}$/.test(c.dependencyLock || ''), 'Missing dependency lock hash');
    check(Number.isInteger(c.buildMemoryMb) && c.buildMemoryMb >= 2048 && c.buildMemoryMb <= 16384, 'Invalid build memory limit');
    check(Number.isInteger(c.reserveMemoryMb) && c.reserveMemoryMb >= 1024, 'At least1GiB host reserve required');
    check(Number.isInteger(c.buildSwapMb) && c.buildSwapMb >= 0 && c.buildSwapMb <= 8192, 'Invalid bounded build swap');
    check(Number.isInteger(c.buildHeapMb) && c.buildHeapMb >= 1024 && c.buildHeapMb <= c.buildMemoryMb + c.buildSwapMb - 768, 'Heap must leave container headroom');
    check([c.envFile, c.storage, c.proxyInclude, c.tokenFile, c.appDir, c.backupScript].every(v => typeof v === 'string' && path.isAbsolute(v) && !/[\n\r\0,]/.test(v)), 'Invalid operator-owned host paths');
    owned(c.envFile);
    owned(c.tokenFile);
    owned(c.backupScript);
    check(Number.isInteger(c.runtimeUid) && c.runtimeUid > 0 && Number.isInteger(c.runtimeGid) && c.runtimeGid > 0, 'Non-root runtime identity required');
    check(Number.isInteger(c.autoRollbackMinutes) && c.autoRollbackMinutes >= 0 && c.autoRollbackMinutes <= 120, 'Invalid bounded fallback window');
    check(new URL(c.publicUrl).protocol === 'https:', 'Public HTTPS origin required');
    fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
    owned(ROOT);
    return c;
}
function runId(id) { check(typeof id === 'string' && id.length === 36 && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(id), 'Invalid run id'); return id; }
function directory(id) { return path.join(ROOT, runId(id)); }
function save(file, value) { const tmp = file + '.tmp-' + crypto.randomBytes(6).toString('hex'); fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, file); }
function state(id) { const file = path.join(directory(id), 'state.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
function writeState(id, value) { fs.mkdirSync(directory(id), { recursive: true, mode: 0o700 }); save(path.join(directory(id), 'state.json'), value); return value; }
function lock(name, work) {
    const dir = path.join(ROOT, '.lock-' + name);
    try {
        fs.mkdirSync(dir, { mode: 0o700 });
    }
    catch {
        throw new Error('Another host operation is running; retry after checking its receipt');
    }
    try {
        return work();
    }
    finally {
        fs.rmdirSync(dir);
    }
}
async function asyncLock(name, work) {
    const dir = path.join(ROOT, '.lock-' + name);
    try {
        fs.mkdirSync(dir, { mode: 0o700 });
    }
    catch {
        throw new Error('Another host operation is running; check existing progress');
    }
    try {
        return await work();
    }
    finally {
        fs.rmdirSync(dir);
    }
}
function command(binary, args, options = {}) { const { env, ...rest } = options; return cp.execFileSync(binary, args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...rest, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', HOME: '/root', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...env } }).trim(); }
function git(cwd, args, options = {}) { return command('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=never', '-c', 'credential.helper=' + path.join(TOOLS, 'git-credential.cjs'), '-c', 'credential.useHttpPath=true', ...args], { cwd, ...options }); }
function safePath(name, write = false) { check(typeof name === 'string' && name.length <= 220 && !/[\r\n\0]/.test(name) && /^[a-zA-Z0-9_@()[\]./-]+$/.test(name) && !name.split('/').some(p => !p || p === '.' || p === '..') && !/(?:^|\/)(?:\.env[^/]*|node_modules|storage|uploads|\.git|\.next[^/]*|credentials?)(?:\/|$)/i.test(name), 'Invalid repository path'); const allowed = write ? (/^scripts\/engineering-feature-[a-z0-9-]+\.test\.cjs$/.test(name) || (/^(?:src\/|docs\/)/.test(name) && !/^(?:src\/modules\/(?:ai|updater|server-panel)\/|src\/platform\/|src\/modules\/identity\/|src\/app\/api\/admin\/server\/|docs\/agent\/PLATFORM_DECISIONS\.md)/.test(name))) : /^(?:src\/|docs\/|scripts\/|\.agents\/skills\/)/.test(name) || ['AGENTS.md', 'package.json', 'tsconfig.json'].includes(name); check(allowed && /\.(?:tsx?|jsx?|mjs|cjs|json|css|md)$/.test(name), 'Path outside automatic engineering scope'); return name; }
function filePath(root, name, write = false) {
    safePath(name, write);
    const file = path.resolve(root, name);
    check(file.startsWith(path.resolve(root) + path.sep), 'Path escape');
    let current = root;
    for (const part of name.split('/')) {
        current = path.join(current, part);
        if (fs.existsSync(current) || (() => {
            try {
                return fs.lstatSync(current).isSymbolicLink();
            }
            catch {
                return false;
            }
        })())
            check(!fs.lstatSync(current).isSymbolicLink(), 'Symlinks are not engineering files');
    }
    return file;
}
const redact = text => String(text).replace(/(?:Bearer\s+|(?:password|secret|token|api[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi, '[redacted]').replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database redacted]').slice(-5000);
function environment(file) {
    owned(file);
    const result = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim() || line.trim().startsWith('#'))
            continue;
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        check(m, 'Use plain KEY=value entries in the production env file');
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1);
        result[m[1]] = value;
    }
    return result;
}
function credentialLiterals(text) {
    check(!/(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AIza[A-Za-z0-9_-]{30,})/.test(text), 'Credential-like literal refused; use encrypted Admin settings, not source files');
    check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\\n|\s)+[A-Za-z0-9+/=]{24,}/.test(text), 'Private-key material must not enter source files');
}
module.exports = { fs, path, ROOT, TOOLS, CONFIG, hash, check, owned, config, runId, directory, save, state, writeState, lock, asyncLock, command, git, safePath, filePath, redact, environment, credentialLiterals };
