const p = require('./protocol.cjs'), w = require('./workspace.cjs');
async function main() {
    p.check(process.getuid() === 0, 'Root job required');
    const c = p.config(), action = process.argv[2], id = p.runId(process.argv[3]);
    p.check(['publish', 'promote', 'rollback', 'repair'].includes(action), 'Invalid background action');
    for (let n = 0; p.fs.existsSync(p.path.join(p.ROOT, '.lock-' + id)) && n < 20; n++)
        await new Promise(r => setTimeout(r, 100));
    return p.asyncLock(id, () => action === 'publish' ? require('./github.cjs').publish(c, id) : p.asyncLock('promotion', () => action === 'repair' ? require('./repair.cjs').repair(c, id) : require('./deployment.cjs')[action](c, id)));
}
main().catch(e => {
    try {
        const row = p.state(process.argv[3]);
        if (row && !['deployed', 'rolled-back'].includes(row.phase)) {
            row.phase = process.argv[2] === 'promote' ? 'published' : process.argv[2] === 'rollback' ? 'deployed' : process.argv[2] === 'repair' ? 'diagnosed' : 'failed';
            row.lastFailureAt = Date.now();
            row.diagnostics = p.redact(e.message);
            p.writeState(row.id, row);
        }
    }
    catch { }
    console.error('Engineering host job stopped; inspect its private receipt');
    process.exitCode = 1;
});
