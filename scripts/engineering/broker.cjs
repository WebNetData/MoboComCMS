const net = require('node:net'), fs = require('node:fs'), cp = require('node:child_process'), p = require('./protocol.cjs'), { actions } = require('./host.cjs'), socket = '/run/mobocom-engineering/broker.sock';
if (process.getuid() !== 0)
    throw new Error('Root broker required');
const c = p.config();
p.check(Number.isInteger(c.runtimeGid) && c.runtimeGid >= 0, 'Runtime group required');
fs.mkdirSync('/run/mobocom-engineering', { recursive: true, mode: 0o755 });
fs.chmodSync('/run/mobocom-engineering', 0o755);
if (fs.existsSync(require('./deployment.cjs').ACTIVE))
    require('./deployment.cjs').marker(require('./deployment.cjs').active());
let clients = 0;
const server = net.createServer(client => {
    if (clients >= 8) {
        client.destroy();
        return;
    }
    clients++;
    client.setTimeout(30000, () => client.destroy());
    let raw = '', started = false;
    client.on('close', () => clients--);
    client.on('error', () => { });
    client.on('data', chunk => {
        if (started)
            return;
        raw += chunk;
        if (Buffer.byteLength(raw) > 512 * 1024) {
            client.destroy();
            return;
        }
        if (!raw.includes('\n'))
            return;
        started = true;
        let request;
        try {
            request = JSON.parse(raw);
            p.check(actions.includes(request.action), 'Invalid action');
        }
        catch {
            client.end(JSON.stringify({ protocol: 1, ok: false, error: 'Invalid broker request' }) + '\n');
            return;
        }
        const child = cp.execFile('/usr/bin/node', [p.TOOLS + '/host.cjs', request.action], { timeout: 26000, maxBuffer: 512 * 1024, env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' } }, (error, out) => client.end(error ? JSON.stringify({ protocol: 1, ok: false, error: 'Host operation interrupted; inspect the existing receipt' }) + '\n' : out));
        child.stdin.end(JSON.stringify(request));
    });
});
const listen = () => server.listen(socket, () => { fs.chownSync(socket, 0, c.runtimeGid); fs.chmodSync(socket, 0o660); });
if (fs.existsSync(socket)) {
    const probe = net.createConnection(socket);
    probe.once('connect', () => { probe.destroy(); console.error('Broker already active'); process.exit(1); });
    probe.once('error', error => { const s = fs.lstatSync(socket); p.check(error.code === 'ECONNREFUSED' && s.isSocket() && s.uid === 0 && !(s.mode & 7), 'Existing socket cannot be recovered safely'); fs.unlinkSync(socket); listen(); });
}
else
    listen();
for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => server.close(() => {
        try {
            fs.unlinkSync(socket);
        }
        catch { }
        process.exit(0);
    }));
