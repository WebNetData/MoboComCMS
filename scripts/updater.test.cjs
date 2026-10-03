const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const u = load('src/modules/updater/domain/updater.ts')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('versions compare by semantic-version precedence', () => {
  assert.equal(u.compareVersions('1.5.0', 'v1.5.0'), 0)
  assert.equal(u.compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(u.compareVersions('2.0.0', '1.99.99'), 1)
  assert.equal(u.compareVersions('1.6.0-rc.1', '1.6.0'), -1, 'a pre-release is older than its release')
  assert.equal(u.compareVersions('1.6.0-rc.2', '1.6.0-rc.10'), -1)
  assert.equal(u.compareVersions('1.6.0-alpha', '1.6.0-beta'), -1)
  assert.equal(u.compareVersions('1.6.0+build5', '1.6.0'), 0)
  assert.equal(u.parseVersion('latest'), null)
  assert.throws(() => u.compareVersions('x', '1.0.0'))
})

test('only plain release tags may be checked out', () => {
  for (const ok of ['1.6.0', 'v1.6.0', 'v1.6.0-rc.1']) assert.equal(u.isSafeRef(ok), true, ok)
  for (const bad of ['main', 'HEAD', 'v1.6', '--help', '-fv1.0.0', 'v1.0.0; rm -rf /', '$(id)', 'v1.0.0 ', '../v1.0.0', 'v1.0.0\nx', '', null, 5]) assert.equal(u.isSafeRef(bad), false, String(bad))
})

test('release feeds (GitHub and self-hosted) become one shape; drafts and junk are dropped', () => {
  const gh = u.normalizeRelease({ tag_name: 'v1.6.0', body: 'a\r\nb', html_url: 'https://github.com/x/y/releases/v1.6.0', published_at: '2026-10-01T10:00:00Z', prerelease: false })
  assert.deepEqual({ ...gh }, { version: '1.6.0', tag: 'v1.6.0', notes: 'a\nb', url: 'https://github.com/x/y/releases/v1.6.0', publishedAt: '2026-10-01T10:00:00.000Z', prerelease: false })
  assert.equal(u.normalizeRelease({ version: '1.7.0', notes: 'n', url: 'http://insecure.example' }).url, '', 'only https links are kept')
  assert.equal(u.normalizeRelease({ tag_name: 'v1.6.0', draft: true }), null)
  assert.equal(u.normalizeRelease({ tag_name: 'nightly' }), null)
  assert.equal(u.normalizeRelease('x'), null)
  assert.equal(u.normalizeRelease({ tag_name: 'v2.0.0-rc.1' }).prerelease, true)
})

test('the offered update is the newest stable release above the current version', () => {
  const r = (v) => u.normalizeRelease({ tag_name: v })
  const list = [r('v1.5.0'), r('v1.6.0'), r('v1.7.0-rc.1'), r('v1.6.1')]
  assert.equal(u.pickUpdate('1.5.0', list).version, '1.6.1', 'release candidates are not offered to stable sites')
  assert.equal(u.pickUpdate('1.6.1', list), null)
  assert.equal(u.pickUpdate('1.7.0-beta.1', list).version, '1.7.0-rc.1', 'a pre-release site follows pre-releases')
  assert.equal(u.pickUpdate('1.5.0', []), null)
  assert.ok(u.isValidRepo('WebNetData/MoboComCMS')); assert.ok(!u.isValidRepo('a/b/c')); assert.ok(!u.isValidRepo('a b/c'))
})

test('how a site can be updated depends on where it runs', () => {
  const base = { dockerenv: false, hasGit: true, helper: true, hookUrl: '' }
  assert.equal(u.chooseMethod(base), 'systemd')
  assert.equal(u.chooseMethod({ ...base, dockerenv: true }), 'docker', 'a container is replaced, not edited')
  assert.equal(u.chooseMethod({ ...base, dockerenv: true, hookUrl: 'https://coolify.example' }), 'hook')
  assert.equal(u.chooseMethod({ ...base, helper: false }), 'manual')
  assert.equal(u.chooseMethod({ ...base, hasGit: false, hookUrl: 'https://h.example' }), 'hook')
})

test('deploy hooks must be public https addresses', () => {
  assert.equal(u.safeHookUrl('https://coolify.example.com/api/v1/deploy?uuid=1'), 'https://coolify.example.com/api/v1/deploy?uuid=1')
  assert.equal(u.safeHookUrl(''), '')
  for (const bad of ['http://coolify.example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.1/x', 'https://172.20.0.1/x', 'https://169.254.169.254/x', 'https://db.internal/x', 'https://[::1]/x', 'ftp://x.example.com', 'nope']) assert.throws(() => u.safeHookUrl(bad), u.UpdateError, bad)
})

test('progress: stale runs count as failed, unknown text as idle; pending migrations are listed', () => {
  const at = new Date().toISOString()
  assert.equal(u.effectiveStatus({ status: 'running', step: '', target: '', previous: '', at }), 'running')
  assert.equal(u.effectiveStatus({ status: 'running', step: '', target: '', previous: '', at: new Date(Date.now() - 3 * 3600_000).toISOString() }), 'failed')
  assert.equal(u.parseRunState('not json').status, 'idle')
  assert.equal(u.parseRunState('{"status":"hacked"}').status, 'idle')
  assert.equal(u.parseRunState('{"status":"done","target":"v1.6.0"}').status, 'done')
  assert.deepEqual(u.pendingMigrations(['20260101000000_a', '20260102000000_b', 'migration_lock.toml'], ['20260101000000_a']), ['20260102000000_b'])
})

// ------------------------------------------------------------------ the update script, against a throw-away git repository

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'))
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  const origin = path.join(dir, 'origin'); fs.mkdirSync(origin)
  git(origin, 'init', '-q', '-b', 'main')
  const put = (name, text) => { fs.mkdirSync(path.dirname(path.join(origin, name)), { recursive: true }); fs.writeFileSync(path.join(origin, name), text) }
  put('deploy/ubuntu/self-update.sh', read('deploy/ubuntu/self-update.sh')); fs.chmodSync(path.join(origin, 'deploy/ubuntu/self-update.sh'), 0o755)
  put('deploy/ubuntu/update.sh', read('deploy/ubuntu/update.sh')); fs.chmodSync(path.join(origin, 'deploy/ubuntu/update.sh'), 0o755)
  put('VERSION', '1.0.0\n'); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'v1'); git(origin, 'tag', 'v1.0.0')
  put('VERSION', '1.1.0\n'); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'v1.1'); git(origin, 'tag', 'v1.1.0')
  git(origin, 'checkout', '-q', 'v1.0.0')
  const app = path.join(dir, 'app')
  execFileSync('git', ['clone', '-q', origin, app]); git(app, 'checkout', '-q', '--detach', 'v1.0.0')
  return { dir, app, git: (...a) => git(app, ...a) }
}
function runUpdate(box, ref, extra = {}) {
  const health = path.join(box.dir, 'healthy')
  const env = { ...process.env, UPDATE_STATE_DIR: path.join(box.dir, 'state'), UPDATE_NPM: 'true', UPDATE_BACKUP: 'true', UPDATE_RESTART: 'true', UPDATE_ENV_FILE: '/nonexistent', UPDATE_HEALTH_URL: `file://${health}`, UPDATE_HEALTH_TRIES: '1', UPDATE_BUILD: 'true', HEALTH_FILE: health, ...extra }
  const result = spawnSync('bash', ['deploy/ubuntu/self-update.sh', ref], { cwd: box.app, env, encoding: 'utf8', timeout: 60_000 })
  let state = {}
  try { state = JSON.parse(fs.readFileSync(path.join(box.dir, 'state', 'state.json'), 'utf8')) } catch { /* none */ }
  let log = ''
  try { log = fs.readFileSync(path.join(box.dir, 'state', 'update.log'), 'utf8') } catch { /* none */ }
  return { code: result.status, stderr: result.stderr, state, log, health }
}

test('update script: checks out the tag, builds, restarts and reports done', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'healthy'), 'ok')
  const r = runUpdate(box, 'v1.1.0')
  assert.equal(r.code, 0, r.stderr + r.log)
  assert.equal(r.state.status, 'done'); assert.equal(r.state.target, 'v1.1.0')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.1.0')
  assert.match(r.log, /done/)
  assert.equal(fs.existsSync(path.join(box.dir, 'state', 'lock')), false, 'the lock is released')
})

test('update script: requires a successful backup before replacing code', () => {
  const box = sandbox()
  const capturedVersion = path.join(box.dir, 'version-at-backup')
  fs.writeFileSync(path.join(box.dir, 'healthy'), 'ok')
  const ok = runUpdate(box, 'v1.1.0', { UPDATE_BACKUP: `cp VERSION "${capturedVersion}"` })
  assert.equal(ok.code, 0, ok.stderr + ok.log)
  assert.equal(fs.readFileSync(capturedVersion, 'utf8').trim(), '1.0.0', 'backup ran against the old checkout')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.1.0')

  const failedBox = sandbox()
  const failed = runUpdate(failedBox, 'v1.1.0', { UPDATE_BACKUP: 'false' })
  assert.equal(failed.code, 1)
  assert.equal(failed.state.status, 'failed')
  assert.equal(failed.state.step, 'Backup failed before code replacement')
  assert.equal(fs.readFileSync(path.join(failedBox.app, 'VERSION'), 'utf8').trim(), '1.0.0', 'failed backup leaves the old checkout running')
  assert.ok(!failed.log.includes('npm ci'), 'build never starts after a failed backup')
})

test('manual Ubuntu update also stops before checkout when its backup fails', () => {
  const box = sandbox()
  const capturedVersion = path.join(box.dir, 'manual-version-at-backup')
  const result = spawnSync('bash', ['deploy/ubuntu/update.sh'], {
    cwd: box.app,
    env: { ...process.env, UPDATE_BACKUP: `cp VERSION "${capturedVersion}"; exit 9` },
    encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(result.status, 9, result.stderr)
  assert.equal(fs.readFileSync(capturedVersion, 'utf8').trim(), '1.0.0')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('update script: a new version that does not start is rolled back automatically', () => {
  const box = sandbox()
  const health = path.join(box.dir, 'healthy')
  // "Building" 1.1.0 breaks the health check; building the old version fixes it.
  const build = `if grep -q '^1.1.0' VERSION; then rm -f "${health}"; else touch "${health}"; fi`
  const r = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: build })
  assert.equal(r.code, 1)
  assert.equal(r.state.status, 'rolled-back', JSON.stringify(r.state) + r.log)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0', 'the old code is back')
  assert.match(r.log, /rolling back/)
})

test('update script: when even the rollback fails it says so', () => {
  const box = sandbox()
  const r = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: 'false' })
  assert.equal(r.state.status, 'failed'); assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('update script: refuses unsafe or unknown versions and a second run', () => {
  const box = sandbox()
  for (const bad of ['main', 'v1.0.0;id', '--force', '../x', '']) assert.equal(runUpdate(box, bad).code, 2, bad)
  const unknown = runUpdate(box, 'v9.9.9')
  assert.equal(unknown.code, 1); assert.equal(unknown.state.status, 'failed')
  fs.mkdirSync(path.join(box.dir, 'state', 'lock'), { recursive: true })
  const locked = runUpdate(box, 'v1.1.0')
  assert.equal(locked.code, 3, 'another update is running')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('root helper validates the tag and starts the update in its own unit', () => {
  const run = (ref) => spawnSync('bash', ['deploy/ubuntu/mobocom-update', ref], { cwd: root, env: { ...process.env, MOBOCOM_UPDATE_DRY: '1' }, encoding: 'utf8' })
  const ok = run('v1.6.0')
  assert.equal(ok.status, 0); assert.match(ok.stdout, /DRY: systemd-run --unit=mobocom-update .*self-update\.sh v1\.6\.0/); assert.match(ok.stdout, /--uid=mobocom/)
  for (const bad of ['main', 'v1.6.0;reboot', '$(id)', '../v1.0.0', '-v1.0.0', 'v1.6', '']) assert.equal(run(bad).status, 2, bad)
  const installer = read('deploy/ubuntu/updater-install.sh')
  assert.match(installer, /NOPASSWD: \/usr\/local\/sbin\/mobocom-update/); assert.match(installer, /systemctl restart/)
  assert.ok(!/NOPASSWD: ALL/.test(installer))
})

test('wiring: routes, admin page, job, hook and privileges', () => {
  for (const file of ['src/app/api/admin/updates/route.ts', 'src/app/admin/updates/page.tsx', 'src/modules/updater/server/service.ts']) assert.ok(fs.existsSync(path.join(root, file)), file)
  const http = read('src/modules/updater/server/http.ts')
  assert.match(http, /settings\.manage/); assert.match(http, /auditAdmin/); assert.match(http, /rateLimitHit/)
  const service = read('src/modules/updater/server/service.ts')
  assert.match(service, /isSafeRef/); assert.match(service, /backupConfirmed/); assert.match(service, /safeHookUrl/); assert.match(service, /redirect: 'manual'/)
  assert.match(read('src/modules/notifications/server/jobs-scheduler.ts'), /name: 'updates'/)
  assert.match(read('src/app/admin/layout.tsx'), /\/admin\/updates/)
})
