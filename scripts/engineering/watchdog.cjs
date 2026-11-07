// No model calls or code writes. Only the already-approved, bounded fallback.
const p = require('./protocol.cjs'), w = require('./workspace.cjs'), d = require('./deployment.cjs');
async function main() {
    p.check(process.getuid() === 0, 'Root watchdog required');
    const c = p.config(), current = d.active();
    if (current.id === 'native' || !current.previous || !Number.isFinite(current.at) || Date.now() - current.at > c.autoRollbackMinutes * 60000)
        return;
    if (await d.healthy(current.port, 3))
        return;
    return p.asyncLock('promotion', async () => {
        const exact = d.active();
        if (exact.id !== current.id || !await d.healthy(current.previous.port, 5))
            return;
        const lock = p.path.join(c.storage, 'update', 'lock');
        try {
            p.fs.mkdirSync(lock);
        }
        catch {
            return;
        }
        try {
            d.switchProxy(c, current.previous.port);
            d.marker(current.previous);
            d.markRuntime(current.previous, 'deployed');
            const row = p.state(current.id);
            row.phase = 'rolled-back';
            row.diagnostics = 'پایش مستقل، خرابی نسخهٔ تازه را تشخیص داد و مسیر کد قبلی سالم را برگرداند؛ داده‌ای بازیابی یا حذف نشد.';
            p.writeState(row.id, row);
        }
        finally {
            p.fs.rmdirSync(lock);
        }
    });
}
main().catch(() => { console.error('Engineering watchdog could not verify a safe fallback; no database restore attempted'); process.exitCode = 1; });
