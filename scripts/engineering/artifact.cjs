const p = require('./protocol.cjs');
function artifactDigest(c, row) {
    p.check(/^mc-eng-work-[a-f0-9-]+-[1-3]$/.test(row.volume || ''), 'Invalid owned artifact volume');
    const digest = p.command('/usr/bin/docker', ['run', '--rm', '--network', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '256m', '--cpus', '1', '--mount', 'type=volume,source=' + row.volume + ',target=/artifact,readonly', '--mount', 'type=bind,source=' + p.TOOLS + ',target=/tools,readonly', '--entrypoint', 'node', c.dependencyImage, '/tools/seal.cjs'], { timeout: 180000 });
    p.check(/^[a-f0-9]{64}$/.test(digest), 'Missing actual artifact digest');
    return digest;
}
module.exports = { artifactDigest };
