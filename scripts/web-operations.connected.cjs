// Explicit disposable PostgreSQL only. No host deployment, external ACME, real update or live restore.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process')
const { PrismaClient } = require('@prisma/client'), { NextRequest } = require('next/server')
assert(/test|check|editor_media/i.test(new URL(process.env.DATABASE_URL).pathname), 'owned test database required')
const db = new PrismaClient(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-operations-')), stamp = 'web-ops-' + Date.now()
const originalEnv = { ...process.env }, changed = new Map(); let expected = '', viewer = null, captured = [], certificateListing = '', domainChanged = false, domainBefore = null
const loadFactory = require('./connected-source-loader.cjs')
const mocks = {
  '@/platform/database/prisma': { db },
  '@/platform/database/migrate': { buildProvider: () => 'postgresql' },
  '@/extensions/generated/catalog': { extensionCatalog: [] }, '@/extensions/server/state': { saveExtensionState: async () => undefined },
  '@/modules/settings/server': { setSetting: async (key, value) => { if (!changed.has(key)) changed.set(key, await db.setting.findUnique({ where: { key } })); await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } }) } },
  '@/platform/observability/logger': { logEvent() {}, requestIdFrom: () => stamp },
  '@/platform/http/rate-limit': { clientIp: () => '127.0.0.1', rateLimitStrict: async () => ({ ok: true }) },
  '@/extensions/server/modules': { moduleGuard: async () => null, isModuleEnabled: async () => true },
  '@/platform/config/env': { env: key => process.env[key] || '', authSecret: () => 'owned-web-operations-secret-'.repeat(3) },
  '@/modules/identity/server/access': { requirePerm: async (_req, perm) => viewer?.permissions.includes(perm) ? viewer : null },
  '@/modules/server-panel/server/system': { command: async (file, args, timeout, cwd, input) => { captured.push({ file, args, input }); return { ok: true, out: args.includes('cert-list') ? certificateListing : 'OK' } } },
}
const state = folder => ({ configDirectory: () => folder, installMode: async () => await db.user.count({ where: { role: 'ADMIN' } }) ? 'installed' : 'needs-admin', isSetupMode: () => false, markInstalled() {}, runtimeEnvFile: () => path.join(folder, 'runtime.env'), lastErrorFile: () => path.join(folder, 'error'), installationToken: () => expected })
const load = loadFactory({ ...mocks, './state': state(dir), '@/modules/installer/server/state': state(dir) })
function request(url = '/api/install', method = 'GET', data, headers = {}) { return new NextRequest('https://site.invalid' + url, { method, headers: { host: 'site.invalid', origin: 'https://site.invalid', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) }) }
async function main() {
  assert.equal(await db.user.count({ where: { role: 'ADMIN' } }), 0, 'suite requires an empty installer database')
  process.env.NODE_ENV = 'production'
  const installer = load('src/modules/installer/server/http.ts')
  assert.equal((await installer.GET(request())).status, 503, 'production without install secret fails closed')
  expected = crypto.randomBytes(32).toString('hex')
  assert.equal((await installer.GET(request())).status, 401)
  assert.equal((await installer.GET(request('/api/install', 'GET', null, { 'x-install-token': expected }))).status, 200)
  assert.equal((await installer.POST(request('/api/install', 'POST', { op: 'site' }, { 'x-install-token': expected, origin: 'https://foreign.invalid' }))).status, 403)
  const first = load('src/modules/installer/server/setup.ts'), otherDir = path.join(dir, 'other')
  const second = loadFactory({ ...mocks, './state': state(otherDir), '@/modules/installer/server/state': state(otherDir) })('src/modules/installer/server/setup.ts')
  const data = { siteName: stamp, siteUrl: 'https://site.invalid', adminName: 'owned web operator', adminEmail: stamp + '@example.invalid', adminPassword: 'Owned-Web-Operations-Quartz-2049', modules: {} }
  const settled = await Promise.allSettled([first.installSite(data), second.installSite({ ...data, siteName: stamp + '-second', adminEmail: stamp + '-second@example.invalid' })])
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(settled.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 1)
  assert.equal(await db.user.count({ where: { role: 'ADMIN' } }), 1)
  assert.equal((await installer.GET(request())).status, 404)
  assert(!fs.existsSync(path.join(dir, 'install.operation.lock')) && !fs.existsSync(path.join(otherDir, 'install.operation.lock')))
  process.env.NODE_ENV = 'test'; process.env.SERVER_PANEL_ENABLED = 'true'; process.env.SERVER_PANEL_WEBCTL_SUDO = '0'; process.env.PANEL_CREDENTIAL_KEY = crypto.randomBytes(32).toString('hex'); process.env.SERVER_PANEL_CF_INI = path.join(dir, 'cloudflare.ini')
  const user = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
  viewer = { id: user.id, email: user.email, permissions: ['server.manage', 'settings.manage'] }
  const gate = load('src/modules/server-panel/server/gate.ts'), req = request('/api/admin/server/domains')
  assert.equal((await gate.serverGate(req)).response.status, 401)
  const token = gate.unlockToken(user.id, user.passwordHash, '127.0.0.1', 5)
  const unlocked = () => request('/api/admin/server/domains', 'GET', null, { cookie: 'mc_srv=' + token.value })
  assert.equal((await gate.serverGate(unlocked())).user.id, user.id)
  const goodViewer = viewer; viewer = { ...viewer, permissions: [] }; assert.equal((await gate.serverGate(unlocked())).response.status, 403); viewer = goodViewer
  process.env.SERVER_PANEL_ENABLED = 'false'; assert.equal((await gate.serverGate(unlocked())).response.status, 423); process.env.SERVER_PANEL_ENABLED = 'true'
  const domains = load('src/modules/server-panel/server/domains.ts')
  await domains.issueCertificate({ domain: 'example.com', method: 'standalone', email: 'owner@example.invalid' })
  assert.ok(captured.at(-1).args.includes('standalone'))
  await assert.rejects(domains.issueCertificate({ domain: 'example.com', wildcard: true, method: 'http', email: 'owner@example.invalid' }))
  const credentials = load('src/modules/providers/server/panel-credentials.ts')
  domainBefore = await db.setting.findUnique({ where: { key: 'server-panel.domains.v1' } })
  const domainValue = JSON.stringify({ sites: [], email: 'owner@example.invalid', cfToken: credentials.encryptPanelCredential('owned-scoped-token') })
  await db.setting.upsert({ where: { key: 'server-panel.domains.v1' }, create: { key: 'server-panel.domains.v1', value: domainValue }, update: { value: domainValue } }); domainChanged = true
  for (const [names, expiry] of [['wrong.example.com', '2036-01-01'], ['example.com', '2000-01-01']]) {
    certificateListing = `  Certificate Name: manual-example.com\n    Domains: ${names}\n    Expiry Date: ${expiry}T12:00:00+00:00 (VALID: 20 days)\n`
    await assert.rejects(domains.saveSite({ domain: 'example.com', mode: 'app', https: true, cert: 'manual-example.com' }), error => error.status === 409)
  }
  certificateListing = ''
  await domains.issueCertificate({ domain: 'example.com', wildcard: false, method: 'cloudflare', email: 'owner@example.invalid' })
  assert.ok(captured.at(-1).args.includes('cloudflare')); assert.equal(fs.statSync(process.env.SERVER_PANEL_CF_INI).mode & 0o777, 0o600)
  const cert = path.join(dir, 'cert.pem'), key = path.join(dir, 'key.pem')
  cp.execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', '/CN=example.com', '-addext', 'subjectAltName=DNS:example.com', '-addext', 'basicConstraints=critical,CA:FALSE', '-days', '2', '-out', cert, '-keyout', key], { stdio: 'ignore' })
  const imported = await domains.importCertificate({ domain: 'example.com', certificate: fs.readFileSync(cert, 'utf8'), privateKey: fs.readFileSync(key, 'utf8') })
  assert.equal(imported.name, 'manual-example.com'); assert.equal(imported.automaticRenewal, false)
  assert.ok(captured.at(-1).input); assert(!JSON.stringify(captured.at(-1).args).includes('PRIVATE KEY'))
  assert(!('payload' in imported) && !('privateKey' in imported))
  console.log('PostgreSQL web operations passed: install secret/origin/closed-site guards, two-instance first owner, server locks/permissions, DNS/standalone routing, private validated import.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  try {
    const users = await db.user.findMany({ where: { email: { startsWith: stamp } }, select: { id: true } })
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users.map(u => u.id) } } }); await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } })
    for (const [key, row] of changed) { if (row) await db.setting.upsert({ where: { key }, create: row, update: { value: row.value } }); else await db.setting.deleteMany({ where: { key } }) }
    if (domainChanged) { if (domainBefore) await db.setting.update({ where: { key: domainBefore.key }, data: { value: domainBefore.value } }); else await db.setting.deleteMany({ where: { key: 'server-panel.domains.v1' } }) }
  } finally { await db.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]; Object.assign(process.env, originalEnv) }
})
