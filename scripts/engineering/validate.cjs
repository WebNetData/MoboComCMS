// Installed root-owned tool, mounted read-only. Runs as UID1000 in a networkless container.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), net = require('node:net');
if (process.getuid() === 0)
    throw new Error('Validation must not run as root');
const deadline = setTimeout(() => process.exit(124), Number(process.env.BUILD_DEADLINE_MS) || 1800000), checks = [];
const env = { PATH: process.env.PATH, HOME: '/tmp', LANG: 'C.UTF-8', NPM_CONFIG_CACHE: '/tmp/npm-cache', NODE_OPTIONS: '--max-old-space-size=' + (Number(process.env.BUILD_HEAP_MB) || 4096), DATABASE_URL: 'postgresql://engineering:isolated-fixture@localhost:5432/engineering?host=/dbsocket', NEXTAUTH_URL: 'http://localhost:3000', NEXTAUTH_SECRET: crypto.randomBytes(32).toString('hex'), PANEL_CREDENTIAL_KEY: crypto.randomBytes(32).toString('hex'), STORE_DELIVERY_KEY: crypto.randomBytes(32).toString('hex'), NEXT_TELEMETRY_DISABLED: '1', BACKGROUND_JOBS: 'false', BACKUP_SCHEDULER: 'false', OPERATIONS_MONITOR_SCHEDULER: 'false', REMNAWAVE_CONTROL_SCHEDULER: 'false', SUBSCRIPTION_REMINDER_SCHEDULER: 'false' };
function run(name, binary, args, timeout = 180000) {
    const r = cp.spawnSync(binary, args, { cwd: '/work', env, encoding: 'utf8', timeout, maxBuffer: 12 * 1024 ** 2 });
    const out = (r.stdout || '') + (r.stderr || '');
    console.log(out.slice(-8000));
    checks.push({ name, passed: r.status === 0 });
    if (r.status !== 0)
        throw new Error('Failed isolated check: ' + name);
}
async function socketReady() {
    for (let n = 0; n < 120; n++) {
        try {
            await new Promise((resolve, reject) => { const s = net.createConnection('/dbsocket/.s.PGSQL.5432'); s.once('connect', () => { s.destroy(); resolve(); }); s.once('error', reject); });
            return;
        }
        catch {
            await new Promise(r => setTimeout(r, 250));
        }
    }
    throw new Error('Isolated PostgreSQL socket not ready');
}
// Changed paths are supplied by the broker in a read-only manifest, never as commands.
async function validate() {
    if (fs.existsSync('/work/.engineering-checks.json'))
        throw new Error('An unchanged build cannot be repeated');
    for (const name of fs.readdirSync('/input')) {
        if (name === '.git' || name.startsWith('.env') || ['node_modules', 'storage', '.next', '.next-dev'].includes(name))
            continue;
        fs.cpSync('/input/' + name, '/work/' + name, { recursive: true, dereference: false, verbatimSymlinks: true });
    }
    for (const name of fs.readdirSync('/work'))
        if (name === '.env' || (name.startsWith('.env.') && !name.endsWith('.example')))
            throw new Error('No real dotenv files in sandbox');
    fs.cpSync('/opt/deps/node_modules', '/work/node_modules', { recursive: true, dereference: false, verbatimSymlinks: true });
    await socketReady();
    run('extensions', 'npm', ['run', 'extensions:generate']);
    run('prisma', 'node', ['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.postgresql.prisma']);
    run('empty PostgreSQL migrations', 'npm', ['run', 'deploy:migrate']);
    run('generated route types', 'node', ['node_modules/next/dist/bin/next', 'typegen']);
    for (const name of ['typecheck', 'source:check', 'arch:check', 'security:check', 'audit:check'])
        run(name, 'npm', ['run', name]);
    const changed = JSON.parse(fs.readFileSync('/manifest/changes.json', 'utf8')), selected = new Set(changed.filter(p => /^scripts\/engineering-feature-[a-z0-9-]+\.test\.cjs$/.test(p)));
    const profiles = [['hosting', 'scripts/hosting.test.cjs'], ['store', 'scripts/cart-checkout-replay.test.cjs'], ['forms', 'scripts/forms.test.cjs'], ['journal', 'scripts/journal-dashboard.test.cjs'], ['cinema', 'scripts/cinema.test.cjs'], ['music', 'scripts/music.test.cjs'], ['community', 'scripts/forum.test.cjs']];
    for (const [owner, test] of profiles)
        if (changed.some(p => p.includes('/' + owner + '/')) && fs.existsSync('/work/' + test))
            selected.add(test);
    for (const test of [...selected].slice(0, 3))
        run('focused ' + test, 'node', ['--test', test]);
    run('production build', 'npm', ['run', 'build:postgres'], 1500000);
    if (!fs.existsSync('/work/.next/BUILD_ID'))
        throw new Error('Build has no BUILD_ID');
    fs.writeFileSync('/work/.engineering-checks.json', JSON.stringify({ passed: true, checks, nonRoot: true, network: 'none', database: 'isolated-empty', productionData: false }, null, 2));
    console.log('Isolated validation completed; no production access');
}
validate().then(() => clearTimeout(deadline)).catch(e => { console.error(e.message); process.exitCode = 1; clearTimeout(deadline); });
