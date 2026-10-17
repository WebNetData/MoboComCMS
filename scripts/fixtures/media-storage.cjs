// Owned, chrooted local protocol fixtures; no production credentials or external services.
const fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path'), net = require('node:net'), crypto = require('node:crypto'), { Server, utils } = require('ssh2'), { pipeline } = require('node:stream/promises');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const confined = (root, name) => { const file = path.resolve(root, '.' + path.posix.resolve('/', name)); if (file !== root && !file.startsWith(root + path.sep))
    throw Error('outside'); return file; };
async function ftp(root, password) { const sockets = new Set(), passive = new Set(); const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => { }); let buffer = '', cwd = '/', dataServer, dataReady, user = '', authed = false, rename = ''; const say = text => socket.write(text + '\r\n'), abs = name => confined(root, path.posix.resolve(cwd, name || '.')); say('220 owned fixture'); let chain = Promise.resolve(); socket.on('data', chunk => { buffer += chunk; while (buffer.includes('\n')) {
    const at = buffer.indexOf('\n'), line = buffer.slice(0, at).replace(/\r$/, '');
    buffer = buffer.slice(at + 1);
    chain = chain.then(() => command(line)).catch(() => say('550 denied'));
} }); async function command(line) { const at = line.indexOf(' '), cmd = (at < 0 ? line : line.slice(0, at)).toUpperCase(), arg = at < 0 ? '' : line.slice(at + 1); if (cmd === 'USER') {
    user = arg;
    say('331 password');
    return;
} if (cmd === 'PASS') {
    authed = user === 'fixture' && arg === password;
    say(authed ? '230 logged in' : '530 denied');
    return;
} if (cmd === 'QUIT') {
    say('221 bye');
    socket.end();
    return;
} if (!authed) {
    say('530 denied');
    return;
} if (cmd === 'FEAT') {
    say('211-Features\r\n EPSV\r\n UTF8\r\n211 End');
    return;
} if (cmd === 'SYST') {
    say('215 UNIX Type: L8');
    return;
} if (['TYPE', 'OPTS', 'NOOP'].includes(cmd)) {
    say('200 ok');
    return;
} if (cmd === 'PWD') {
    say('257 "' + cwd + '"');
    return;
} if (cmd === 'CWD') {
    if (!fs.statSync(abs(arg)).isDirectory())
        throw Error();
    cwd = path.posix.resolve(cwd, arg);
    say('250 cwd');
    return;
} if (cmd === 'CDUP') {
    cwd = path.posix.dirname(cwd);
    say('250 cwd');
    return;
} if (cmd === 'MKD') {
    fs.mkdirSync(abs(arg), { recursive: true });
    say('257 created');
    return;
} if (cmd === 'SIZE') {
    say('213 ' + fs.statSync(abs(arg)).size);
    return;
} if (cmd === 'MDTM') {
    say('213 20261017000000');
    return;
} if (cmd === 'RNFR') {
    rename = abs(arg);
    say('350 rename');
    return;
} if (cmd === 'RNTO') {
    fs.renameSync(rename, abs(arg));
    say('250 renamed');
    return;
} if (cmd === 'DELE' || cmd === 'RMD') {
    fs.rmSync(abs(arg), { recursive: cmd === 'RMD' });
    say('250 removed');
    return;
} if (cmd === 'EPSV' || cmd === 'PASV') {
    dataServer = net.createServer();
    passive.add(dataServer);
    dataReady = new Promise(resolve => dataServer.once('connection', s => { s.on('error', () => { }); sockets.add(s); s.on('close', () => sockets.delete(s)); resolve(s); }));
    const port = await listen(dataServer);
    say(cmd === 'EPSV' ? `229 Entering Extended Passive Mode (|||${port}|)` : `227 Entering Passive Mode (127,0,0,1,${port >> 8},${port & 255})`);
    return;
} if (['LIST', 'NLST', 'MLSD', 'RETR', 'STOR'].includes(cmd)) {
    if (!dataReady)
        throw Error();
    say('150 data');
    const data = await dataReady;
    if (cmd === 'STOR') {
        const file = abs(arg);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await pipeline(data, fs.createWriteStream(file));
    }
    else if (cmd === 'RETR')
        await pipeline(fs.createReadStream(abs(arg)), data);
    else {
        const names = fs.readdirSync(abs(arg));
        const listing = names.map(name => { const stat = fs.statSync(path.join(abs(arg), name)); return cmd === 'MLSD' ? `type=${stat.isDirectory() ? 'dir' : 'file'};size=${stat.size};modify=20261017000000; ${name}` : `${stat.isDirectory() ? 'd' : '-'}rw-r--r-- 1 fixture fixture ${stat.size} Oct 17 00:00 ${name}`; }).join('\r\n') + '\r\n';
        data.end(listing);
        await new Promise(resolve => data.once('close', resolve));
    }
    dataServer.close();
    passive.delete(dataServer);
    say('226 done');
    return;
} say('502 unsupported'); } }); const port = await listen(server); return { port, close: async () => { for (const s of sockets)
        s.destroy(); for (const s of passive)
        s.close(); await new Promise(r => server.close(r)); } }; }
async function sftp(root, password) { const clients = new Set(); const key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } }).privateKey; const status = utils.sftp.STATUS_CODE; const server = new Server({ hostKeys: [key] }, client => { clients.add(client); client.on('close', () => clients.delete(client)); client.on('error', () => { }); client.on('authentication', ctx => ctx.method === 'password' && ctx.username === 'fixture' && ctx.password === password ? ctx.accept() : ctx.reject()); client.on('ready', () => client.on('session', accept => accept().on('sftp', accept => { const stream = accept(), handles = new Map(); let seq = 0; const wrap = fn => (id, ...args) => { try {
    fn(id, ...args);
}
catch {
    stream.status(id, status.FAILURE);
} }, attrs = file => { const s = fs.statSync(file); return { mode: s.mode, uid: 1000, gid: 1000, size: s.size, atime: Math.floor(s.atimeMs / 1000), mtime: Math.floor(s.mtimeMs / 1000) }; }, handle = value => { const h = Buffer.alloc(4); h.writeUInt32BE(++seq); handles.set(seq, value); return h; }, find = h => handles.get(h.readUInt32BE()); stream.on('REALPATH', wrap((id, p) => stream.name(id, [{ filename: path.posix.resolve('/', p), longname: '', attrs: attrs(confined(root, p)) }]))); for (const cmd of ['STAT', 'LSTAT'])
    stream.on(cmd, wrap((id, p) => stream.attrs(id, attrs(confined(root, p))))); stream.on('FSTAT', wrap((id, h) => stream.attrs(id, attrs(find(h).file)))); stream.on('OPENDIR', wrap((id, p) => { const file = confined(root, p); stream.handle(id, handle({ file, entries: fs.readdirSync(file) })); })); stream.on('READDIR', wrap((id, h) => { const d = find(h); if (!d.entries.length) {
    stream.status(id, status.EOF);
    return;
} stream.name(id, d.entries.splice(0).map(name => ({ filename: name, longname: name, attrs: attrs(path.join(d.file, name)) }))); })); stream.on('OPEN', wrap((id, p, flags) => { const file = confined(root, p); if (flags & 8)
    fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, flags & 2 ? 'w' : 'r'); stream.handle(id, handle({ file, fd })); })); stream.on('READ', wrap((id, h, offset, length) => { const data = Buffer.alloc(length), n = fs.readSync(find(h).fd, data, 0, length, offset); n ? stream.data(id, data.subarray(0, n)) : stream.status(id, status.EOF); })); stream.on('WRITE', wrap((id, h, offset, data) => { fs.writeSync(find(h).fd, data, 0, data.length, offset); stream.status(id, status.OK); })); stream.on('CLOSE', wrap((id, h) => { const v = find(h); if (v.fd !== undefined)
    fs.closeSync(v.fd); handles.delete(h.readUInt32BE()); stream.status(id, status.OK); })); stream.on('MKDIR', wrap((id, p) => { fs.mkdirSync(confined(root, p), { recursive: true }); stream.status(id, status.OK); })); stream.on('RENAME', wrap((id, a, b) => { fs.renameSync(confined(root, a), confined(root, b)); stream.status(id, status.OK); })); for (const cmd of ['REMOVE', 'RMDIR'])
    stream.on(cmd, wrap((id, p) => { fs.rmSync(confined(root, p), { recursive: cmd === 'RMDIR' }); stream.status(id, status.OK); })); stream.on('SETSTAT', (id) => stream.status(id, status.OK)); stream.on('end', () => { for (const h of handles.values())
    if (h.fd !== undefined)
        try {
            fs.closeSync(h.fd);
        }
        catch { } }); }))); }); const port = await listen(server); return { port, close: async () => { for (const c of clients)
        c.end(); await new Promise(r => server.close(r)); } }; }
module.exports = { ftp, sftp };
