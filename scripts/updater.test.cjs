const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const ts = require('typescript-api')

const root = path.resolve(__dirname, '..')
function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(require, mod, mod.exports)
  return mod.exports
}
const u = load('src/modules/updater/domain/updater.ts')
require('./update-network.cases.cjs')
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
  put('deploy/ubuntu/git-build.sh', read('deploy/ubuntu/git-build.sh'))
  put('.gitignore', '.next/\nnode_modules/\nstorage/\n.env\n')
  put('deploy/ubuntu/git-fetch.sh', read('deploy/ubuntu/git-fetch.sh'))
  // Files the real build rewrites (Next.js and the extension generator), committed like in the repository.
  put('tsconfig.json', '{}\n'); put('src/themes/generated.css', '/* committed */\n')
  put('VERSION', '1.0.0\n'); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'v1'); git(origin, 'tag', 'v1.0.0')
  put('VERSION', '1.1.0\n'); git(origin, 'add', '-A'); git(origin, 'commit', '-qm', 'v1.1'); git(origin, 'tag', 'v1.1.0')
  git(origin, 'checkout', '-q', 'v1.0.0')
  const app = path.join(dir, 'app')
  execFileSync('git', ['clone', '-q', origin, app]); git(app, 'checkout', '-q', '--detach', 'v1.0.0')
  fs.mkdirSync(path.join(app,'.next')); fs.writeFileSync(path.join(app,'.next','BUILD_ID'),'previous-build')
  fs.mkdirSync(path.join(app,'node_modules')); fs.writeFileSync(path.join(app,'node_modules','previous-dependency'),'kept')
  return { dir, app, git: (...a) => git(app, ...a) }
}
function runUpdate(box, ref, extra = {}) {
  const health = path.join(box.dir, 'healthy')
  const env = { ...process.env, UPDATE_APP_DIR: box.app, UPDATE_STATE_DIR: path.join(box.dir, 'state'), UPDATE_NPM: 'true', UPDATE_STOP: 'true', UPDATE_BACKUP: 'true', UPDATE_RESTART: 'true', UPDATE_ENV_FILE: '/nonexistent', UPDATE_HEALTH_URL: `file://${health}`, UPDATE_HEALTH_TRIES: '1', UPDATE_BUILD: 'mkdir -p .next node_modules; printf candidate > .next/BUILD_ID', HEALTH_FILE: health, ...extra }
  const result = spawnSync('bash', ['deploy/ubuntu/self-update.sh', ref], { cwd: box.app, env, encoding: 'utf8', timeout: 60_000 })
  let state = {}
  try { state = JSON.parse(fs.readFileSync(path.join(box.dir, 'state', 'state.json'), 'utf8')) } catch { /* none */ }
  let log = ''
  try { log = fs.readFileSync(path.join(box.dir, 'state', 'update.log'), 'utf8') } catch { /* none */ }
  return { code: result.status, stderr: result.stderr, state, log, health }
}

function runManualUpdate(box, extra = {}) {
  const health = path.join(box.dir, 'manual-healthy')
  const envFile = path.join(box.dir, 'mobocom.env')
  fs.writeFileSync(envFile, 'DATABASE_URL=postgresql://fixture:fixture@localhost:5432/fixture\n')
  const env = { ...process.env, UPDATE_APP_DIR: box.app, UPDATE_STATE_DIR: path.join(box.dir, 'state'), UPDATE_NPM: 'true', UPDATE_STOP: 'true', UPDATE_BACKUP: 'true', UPDATE_RESTART: 'true', UPDATE_ENV_FILE: envFile, UPDATE_HEALTH_URL: `file://${health}`, UPDATE_HEALTH_TRIES: '1', UPDATE_BUILD: 'mkdir -p .next node_modules; printf candidate > .next/BUILD_ID', ...extra }
  const result = spawnSync('bash', ['deploy/ubuntu/update.sh'], { cwd: box.app, env, encoding: 'utf8', timeout: 60_000 })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, health }
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

test('automatic update refuses tracked edits, untracked files and divergent local commits', () => {
  for (const kind of ['tracked', 'untracked', 'commit']) {
    const box = sandbox()
    if (kind === 'tracked') fs.writeFileSync(path.join(box.app, 'VERSION'), 'owner edit\n')
    else { fs.writeFileSync(path.join(box.app, 'owner-content.txt'), 'preserve me'); if (kind === 'commit') { box.git('add', 'owner-content.txt'); box.git('commit', '-qm', 'local owner work') } }
    const before = box.git('rev-parse', 'HEAD').trim()
    const result = runUpdate(box, 'v1.1.0')
    assert.equal(result.code, 2); assert.equal(box.git('rev-parse', 'HEAD').trim(), before)
    assert.equal(result.state.status, 'failed')
    assert.ok(!result.log.includes('Backing up before update'))
    if (kind !== 'tracked') assert.equal(fs.readFileSync(path.join(box.app, 'owner-content.txt'), 'utf8'), 'preserve me')
  }
})

test('automatic update can require a trusted signed release and refuses unsigned tags', () => {
  const box = sandbox(), before = box.git('rev-parse', 'HEAD').trim()
  const result = runUpdate(box, 'v1.1.0', { UPDATE_REQUIRE_SIGNED_TAG: 'true' })
  assert.equal(result.code, 2); assert.equal(box.git('rev-parse', 'HEAD').trim(), before)
  assert.equal(result.state.status, 'failed')
})

test('manual Ubuntu update also stops before checkout when its backup fails', () => {
  const box = sandbox()
  const capturedVersion = path.join(box.dir, 'manual-version-at-backup')
  const result = runManualUpdate(box, { UPDATE_BACKUP: `cp VERSION "${capturedVersion}"; exit 9` })
  assert.equal(result.code, 9, result.stderr)
  assert.equal(fs.readFileSync(capturedVersion, 'utf8').trim(), '1.0.0')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('manual Ubuntu update succeeds after backup and a healthy restart', () => {
  const box = sandbox()
  const capturedVersion = path.join(box.dir, 'manual-version-at-backup')
  fs.writeFileSync(path.join(box.dir, 'manual-healthy'), 'ok')
  const result = runManualUpdate(box, { UPDATE_BACKUP: `cp VERSION "${capturedVersion}"` })
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fs.readFileSync(capturedVersion, 'utf8').trim(), '1.0.0', 'the old checkout is backed up')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.1.0')
  assert.equal(fs.existsSync(path.join(box.dir, 'state', 'lock')), false)
})

test('manual Ubuntu update restores old application code when the new build fails', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'manual-healthy'), 'ok')
  const result = runManualUpdate(box, { UPDATE_BUILD: "mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; if grep -q '^1.1.0' VERSION; then false; else true; fi" })
  assert.equal(result.code, 1, result.stderr)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
  assert.match(result.stderr, /application rolled back/)
  assert.equal(fs.existsSync(path.join(box.dir, 'state', 'lock')), false)
})

test('a failed isolated build never overwrites the active build or dependencies and rollback never rebuilds', () => {
  for (const manual of [false,true]) {
    const box=sandbox(),health=path.join(box.dir,manual?'manual-healthy':'healthy'),seen=path.join(box.dir,'build-cwd'),stop=path.join(box.dir,'stopped')
    fs.writeFileSync(health,'ok');fs.writeFileSync(path.join(box.app,'.env'),'private runtime settings')
    fs.mkdirSync(path.join(box.app,'storage'));fs.writeFileSync(path.join(box.app,'storage','owner-file'),'private upload')
    const build=`pwd >> "${seen}"; test ! -e .env && test ! -e storage/owner-file || exit 21; mkdir -p .next node_modules; printf broken > .next/BUILD_ID; printf broken > node_modules/partial; exit 134`
    const extra={UPDATE_BUILD:build,UPDATE_STOP:`touch "${stop}"`},r=manual?runManualUpdate(box,extra):runUpdate(box,'v1.1.0',extra)
    assert.equal(r.code,1,r.stderr+(r.log||''));assert.equal(fs.readFileSync(path.join(box.app,'.next','BUILD_ID'),'utf8'),'previous-build')
    assert.equal(fs.readFileSync(path.join(box.app,'node_modules','previous-dependency'),'utf8'),'kept');assert.equal(fs.readFileSync(path.join(box.app,'VERSION'),'utf8').trim(),'1.0.0')
    const attempts=fs.readFileSync(seen,'utf8').trim().split('\n');assert.equal(attempts.length,1,'an OOM never triggers another build for rollback');assert.notEqual(path.resolve(attempts[0]),box.app)
    assert.equal(fs.existsSync(stop),false,'failed candidate never stops the running site');assert.equal(fs.readFileSync(path.join(box.app,'.env'),'utf8'),'private runtime settings')
  }
})

test('a failed candidate health check restores the exact previous build/dependencies without npm or build replay', () => {
  for (const manual of [false,true]) {
    const box=sandbox(),health=path.join(box.dir,manual?'manual-healthy':'healthy'),seen=path.join(box.dir,'builds')
    fs.writeFileSync(health,'ok')
    const r=(manual?runManualUpdate:((b,e)=>runUpdate(b,'v1.1.0',e)))(box,{
      UPDATE_BUILD:`printf build >> "${seen}"; mkdir -p .next node_modules; printf new > .next/BUILD_ID; printf new > node_modules/new-dependency`,
      UPDATE_RESTART:`if grep -q '^1.1.0' VERSION; then rm -f "${health}"; else touch "${health}"; fi`,
    })
    assert.equal(r.code,1,r.stderr+(r.log||''));assert.equal(fs.readFileSync(seen,'utf8'),'build')
    assert.equal(fs.readFileSync(path.join(box.app,'.next','BUILD_ID'),'utf8'),'previous-build');assert.equal(fs.readFileSync(path.join(box.app,'node_modules','previous-dependency'),'utf8'),'kept')
    assert.equal(fs.existsSync(path.join(box.app,'node_modules','new-dependency')),false)
  }
})

test('a successful command without a candidate BUILD_ID cannot replace the active build', () => {
  const box=sandbox();fs.writeFileSync(path.join(box.dir,'healthy'),'ok')
  const r=runUpdate(box,'v1.1.0',{UPDATE_BUILD:'mkdir -p node_modules; true'})
  assert.equal(r.code,1);assert.match(r.log,/candidate BUILD_ID is missing/);assert.equal(r.state.status,'rolled-back')
  assert.equal(fs.readFileSync(path.join(box.app,'.next','BUILD_ID'),'utf8'),'previous-build')
})

test('a missing installed production build fails before checkout, backup or npm', () => {
  const box=sandbox(),before=box.git('rev-parse','HEAD').trim(),marker=path.join(box.dir,'unexpected-backup')
  fs.unlinkSync(path.join(box.app,'.next','BUILD_ID'))
  const r=runUpdate(box,'v1.1.0',{UPDATE_BACKUP:`touch "${marker}"`})
  assert.equal(r.code,2);assert.equal(box.git('rev-parse','HEAD').trim(),before);assert.equal(fs.existsSync(marker),false)
  assert.match(r.log,/current production build is missing/)
})

test('owner edits during a successful isolated build prevent adoption and leave active artifacts intact', () => {
  const box=sandbox();fs.writeFileSync(path.join(box.dir,'healthy'),'ok')
  const r=runUpdate(box,'v1.1.0',{UPDATE_BUILD:'mkdir -p .next node_modules; printf new > .next/BUILD_ID; printf keep > "$UPDATE_APP_DIR/VERSION"'})
  assert.equal(r.state.status,'failed');assert.match(r.log,/local work appeared during the isolated build/)
  assert.equal(fs.readFileSync(path.join(box.app,'VERSION'),'utf8'),'keep');assert.equal(fs.readFileSync(path.join(box.app,'.next','BUILD_ID'),'utf8'),'previous-build')
})

test('partial artifact adoption is compensated without deleting previous build or dependency bytes', () => {
  const box=sandbox(),bin=path.join(box.dir,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(box.dir,'healthy'),'ok')
  const mv=path.join(bin,'mv');fs.writeFileSync(mv,'#!/bin/sh\nif [ "$2" = "$UPDATE_APP_DIR/node_modules" ]; then exit 23; fi\nexec /bin/mv "$@"\n');fs.chmodSync(mv,0o755)
  const r=runUpdate(box,'v1.1.0',{PATH:bin+path.delimiter+process.env.PATH})
  assert.equal(r.state.status,'rolled-back',r.log);assert.equal(fs.readFileSync(path.join(box.app,'.next','BUILD_ID'),'utf8'),'previous-build')
  assert.equal(fs.readFileSync(path.join(box.app,'node_modules','previous-dependency'),'utf8'),'kept')
})

test('legacy missing stop permission is refused before backup or code changes', () => {
  const box=sandbox(),bin=path.join(box.dir,'limited-bin'),marker=path.join(box.dir,'unexpected-backup');fs.mkdirSync(bin)
  const sudo=path.join(bin,'sudo');fs.writeFileSync(sudo,'#!/bin/sh\nexit 1\n');fs.chmodSync(sudo,0o755)
  const r=runUpdate(box,'v1.1.0',{PATH:bin+path.delimiter+process.env.PATH,UPDATE_STOP:'',UPDATE_BACKUP:`touch "${marker}"`})
  assert.equal(r.code,2);assert.match(r.log,/stop permission missing/);assert.equal(fs.existsSync(marker),false)
  assert.equal(fs.readFileSync(path.join(box.app,'VERSION'),'utf8').trim(),'1.0.0')
})

test('manual Ubuntu update restores the old branch commit after a failed health check', () => {
  const box = sandbox()
  box.git('checkout', '-q', 'main')
  box.git('reset', '--hard', 'v1.0.0')
  const health = path.join(box.dir, 'manual-healthy')
  const restart = `if grep -q '^1.1.0' VERSION; then rm -f "${health}"; else touch "${health}"; fi`
  const result = runManualUpdate(box, { UPDATE_RESTART: restart })
  assert.equal(result.code, 1, result.stderr)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
  assert.equal(box.git('branch', '--show-current').trim(), 'main')
  assert.match(result.stderr, /application rolled back/)
})

test('manual Ubuntu update refuses tracked local edits and a concurrent update', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.app, 'VERSION'), 'local edit\n')
  const dirty = runManualUpdate(box)
  assert.equal(dirty.code, 2, dirty.stderr)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), 'local edit')
  box.git('checkout', '--', 'VERSION')
  fs.mkdirSync(path.join(box.dir, 'state', 'lock'), { recursive: true })
  const locked = runManualUpdate(box)
  assert.equal(locked.code, 3, locked.stderr)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('manual Ubuntu update preserves local commits that are not on the target branch', () => {
  const box = sandbox()
  box.git('checkout', '-q', 'main')
  fs.writeFileSync(path.join(box.app, 'VERSION'), 'local commit\n')
  box.git('add', 'VERSION')
  box.git('commit', '-qm', 'site-specific commit')
  const localHead = box.git('rev-parse', 'HEAD').trim()
  const capturedVersion = path.join(box.dir, 'unexpected-backup')
  const result = runManualUpdate(box, { UPDATE_BACKUP: `cp VERSION "${capturedVersion}"` })
  assert.equal(result.code, 2, result.stderr)
  assert.match(result.stderr, /diverges/)
  assert.equal(box.git('rev-parse', 'HEAD').trim(), localHead)
  assert.equal(fs.existsSync(capturedVersion), false, 'no backup runs for an ineligible branch')
})

test('manual update preserves untracked work and edits appearing during backup/build', () => {
  for (const phase of ['before', 'backup', 'build', 'commit']) {
    const box = sandbox()
    fs.writeFileSync(path.join(box.dir, 'manual-healthy'), 'ok')
    const before = box.git('rev-parse', 'HEAD').trim()
    const extra = {}
    if (phase === 'before') fs.writeFileSync(path.join(box.app, 'owner.txt'), 'keep')
    if (phase === 'backup') extra.UPDATE_BACKUP = 'printf keep > owner.txt'
    if (phase === 'build') extra.UPDATE_BUILD = 'cd "$UPDATE_APP_DIR"; printf keep > VERSION; false'
    if (phase === 'commit') extra.UPDATE_BUILD = 'cd "$UPDATE_APP_DIR"; printf keep > VERSION; git add VERSION; git -c user.name=owner -c user.email=owner@example.invalid commit -qm owner; false'
    const result = runManualUpdate(box, extra)
    assert.notEqual(result.code, 0, result.stderr)
    assert.equal(fs.readFileSync(path.join(box.app, ['build','commit'].includes(phase) ? 'VERSION' : 'owner.txt'), 'utf8'), 'keep')
    if (!['build','commit'].includes(phase)) assert.equal(box.git('rev-parse', 'HEAD').trim(), before)
    if (phase === 'commit') assert.equal(box.git('log','-1','--format=%s').trim(),'owner')
    assert.equal(fs.existsSync(path.join(box.dir, 'state', 'lock')), false)
  }
})

test('tag update also preserves edits that appear after preflight', () => {
  for (const phase of ['backup', 'build']) {
    const box = sandbox()
    const result = runUpdate(box, 'v1.1.0', { [phase === 'backup' ? 'UPDATE_BACKUP' : 'UPDATE_BUILD']: 'cd "$UPDATE_APP_DIR"; printf keep > VERSION; ' + (phase === 'build' ? 'false' : 'true') })
    assert.notEqual(result.code, 0)
    assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8'), 'keep')
  }
})

test('manual Ubuntu update stops before any change when the disk is too full to build', () => {
  const box = sandbox()
  const capturedVersion = path.join(box.dir, 'unexpected-backup')
  const result = runManualUpdate(box, { UPDATE_MIN_FREE_MB: '9999999', UPDATE_BACKUP: `cp VERSION "${capturedVersion}"` })
  assert.equal(result.code, 2, result.stderr)
  assert.match(result.stderr, /MB free/)
  assert.equal(fs.existsSync(capturedVersion), false, 'no backup, no new code')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
  assert.equal(fs.existsSync(path.join(box.dir, 'state', 'lock')), false)
})

test('going back to an earlier version backs up first and records it, and a later update still works', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'manual-healthy'), 'ok')
  const old = box.git('rev-parse', 'HEAD').trim()
  assert.equal(runManualUpdate(box).code, 0)
  const history = () => fs.readFileSync(path.join(box.dir, 'state', 'history.log'), 'utf8').trim().split('\n').map((line) => line.split(' '))
  assert.equal(history().at(-1)[1], old, 'an update remembers the version it replaced')
  const capturedVersion = path.join(box.dir, 'version-at-backup')
  const back = runManualUpdate(box, { UPDATE_ROLLBACK_TO: old, UPDATE_BACKUP: `cp VERSION "${capturedVersion}"` })
  assert.equal(back.code, 0, back.stderr)
  assert.equal(fs.readFileSync(capturedVersion, 'utf8').trim(), '1.1.0', 'the state being left is backed up')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
  assert.equal(history().at(-1)[2], old)
  assert.equal(runManualUpdate(box, { UPDATE_ROLLBACK_TO: 'main; rm -rf /' }).code, 2, 'only a commit id is accepted')
  assert.equal(runManualUpdate(box).code, 0, 'the next update comes forward again')
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.1.0')
})

test('both update paths build with the packages NODE_ENV=production would leave out', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'manual-healthy'), 'ok')
  const seen = path.join(box.dir, 'npm-args'), npm = path.join(box.dir, 'npm')
  fs.writeFileSync(npm, `#!/bin/sh\necho "$NODE_ENV $*" >> "${seen}"\n`); fs.chmodSync(npm, 0o755)
  assert.equal(runManualUpdate(box, { UPDATE_NPM: npm, NODE_ENV: 'production' }).code, 0)
  assert.match(fs.readFileSync(seen, 'utf8'), /production ci --include=dev/)
  assert.match(read('deploy/ubuntu/self-update.sh'), /"\$NPM" ci --include=dev/)
})

test('the panel update builds with the same Node heap as the installer and update.sh', () => {
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'healthy'), 'ok')
  const seen = path.join(box.dir, 'node-options')
  const ok = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: `mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; printf '%s' "$NODE_OPTIONS" > "${seen}"` })
  assert.equal(ok.code, 0, ok.stderr + ok.log)
  assert.equal(fs.readFileSync(seen, 'utf8'), '--max-old-space-size=4096', 'a 2 GB default heap ended a real build half way')
  const big = sandbox(); fs.writeFileSync(path.join(big.dir, 'healthy'), 'ok')
  assert.equal(runUpdate(big, 'v1.1.0', { BUILD_MEMORY_MB: '6144', UPDATE_BUILD: `mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; printf '%s' "$NODE_OPTIONS" > "${seen}"` }).code, 0)
  assert.equal(fs.readFileSync(seen, 'utf8'), '--max-old-space-size=6144')
  const bad = sandbox(), r = runUpdate(bad, 'v1.1.0', { BUILD_MEMORY_MB: '4g; id' })
  assert.equal(r.code, 2); assert.equal(fs.readFileSync(path.join(bad.app, 'VERSION'), 'utf8').trim(), '1.0.0')
})

test('files the build rewrites never block an update or its rollback, and a copy of them is kept', () => {
  // Left over from the previous build: the update goes ahead and keeps the old difference as a patch.
  const box = sandbox()
  fs.writeFileSync(path.join(box.dir, 'healthy'), 'ok')
  fs.writeFileSync(path.join(box.app, 'tsconfig.json'), '{"jsx":"react-jsx"}\n')
  fs.writeFileSync(path.join(box.app, 'src/themes/generated.css'), '/* rebuilt */\r\n')
  const r = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: 'mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; printf x >> tsconfig.json' })
  assert.equal(r.code, 0, r.stderr + r.log)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.1.0')
  assert.equal(box.git('status', '--porcelain').trim(), '', 'the files this build rewrote are restored too')
  const kept = fs.readdirSync(path.join(box.dir, 'state')).filter((name) => /^build-files-.*\.patch$/.test(name))
  assert.ok(kept.length >= 1)
  assert.ok(kept.some((name) => /react-jsx/.test(fs.readFileSync(path.join(box.dir, 'state', name), 'utf8'))), 'the difference left by the previous build is kept')

  // The new version does not start after its build rewrote them: the rollback still happens.
  const back = sandbox(), health = path.join(back.dir, 'healthy')
  const build = `mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; printf x >> tsconfig.json; if grep -q '^1.1.0' VERSION; then rm -f "${health}"; else touch "${health}"; fi`
  const rb = runUpdate(back, 'v1.1.0', { UPDATE_BUILD: build, UPDATE_RESTART: `if grep -q '^1.0.0' VERSION; then touch "${health}"; fi` })
  assert.equal(rb.state.status, 'rolled-back', JSON.stringify(rb.state) + rb.log)
  assert.equal(fs.readFileSync(path.join(back.app, 'VERSION'), 'utf8').trim(), '1.0.0')

  const manual = sandbox(), mhealth = path.join(manual.dir, 'manual-healthy')
  fs.writeFileSync(path.join(manual.app, 'tsconfig.json'), '{"left":"over"}\n')
  const mr = runManualUpdate(manual, { UPDATE_BUILD: `mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; printf x >> tsconfig.json; if grep -q '^1.1.0' VERSION; then rm -f "${mhealth}"; fi`, UPDATE_RESTART: `if grep -q '^1.0.0' VERSION; then touch "${mhealth}"; fi` })
  assert.equal(mr.code, 1, mr.stderr); assert.match(mr.stderr, /application rolled back/)
  assert.equal(fs.readFileSync(path.join(manual.app, 'VERSION'), 'utf8').trim(), '1.0.0')

  // Anything else is still owner work and still stops the update.
  const owner = sandbox()
  fs.writeFileSync(path.join(owner.app, 'tsconfig.json'), '{"jsx":"react-jsx"}\n')
  fs.writeFileSync(path.join(owner.app, 'VERSION'), 'owner edit\n')
  assert.equal(runUpdate(owner, 'v1.1.0').code, 2)
  assert.equal(fs.readFileSync(path.join(owner.app, 'VERSION'), 'utf8'), 'owner edit\n')
  const list = (file) => read(file).match(/^BUILD_WRITTEN=\((.*)\)\r?$/m)?.[1]
  assert.ok(list('deploy/ubuntu/self-update.sh')); assert.equal(list('deploy/ubuntu/self-update.sh'), list('deploy/ubuntu/update.sh'))
})

test('a fetch that hangs on a filtered network stops with a clear failure instead of waiting forever', async () => {
  const net = require('node:net')
  const { spawn } = require('node:child_process')
  const sockets = []
  // Accepts the connection and never answers, like a throttled route to GitHub.
  const server = net.createServer((socket) => sockets.push(socket))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const box = sandbox()
    box.git('remote', 'set-url', 'origin', `http://127.0.0.1:${server.address().port}/repo.git`)
    const started = Date.now()
    const env = { ...process.env, UPDATE_STATE_DIR: path.join(box.dir, 'state'), UPDATE_NPM: 'true', UPDATE_STOP: 'true', UPDATE_BACKUP: 'true', UPDATE_RESTART: 'true', UPDATE_ENV_FILE: '/nonexistent', UPDATE_BUILD: 'true', UPDATE_FETCH_STALL: '2', UPDATE_FETCH_TIMEOUT: '3' }
    const code = await new Promise((resolve) => spawn('bash', ['deploy/ubuntu/self-update.sh', 'v1.1.0'], { cwd: box.app, env }).on('exit', resolve))
    assert.equal(code, 1)
    assert.ok(Date.now() - started < 40_000, 'the fetch has a time limit')
    const state = JSON.parse(fs.readFileSync(path.join(box.dir, 'state', 'state.json'), 'utf8'))
    assert.equal(state.status, 'failed'); assert.match(state.step, /UPDATE_GIT_PROXY/)
    const log = fs.readFileSync(path.join(box.dir, 'state', 'update.log'), 'utf8')
    assert.match(log, /HTTP\/1\.1/, 'one more try over HTTP/1.1'); assert.match(log, /Git bundle/)
    assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0')
  } finally { for (const socket of sockets) socket.destroy(); server.close() }
})

test('the fetch helper refuses a malformed proxy and never prints the proxy address', () => {
  const box = sandbox()
  const bad = spawnSync('bash', ['deploy/ubuntu/git-fetch.sh', '--tags', 'origin'], { cwd: box.app, env: { ...process.env, UPDATE_GIT_PROXY: 'socks5h://x; id' }, encoding: 'utf8' })
  assert.equal(bad.status, 2); assert.match(bad.stderr, /invalid UPDATE_GIT_PROXY/)
  const ok = spawnSync('bash', ['deploy/ubuntu/git-fetch.sh', '--tags', 'origin'], { cwd: box.app, env: { ...process.env, UPDATE_GIT_PROXY: 'http://user:secret@127.0.0.1:9' }, encoding: 'utf8' })
  assert.equal(ok.status, 0, 'a local origin (a Git bundle or folder) needs no network: ' + ok.stderr)
  assert.doesNotMatch(ok.stderr, /secret/)
})

test('what the site writes never counts as a local change that blocks an update', () => {
  assert.match(read('.gitignore'), /^\/storage\/\r?$/m)
  assert.match(read('.gitignore'), /^var\/\r?$/m)
})

test('the one-command installer and the mobocom command keep what is already there', () => {
  const installer = read('deploy/ubuntu/install.sh'), helper = read('deploy/ubuntu/mobocom')
  for (const file of ['deploy/ubuntu/install.sh', 'deploy/ubuntu/mobocom', 'deploy/ubuntu/updater-install.sh', 'deploy/ubuntu/mobocom-update']) assert.equal(spawnSync('bash', ['-n', file], { cwd: root }).status, 0, file)
  for (const option of ['--domain','--email','--branch','--repo']) {
    const invalid=spawnSync('bash',['deploy/ubuntu/install.sh',option],{cwd:root,encoding:'utf8'})
    assert.notEqual(invalid.status,0)
    assert.match(invalid.stderr,/missing value/, 'bad arguments fail before privileged installation')
  }
  assert.match(installer, /if \[ ! -f "\$ENV_FILE" \]; then/, 'an existing settings file is never rewritten')
  assert.match(installer, /already exists but \$ENV_FILE is missing/, 'a database without its settings stops the installer')
  assert.match(installer, /select 1 from pg_database/, 'an existing database is never recreated')
  assert.doesNotMatch(installer + helper, /db push|deploy:seed|dropdb|DROP DATABASE|git reset|--force-reset/)
  assert.match(installer, /\.next\/BUILD_ID/, 'an installed site is not rebuilt')
  assert.doesNotMatch(helper, /\. "\$ENV_FILE"/, 'root reads settings; it never runs the file the site may write')
  assert.match(read('scripts/host-backup-db.cjs'), /--single-transaction/)
  assert.doesNotMatch(helper, /tar -x|chown -R|--dbname=/, 'root neither unpacks uploads nor exposes DB credentials')
  assert.match(helper, /as_app python3 deploy\/ubuntu\/restore-files.py extract/)
})

test('Ubuntu host backup keeps archives outside storage and validates them before publishing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobocom-host-backup-'))
  const app = path.join(dir, 'app')
  const bin = path.join(dir, 'bin')
  const host = path.join(dir, 'host-backups')
  const envFile = path.join(dir, 'mobocom.env')
  fs.mkdirSync(path.join(app, 'storage', 'uploads'), { recursive: true })
  fs.mkdirSync(path.join(app, 'storage', 'backups'), { recursive: true })
  fs.mkdirSync(path.join(app, 'storage', 'update', 'lock'), { recursive: true })
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(app, 'storage', 'uploads', 'live.txt'), 'user upload')
  fs.writeFileSync(path.join(app, 'storage', 'backups', 'old.dump.enc'), 'existing app backup')
  fs.writeFileSync(envFile, 'DATABASE_URL=postgresql://fixture:fixture@localhost:5432/fixture?schema=public\nBACKUP_DIR=storage/backups\n')
  const dump = path.join(bin, 'pg_dump')
  const restore = path.join(bin, 'pg_restore')
  fs.writeFileSync(dump, '#!/bin/sh\n[ "$PGPASSWORD" = fixture ] || exit 98\ncase "$*" in *fixture*|*postgresql*|*schema=*) exit 99 ;; esac\nprintf "fixture dump\\n"\n')
  fs.writeFileSync(restore, '#!/bin/sh\n[ "${FAIL_DUMP_LIST:-0}" = "1" ] && exit 17\n[ "$1" = "--list" ]\n')
  fs.chmodSync(dump, 0o755)
  fs.chmodSync(restore, 0o755)
  const baseEnv = { ...process.env, MOBOCOM_ENV_FILE: envFile, MOBOCOM_APP_DIR: app, HOST_BACKUP_DIR: host, PATH: `${bin}${path.delimiter}${process.env.PATH}` }
  const run = (extra = {}) => spawnSync('bash', ['deploy/ubuntu/backup.sh'], { cwd: root, env: { ...baseEnv, ...extra }, encoding: 'utf8', timeout: 60_000 })

  const ok = run()
  assert.equal(ok.status, 0, ok.stderr)
  const files = fs.readdirSync(host)
  assert.equal(files.filter((name) => name.endsWith('.dump')).length, 1)
  const archive = path.join(host, files.find((name) => name.endsWith('.tar.gz')))
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  assert.equal(listing.status, 0, listing.stderr)
  assert.match(listing.stdout, /storage\/uploads\/live\.txt/)
  assert.doesNotMatch(listing.stdout, /storage\/backups\/old\.dump\.enc/)
  assert.doesNotMatch(listing.stdout, /storage\/update/, 'a running update\'s lock is never restored later')
  for (const name of files) assert.equal(fs.statSync(path.join(host, name)).mode & 0o077, 0, 'only the owner reads a backup')
  const locked = spawnSync('flock', [path.join(host,'.backup.lock'), 'bash','deploy/ubuntu/backup.sh'], {cwd:root,env:baseEnv,encoding:'utf8',timeout:60000})
  assert.equal(locked.status,3,'backup publication/pruning cannot race')
  assert.notEqual(run({KEEP_DAYS:'0; touch should-not-exist'}).status,0,'invalid retention is refused')

  const legacyHost = path.join(dir, 'legacy-host-backups')
  fs.writeFileSync(envFile, `DATABASE_URL=postgresql://fixture:fixture@localhost:5432/fixture?schema=public\nBACKUP_DIR=${legacyHost}\n`)
  const legacy = run({ HOST_BACKUP_DIR: '' })
  assert.equal(legacy.status, 0, legacy.stderr)
  assert.equal(fs.readdirSync(legacyHost).filter((name) => name.endsWith('.dump')).length, 1, 'absolute legacy backup path remains supported')

  const failedHost = path.join(dir, 'failed-host-backups')
  const failed = run({ HOST_BACKUP_DIR: failedHost, FAIL_DUMP_LIST: '1' })
  assert.notEqual(failed.status, 0, 'a dump that cannot be listed blocks the update')
  assert.deepEqual(fs.readdirSync(failedHost), ['.backup.lock'], 'failed archives are never published')

  const insideStorage = run({ HOST_BACKUP_DIR: path.join(app, 'storage', 'backups') })
  assert.notEqual(insideStorage.status, 0, 'host backups cannot be written inside app storage')
  assert.deepEqual(fs.readdirSync(path.join(app, 'storage', 'backups')), ['old.dump.enc'])

  const relativeHost = run({ HOST_BACKUP_DIR: 'storage/backups' })
  assert.notEqual(relativeHost.status, 0, 'host backup destination must be absolute')
})

test('update script: a new version that does not start is rolled back automatically', () => {
  const box = sandbox()
  const health = path.join(box.dir, 'healthy')
  // "Building" 1.1.0 breaks the health check; building the old version fixes it.
  const build = `mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; if grep -q '^1.1.0' VERSION; then rm -f "${health}"; else touch "${health}"; fi`
  const r = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: build, UPDATE_RESTART: `if grep -q '^1.0.0' VERSION; then touch "${health}"; fi` })
  assert.equal(r.code, 1)
  assert.equal(r.state.status, 'rolled-back', JSON.stringify(r.state) + r.log)
  assert.equal(fs.readFileSync(path.join(box.app, 'VERSION'), 'utf8').trim(), '1.0.0', 'the old code is back')
  assert.match(r.log, /rolling back/)
})

test('update script: when even the rollback fails it says so', () => {
  const box = sandbox()
  const r = runUpdate(box, 'v1.1.0', { UPDATE_BUILD: 'mkdir -p .next node_modules; printf candidate > .next/BUILD_ID; false' })
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
  assert.match(installer, /NoNewPrivileges=false/)
  assert.match(read('deploy/ubuntu/mobocom-update'), /\[ -r /, 'bash entry point need not be chmodded by root in the app checkout')
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
