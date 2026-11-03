const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const i = load('src/modules/installer/domain/installer.ts')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

// Execute the actual admission of the platform layer install.sh sources, without root, OS-file changes or packages.
function hostAdmission(id, version) {
  assert.match(read('deploy/ubuntu/install.sh'), /\. "\$BUNDLE_DIR\/platform\.sh"[\s\S]*\nplatform_admit\n/, 'install.sh admits the system through platform.sh')
  return require('node:child_process').spawnSync('bash', ['-c', `die() { printf '%s\\n' "$*" >&2; exit 1; }; . deploy/ubuntu/platform.sh; platform_admit; printf '%s %s' "$PLATFORM" "$OS_MAJOR"`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ID: id, VERSION_ID: version },
  })
}

test('host installer accepts Ubuntu 22.04/24.04/26.04 LTS, Debian 12/13 and AlmaLinux 9/10, each with its package family', () => {
  for (const [id, version, family] of [['ubuntu', '22.04', 'debian 22'], ['ubuntu', '24.04', 'debian 24'], ['ubuntu', '26.04', 'debian 26'], ['debian', '12', 'debian 12'], ['debian', '13', 'debian 13'],
    ['almalinux', '9', 'rhel 9'], ['almalinux', '9.6', 'rhel 9'], ['almalinux', '10', 'rhel 10'], ['almalinux', '10.0', 'rhel 10']]) {
    const result = hostAdmission(id, version)
    assert.equal(result.status, 0, `${id} ${version}: ${result.error || result.stderr}`)
    assert.equal(result.stdout, family, `${id} ${version}`)
  }
})

test('host installer refuses unsupported or unknown systems before package installation', () => {
  for (const [id, version] of [['ubuntu', '20.04'], ['ubuntu', '25.10'], ['ubuntu', '26.10'], ['ubuntu', ''], ['debian', '11'], ['debian', '26.04'], ['debian', '12.5'],
    ['almalinux', '8.10'], ['almalinux', '11'], ['almalinux', '9x'], ['rocky', '9.5'], ['centos', '9'], ['fedora', '41'], ['', '26.04'], ['', '']]) {
    const result = hostAdmission(id, version)
    assert.equal(result.status, 1, `${id}:${version}: ${result.error || result.stderr}`)
    assert.match(result.stderr, /supports Ubuntu 22\.04, 24\.04 and 26\.04 LTS, Debian 12 and 13, and AlmaLinux 9 and 10/)
  }
})

test('the one-line installer runs nothing before it is fully read, fetches over HTTPS only and passes a release ref on', () => {
  const wrapper = read('install.sh').replace(/\r\n/g, '\n')
  const lines = wrapper.trimEnd().split('\n')
  assert.equal(lines[lines.length - 1], 'main "$@"', 'the only top-level call is the last line')
  assert.equal(lines.filter((line) => /^[a-z_]+ "\$@"$/.test(line)).length, 1)
  assert.match(wrapper, /local repo=https:\/\/github\.com\/WebNetData\/MoboComCMS\.git /)
  assert.doesNotMatch(wrapper, /http:\/\/|\beval /, 'no plain HTTP or eval')
  assert.match(wrapper, /\[ "\$ref" = main \] \|\| \[ "\$given" = 1 \] \|\| args\+=\(--branch "\$ref"\)/)
  // A crafted ref is refused before any network or package step (the root check is satisfied by a stand-in id).
  const bad = require('node:child_process').spawnSync('bash', ['-c', 'id() { echo 0; }; export -f id; bash install.sh'], { cwd: root, encoding: 'utf8', env: { ...process.env, MOBOCOM_REF: 'main;rm -rf /' } })
  assert.equal(bad.status, 1, bad.stderr); assert.match(bad.stderr, /invalid MOBOCOM_REF/)
})

test('the mobocom command reads release versions strictly and the one-line installer only installs a newer copy of it', () => {
  const cli = read('deploy/ubuntu/mobocom').replace(/\r\n/g, '\n')
  const fn = (name) => cli.match(new RegExp(`^${name}\\(\\) \\{.*\\}$`, 'm'))[0]
  const tag = (value) => require('node:child_process').spawnSync('bash', ['-c', `${fn('version_tag')}; version_tag "$1"`, '_', value], { encoding: 'utf8' })
  assert.equal(tag('1.6.1').stdout, 'v1.6.1\n'); assert.equal(tag('v2.0.10').stdout, 'v2.0.10\n')
  for (const value of ['1.6', 'main', 'v1.6.1;id', '1.6.1 ', '../1.6.1', '']) assert.equal(tag(value).status, 1, JSON.stringify(value))
  assert.match(cli, /^HELPER_VERSION=[2-9]$/m)
  const wrapper = read('install.sh').replace(/\r\n/g, '\n')
  const helperVersion = wrapper.match(/^helper_version\(\) \{.*\}$/m)[0]
  const version = (text) => require('node:child_process').spawnSync('bash', ['-c', `${helperVersion}; f=$(mktemp); printf '%s' "$1" > "$f"; helper_version "$f"; rm -f "$f"`, '_', text], { encoding: 'utf8' }).stdout.trim()
  assert.equal(version(cli), cli.match(/^HELPER_VERSION=(\d+)$/m)[1])
  assert.equal(version('#!/bin/sh\necho old helper\n'), '1')
  assert.equal(version('HELPER_VERSION=9;rm\n'), '1')
  // Moving to a release on a checkout whose update script predates UPDATE_TO takes the older exact-commit route.
  assert.match(cli, /if grep -q 'UPDATE_TO:-' deploy\/ubuntu\/update\.sh; then run_update UPDATE_TO="\$1"; else run_update UPDATE_ROLLBACK_TO="\$1"; fi/)
  assert.match(read('deploy/ubuntu/update.sh'), /TO_COMMIT="\$\{UPDATE_TO:-\}"/)
})

test('first-run code is private, stable across starts, and never overwrites an operator token', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-token-'))
  const run = extra => execFileSync(process.execPath, [path.join(root, 'scripts/bootstrap-install-token.cjs')], { env: { ...process.env, INSTALL_CONFIG_DIR: dir, INSTALL_TOKEN: '', INSTALL_DISABLED: 'false', ...extra }, encoding: 'utf8' })
  try {
    const first = run(), token = fs.readFileSync(path.join(dir, 'install.token'), 'utf8').trim()
    assert.match(token, /^[a-f0-9]{64}$/); assert.ok(first.includes(token))
    assert.equal(run(), ''); assert.equal(fs.readFileSync(path.join(dir, 'install.token'), 'utf8').trim(), token)
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'install.token')).mode & 0o777, 0o600)
    assert.equal(run({ INSTALL_TOKEN: 'operator-provided-test-value' }), '')
    fs.writeFileSync(path.join(dir, 'installed.lock'), 'done'); assert.equal(run(), '')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('the installer never opens on a working site', () => {
  const base = { disabled: false, lockFile: false, setupMode: false, probe: 'admin' }
  assert.equal(i.decideMode(base), 'installed')
  assert.equal(i.decideMode({ ...base, disabled: true, setupMode: true, probe: 'no-admin' }), 'installed', 'INSTALL_DISABLED wins')
  assert.equal(i.decideMode({ ...base, lockFile: true, probe: 'no-admin' }), 'installed', 'the lock file wins')
  assert.equal(i.decideMode({ ...base, probe: 'unreachable' }), 'unknown', 'a database outage is not "needs install"')
  assert.equal(i.decideMode({ ...base, probe: 'skipped' }), 'unknown')
  assert.equal(i.decideMode({ ...base, probe: 'no-schema' }), 'needs-schema')
  assert.equal(i.decideMode({ ...base, probe: 'no-admin' }), 'needs-admin')
  assert.equal(i.decideMode({ ...base, setupMode: true, probe: 'skipped' }), 'needs-database')
})

test('runtime settings file: only allow-listed, shell-safe values are written and read', () => {
  const text = i.serializeRuntimeEnv({ DATABASE_URL: 'postgresql://u:p%40ss@db:5432/app', NEXTAUTH_SECRET: 'a'.repeat(64) })
  assert.ok(text.startsWith('# web-installer'))
  assert.deepEqual(i.parseRuntimeEnv(text), { DATABASE_URL: 'postgresql://u:p%40ss@db:5432/app', NEXTAUTH_SECRET: 'a'.repeat(64) })
  for (const bad of ["x'; rm -rf /", 'a b', 'a\nb', '$(id)', '`id`', 'a"b', 'a;b', 'a|b']) assert.throws(() => i.serializeRuntimeEnv({ NEXTAUTH_SECRET: bad }), i.InstallError, bad)
  assert.deepEqual(i.parseRuntimeEnv("PATH=/evil\nDATABASE_URL='postgresql://x/y'\nNEXTAUTH_SECRET=$(id)\n# comment\nlowercase=1"), { DATABASE_URL: 'postgresql://x/y' }, 'unknown keys and unsafe values are ignored')
})

test('the container start loader exports safely and never overrides real environment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'))
  fs.writeFileSync(path.join(dir, 'runtime.env'), "# web-installer\nDATABASE_URL=postgresql://u:p%27q@db:5432/app\nNEXTAUTH_SECRET=fromfile\nINTERNAL_JOBS_SECRET=$(touch /tmp/pwned-by-env)\nEVIL=1\n")
  const run = (extra) => execFileSync('sh', ['-c', 'eval "$(node scripts/load-runtime-env.cjs)"; echo "DB=$DATABASE_URL|SECRET=$NEXTAUTH_SECRET|JOBS=${INTERNAL_JOBS_SECRET:-none}|EVIL=${EVIL:-none}|KEYS=$INSTALLER_LOADED_KEYS"'], { cwd: root, env: { ...process.env, INSTALL_CONFIG_DIR: dir, DATABASE_URL: '', NEXTAUTH_SECRET: '', INTERNAL_JOBS_SECRET: '', EVIL: '', INSTALLER_LOADED_KEYS: '', ...extra }, encoding: 'utf8' }).trim()
  assert.equal(run({}), 'DB=postgresql://u:p%27q@db:5432/app|SECRET=fromfile|JOBS=none|EVIL=none|KEYS=DATABASE_URL NEXTAUTH_SECRET')
  assert.ok(run({ NEXTAUTH_SECRET: 'fromenv' }).includes('SECRET=fromenv'), 'a real environment variable wins')
  assert.ok(run({ INTERNAL_JOBS_SECRET: 'fromenv' }).includes('JOBS=fromenv'), 'a real jobs secret wins over the runtime file')
  assert.equal(fs.existsSync('/tmp/pwned-by-env'), false, 'values are never executed')
  const missing = execFileSync('node', ['scripts/load-runtime-env.cjs'], { cwd: root, env: { ...process.env, INSTALL_CONFIG_DIR: path.join(dir, 'none') }, encoding: 'utf8' })
  assert.equal(missing, '', 'no file, no output')
})

test('the database address is validated, encoded and never shown with its password', () => {
  const pg = i.normalizePostgres({ host: 'db.internal', port: '5433', database: 'shop', user: 'shop_user', password: 'p@ss:w/rd#1 ?%', ssl: 'require' })
  const url = i.buildPostgresUrl(pg)
  const parsed = new URL(url)
  assert.equal(parsed.hostname, 'db.internal'); assert.equal(parsed.port, '5433'); assert.equal(parsed.pathname, '/shop'); assert.equal(parsed.searchParams.get('sslmode'), 'require')
  assert.equal(decodeURIComponent(parsed.password), 'p@ss:w/rd#1 ?%', 'any password survives the round trip')
  assert.deepEqual(i.describeDatabaseUrl(url), { provider: 'postgresql', where: 'shop_user@db.internal:5433/shop' })
  assert.ok(!JSON.stringify(i.describeDatabaseUrl(url)).includes('rd#1'))
  assert.equal(i.describeDatabaseUrl('file:./x.db').provider, 'sqlite')
  for (const bad of [{ host: 'a b' }, { host: '' }, { host: 'x;y' }, { host: 'h', port: 70000 }, { host: 'h', database: 'a b' }, { host: 'h', user: 'a;b' }, { host: 'h', password: 'x\ny' }]) assert.throws(() => i.normalizePostgres({ database: 'd', user: 'u', password: 'p', ...bad }), i.InstallError, JSON.stringify(bad))
  const secret = 'p@ss:w/rd#1 ?%'
  const message = i.scrubMessage(`Can't reach ${url} with ${secret} (${encodeURIComponent(secret)})`, [secret])
  assert.ok(!message.includes('p@ss') && !message.includes('rd#1'), message)
  assert.ok(!i.scrubMessage('postgresql://user:secret@host/db failed', []).includes('secret'))
})

test('administrator passwords: length, letters and digits, common words, the e-mail', () => {
  assert.notEqual(i.passwordProblem('short1'), '')
  assert.notEqual(i.passwordProblem('onlyletterslong'), '')
  assert.notEqual(i.passwordProblem('1234567890123'), '')
  assert.notEqual(i.passwordProblem('Passw0rd12345'), '')
  assert.notEqual(i.passwordProblem('welcome-2024-x'), '')
  assert.notEqual(i.passwordProblem('johnsmith-99-secret', 'johnsmith@example.com'), '')
  assert.equal(i.passwordProblem('Zebra-Quartz-Lamp-2049', 'owner@example.com'), '')
  assert.equal(i.passwordProblem('رمز-عبور-قوی-۱۲۳۴5'), '', 'Persian letters count')
})

test('site input: public address rules and module choices', () => {
  assert.equal(i.normalizeSiteUrl('https://Example.com/path?x=1', true), 'https://example.com')
  assert.equal(i.normalizeSiteUrl('http://localhost:3000', false), 'http://localhost:3000')
  for (const bad of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://shop.local', 'javascript:alert(1)', 'nope']) assert.throws(() => i.normalizeSiteUrl(bad, true), i.InstallError, bad)
  const site = i.normalizeSiteInput({ siteName: '  <b>Shop</b> ', adminEmail: 'Owner@Example.com', adminPassword: 'Zebra-Quartz-Lamp-2049', siteUrl: 'https://shop.example.com/', modules: { forum: false, store: true, unknown: true, journal: 'yes' } }, { production: true, knownModules: ['forum', 'store', 'journal'] })
  assert.ok(!site.siteName.includes('<') && site.siteName.includes('Shop'), site.siteName)
  assert.equal(site.adminEmail, 'owner@example.com'); assert.equal(site.siteUrl, 'https://shop.example.com')
  assert.deepEqual(site.modules, { forum: false, store: true }, 'unknown ids and non-boolean values are dropped')
  assert.throws(() => i.normalizeSiteInput({ siteName: '', adminEmail: 'a@b.co', adminPassword: 'Zebra-Quartz-Lamp-2049' }, { production: false, knownModules: [] }), /نام سایت/)
  assert.throws(() => i.normalizeSiteInput({ siteName: 'x', adminEmail: 'bad', adminPassword: 'Zebra-Quartz-Lamp-2049' }, { production: false, knownModules: [] }), /ایمیل/)
})

test('module switches are applied so dependencies always hold', () => {
  const requires = { store: [], marketplace: ['store'], seller: ['marketplace'] }
  const on = i.moduleOrder({ seller: true, store: true, marketplace: true }, requires)
  assert.ok(on.indexOf('store') < on.indexOf('marketplace') && on.indexOf('marketplace') < on.indexOf('seller'), on.join())
  const off = i.moduleOrder({ seller: false, store: false, marketplace: false }, requires)
  assert.ok(off.indexOf('seller') < off.indexOf('marketplace') && off.indexOf('marketplace') < off.indexOf('store'), off.join())
  const mixed = i.moduleOrder({ store: true, marketplace: false }, requires)
  assert.deepEqual(mixed, ['marketplace', 'store'], 'disables first, then enables')
})

test('runtime image contains the actual shared owners required by integrity reporting', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-runtime-report-'))
  try {
    fs.cpSync(path.join(root, 'scripts'), path.join(dir, 'scripts'), { recursive: true })
    const dockerfile = read('Dockerfile').split(/FROM .* AS runner\r?\n/)[1]
    assert.ok(dockerfile, 'production runner exists')
    for (const match of dockerfile.matchAll(/^COPY --from=builder \/app\/(src\/\S+) \.\/(src\/\S+)\s*$/gm)) {
      const destination = path.join(dir, match[2])
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(root, match[1]), destination)
    }
    const result = execFileSync(process.execPath, ['-e', "const report = require('./scripts/integrity-report.cjs'); if (typeof report.findings !== 'function') process.exit(1)"], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
    })
    assert.equal(result, '')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('wiring: the installer is gated, standalone and cannot brick a site', () => {
  for (const file of ['src/app/install/route.ts', 'src/app/api/install/route.ts', 'public/installer/installer.js', 'public/installer/installer.css', 'scripts/load-runtime-env.cjs', 'prisma/system-roles.json']) assert.ok(fs.existsSync(path.join(root, file)), file)
  assert.match(read('src/proxy.ts'), /installGate\(req\)/)
  const gate = read('src/modules/installer/server/gate.ts')
  assert.match(gate, /'unknown'/, 'a database outage never redirects to the installer')
  const state = read('src/modules/installer/server/state.ts')
  assert.match(state, /P2021/); assert.match(state, /installed\.lock/); assert.match(state, /INSTALL_DISABLED/)
  const http = read('src/modules/installer/server/http.ts')
  assert.match(http, /mode === 'installed'.*404|404/s); assert.match(http, /timingSafeEqual/); assert.match(http, /rateLimitStrict/)
  assert.match(read('src/modules/installer/server/page.ts'), /noindex/)
  // Passwords for the database and secrets never reach logs: errors are scrubbed.
  assert.match(read('src/modules/installer/server/setup.ts'), /scrubMessage/)
  // The wizard writes text with textContent/createTextNode only.
  const js = read('public/installer/installer.js')
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), 'no HTML injection')
  // Background jobs and env validation are skipped in setup mode; the start script loads saved settings and can roll back.
  assert.match(read('src/instrumentation.ts'), /SETUP_MODE/)
  const start = read('deploy/docker-start.sh')
  assert.match(start, /load-runtime-env/); assert.match(start, /SETUP_MODE=1/); assert.match(start, /runtime\.env\.rejected/); assert.match(start, /production-preflight/)
  // Roles are defined once for the seed and the installer.
  assert.match(read('prisma/seed.cjs'), /system-roles\.json/); assert.match(read('src/modules/installer/server/setup.ts'), /system-roles\.json/)
  // The first administrator closes the installer.
  assert.match(read('src/modules/installer/server/setup.ts'), /markInstalled\(\)/)
})
