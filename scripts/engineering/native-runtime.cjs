// Approved code runs as the existing application user on the existing Ubuntu host.
// This preserves installed media/PDF tools and configured absolute storage paths.
const p = require('./protocol.cjs'), { fs, path, check, command } = p;
const RELEASES = '/opt/mobocom-engineering/releases', CACHE = '/var/cache/mobocom-engineering';
function runtimeUnit(id) { return 'mobocom-ai-runtime-' + p.runId(id); }
function lockCode(directory) {
    for (const name of fs.readdirSync(directory)) {
        const file = path.join(directory, name), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink())
            fs.lchownSync(file, 0, 0);
        else {
            if (stat.isDirectory())
                lockCode(file);
            fs.chownSync(file, 0, 0);
            fs.chmodSync(file, stat.mode & 0o555);
        }
    }
    fs.chownSync(directory, 0, 0);
    fs.chmodSync(directory, 0o555);
}
async function prepare(c, row) {
    const id = p.runId(row.id), directory = path.join(RELEASES, id), cache = path.join(CACHE, id);
    // The normal service home is app-owned; approved root-owned code lives outside it.
    fs.mkdirSync(path.dirname(RELEASES), { recursive: true, mode: 0o755 });
    p.owned(path.dirname(RELEASES));
    fs.chmodSync(path.dirname(RELEASES), 0o755);
    fs.mkdirSync(RELEASES, { recursive: true, mode: 0o755 });
    fs.mkdirSync(CACHE, { recursive: true, mode: 0o755 });
    p.owned(RELEASES);
    p.owned(CACHE);
    fs.chmodSync(RELEASES, 0o755);
    fs.chmodSync(CACHE, 0o755);
    if (!fs.existsSync(directory)) {
        const stage = path.join(RELEASES, '.stage-' + id), copied = path.join(stage, 'runtime');
        check(!fs.existsSync(stage), 'Incomplete protected runtime copy retained for operator inspection');
        fs.mkdirSync(stage, { mode: 0o700 });
        fs.mkdirSync(copied, { mode: 0o755 });
        fs.chownSync(copied, c.runtimeUid, c.runtimeGid);
        command('/usr/bin/docker', ['run', '--rm', '--network', 'none', '--user', c.runtimeUid + ':' + c.runtimeGid, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '384m', '--cpus', '1', '--mount', 'type=volume,source=' + row.volume + ',target=/artifact,readonly', '--mount', 'type=bind,source=' + copied + ',target=/target', '--mount', 'type=bind,source=' + p.TOOLS + ',target=/tools,readonly', '--entrypoint', 'node', c.dependencyImage, '/tools/export.cjs'], { timeout: 180000 });
        // Parent stays root0700 until every code entry is locked; the app cannot race this walk.
        lockCode(copied);
        check(await require('./seal.cjs').sealDirectory(copied) === row.artifact, 'Copied runtime differs from the approved bytes');
        fs.renameSync(copied, directory);
        fs.rmdirSync(stage);
    }
    else {
        p.owned(directory);
        check(await require('./seal.cjs').sealDirectory(directory) === row.artifact, 'Retained runtime bytes changed');
    }
    fs.mkdirSync(cache, { recursive: true, mode: 0o755 });
    fs.chownSync(cache, c.runtimeUid, c.runtimeGid);
    for (const [target, source] of [[path.join(directory, 'storage'), c.storage], [path.join(directory, '.next/cache'), cache], [path.join(directory, 'public/uploads'), path.join(c.appDir, 'public/uploads')]]) {
        if (!fs.existsSync(source))
            continue;
        if (!fs.existsSync(target))
            fs.symlinkSync(source, target);
    }
    return { directory, unit: runtimeUnit(id), cache };
}
function start(c, current) {
    if (current.id === 'native')
        return command('/usr/bin/systemctl', ['start', 'mobocom']);
    check(current.unit === runtimeUnit(current.id) && current.directory === path.join(RELEASES, current.id), 'Unknown retained runtime');
    check([3101, 3102].includes(current.port), 'Unknown runtime port');
    // Persistent units survive host reboot; transient systemd-run units do not.
    const file = '/etc/systemd/system/' + current.unit + '.service', text = unitText(c, current);
    if (fs.existsSync(file)) {
        p.owned(file);
        check(fs.readFileSync(file, 'utf8') === text, 'Installed runtime configuration changed; operator review required');
    }
    else
        fs.writeFileSync(file, text, { mode: 0o644, flag: 'wx' });
    command('/usr/bin/systemctl', ['daemon-reload']);
    return command('/usr/bin/systemctl', ['enable', '--now', current.unit]);
}
function unitText(c, current) {
    const quote = text => JSON.stringify(String(text).replaceAll('%', '%%'));
    return ['[Unit]', 'Description=MoboCom approved engineering release ' + current.id, 'After=network.target mobocom-ai-engineering-broker.service', '[Service]', 'Type=simple', 'User=' + c.runtimeUid, 'Group=' + c.runtimeGid, 'WorkingDirectory=' + quote(current.directory), 'EnvironmentFile=' + quote(c.envFile), 'MemoryMax=' + c.runtimeMemoryMb + 'M', 'MemorySwapMax=0', 'CPUQuota=200%', 'TasksMax=512', 'Restart=on-failure', 'RestartSec=3', 'Environment=NODE_ENV=production', 'Environment=ENGINEERING_RUN_ID=' + current.id, 'Environment=NODE_OPTIONS=--max-old-space-size=' + (c.runtimeMemoryMb - 512), 'Environment=NEXT_TELEMETRY_DISABLED=1', 'ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ' + current.port, '[Install]', 'WantedBy=multi-user.target', ''].join('\n');
}
function stop(current) {
    check(current.id !== 'native' && current.unit === runtimeUnit(current.id), 'The native control plane is never stopped');
    return command('/usr/bin/systemctl', ['disable', '--now', current.unit], { timeout: 45000 });
}
function running(current) {
    const unit = current.id === 'native' ? 'mobocom' : runtimeUnit(current.id);
    try {
        return command('/usr/bin/systemctl', ['is-active', unit]) === 'active';
    }
    catch {
        return false;
    }
}
module.exports = { RELEASES, CACHE, runtimeUnit, unitText, prepare, start, stop, running };
