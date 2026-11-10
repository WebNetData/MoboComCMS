// Google sign-in on native PostgreSQL with the actual NextAuth provider; only Google's token endpoint, the site URL and
// the cache are doubles. Owned rows (email prefix, settings snapshot) are removed or restored at the end.
// Run (project root, migrated database): node scripts/google-login.connected.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript-api'), crypto = require('node:crypto')
const { PrismaClient } = require('@prisma/client'), prisma = new PrismaClient(), cache = new Map(), stamp = `owned-google-${Date.now()}`
const KEY = 'security.google-login.v1', CLIENT = '123456789012-abcdefgh12345678.apps.googleusercontent.com', SECRET = 'GOCSPX-owned_fixture_secret_123', BASE = 'https://example.test'
const store = new Map(), live = (k) => { const r = store.get(k); if (!r) return null; if (r.e <= Date.now()) { store.delete(k); return null } return r }
const memoryKv = {
  kind: 'memory',
  async get(k) { return live(k)?.v ?? null }, async set(k, v, t) { store.set(k, { v, e: Date.now() + t }) }, async del(k) { store.delete(k) },
  async delPrefix(p) { for (const k of store.keys()) if (k.startsWith(p)) store.delete(k) },
  async incr(k, w) { const r = live(k); const n = (r ? Number(r.v) : 0) + 1; store.set(k, { v: String(n), e: r?.e ?? Date.now() + w }); return n },
  async hit(k, w) { const count = await this.incr(k, w); return { count, ttlMs: w } }, async lock(k, t) { if (live(k)) return false; store.set(k, { v: '1', e: Date.now() + t }); return true }, async ping() { return 0 },
}
let tokenAnswer = null, requests = []
const mocks = {
  '@/platform/database/prisma': { db: prisma }, '@/platform/config/env': { authSecret: () => 'owned-google-fixture-secret' },
  '@/platform/cache/kv': { kv: async () => memoryKv, cached: async (k, t, work) => work(), invalidate: async () => {} },
  '@/platform/observability/logger': { logEvent: () => {} }, '@/modules/identity/server/access': { clearAdminPolicyCache: () => {} },
  '@/modules/site/server/site-url': { siteBaseUrl: async () => BASE },
  '@/modules/social/server/egress': { egressFetch: async (url, init) => { requests.push({ url: String(url), init }); if (tokenAnswer instanceof Error) throw tokenAnswer; return new Response(JSON.stringify(tokenAnswer.body), { status: tokenAnswer.status || 200 }) } },
  '@/modules/notifications/server/telegram': {}, '@/modules/identity/telegram-account': {},
}
function load(relative) {
  const file = path.resolve(relative); if (cache.has(file)) return cache.get(file).exports
  const mod = { exports: {} }; cache.set(file, mod)
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('@/') && /\.(json|cjs)$/.test(name)) return require(path.resolve('src', name.slice(2)))
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(file), name)
      const canonical = '@/' + path.relative(path.resolve('src'), base).replaceAll('\\', '/')
      if (Object.hasOwn(mocks, canonical)) return mocks[canonical]
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts'))
    }
    return require(name)
  }, mod, mod.exports)
  return mod.exports
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const idToken = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.c2lnbmF0dXJl`
const email = (i) => `${stamp}-${i}@example.com`
async function main() {
  const before = await prisma.setting.findUnique({ where: { key: KEY } })
  try {
    const g = load('src/modules/identity/server/google-login.ts'), { authOptions } = load('src/modules/identity/auth.ts')
    const provider = authOptions.providers.find(p => (p.options.id || p.id) === 'google').options
    const authorize = (input) => provider.authorize(input, { headers: { 'x-real-ip': stamp } })

    // ---- settings: enabling needs an ID and a secret; the secret is stored encrypted when a key exists and never shown
    await prisma.setting.deleteMany({ where: { key: KEY } })
    await assert.rejects(() => g.saveGoogleLogin({ enabled: true, clientId: CLIENT }), e => e.status === 422)
    await assert.rejects(() => g.saveGoogleLogin({ clientId: 'not-a-client' }), e => e.status === 422)
    const saved = await g.saveGoogleLogin({ enabled: true, clientId: CLIENT, clientSecret: SECRET, signup: true })
    if (process.env.PANEL_CREDENTIAL_KEY) assert.ok(saved.clientSecret.startsWith('encv1:') && !saved.clientSecret.includes(SECRET), 'secret encrypted at rest')
    assert.equal(g.publicGoogleSettings(saved).clientSecret, '')
    assert.equal(g.publicGoogleSettings(saved).secretSaved, true)
    const kept = await g.saveGoogleLogin({ signup: true, clientSecret: '' })
    assert.equal(kept.clientSecret, saved.clientSecret, 'an empty field keeps the saved secret')
    assert.equal(await g.googleLoginAvailable(), true)

    const begin = async (opts = { intent: 'login', next: '/dashboard/orders' }) => {
      const { url, state } = await g.startGoogleSignIn(opts)
      const u = new URL(url)
      assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
      assert.equal(u.searchParams.get('client_id'), CLIENT)
      assert.equal(u.searchParams.get('redirect_uri'), `${BASE}/api/login/google/callback`)
      assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
      assert.equal(u.searchParams.get('state'), state)
      return { state, nonce: u.searchParams.get('nonce'), challenge: u.searchParams.get('code_challenge') }
    }
    const answer = (nonce, claims = {}) => { const now = Math.floor(Date.now() / 1000); tokenAnswer = { body: { id_token: idToken({ iss: 'https://accounts.google.com', aud: CLIENT, iat: now, exp: now + 3600, nonce, email_verified: true, ...claims }) } } }
    const finish = (state, extra = {}) => g.finishGoogleSignIn({ code: 'code-' + stamp, state, browserState: state, ...extra })
    const fails = (promise, code) => assert.rejects(promise, e => e.code === code, code)

    // ---- a new member: the account is created by the verified address; the exchange carries the PKCE verifier and secret
    let flow = await begin()
    await fails(g.finishGoogleSignIn({ code: 'x', state: flow.state, browserState: 'A'.repeat(43) }), 'expired') // another browser
    answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email(1).toUpperCase(), name: '  Owned   Member ' })
    requests = []
    const first = await finish(flow.state)
    assert.equal(first.kind, 'ticket'); assert.equal(first.next, '/dashboard/orders')
    const sent = new URLSearchParams(requests[0].init.body)
    assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token')
    assert.equal(crypto.createHash('sha256').update(sent.get('code_verifier')).digest('base64url'), flow.challenge)
    assert.equal(sent.get('client_secret'), SECRET); assert.equal(sent.get('redirect_uri'), `${BASE}/api/login/google/callback`)
    const created = await prisma.user.findUnique({ where: { googleId: `${stamp}-sub-1` } })
    assert.equal(created.email, email(1)); assert.equal(created.name, 'Owned Member'); assert.equal(created.googleEmail, email(1))
    await fails(finish(flow.state), 'expired') // the state is used once

    // ---- the ticket becomes the session once
    const session = await authorize({ ticket: first.ticket })
    assert.equal(session.id, String(created.id))
    assert.equal(await authorize({ ticket: first.ticket }), null)

    // ---- signing in again finds the same member by the Google account, not by email
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email('changed') })
    const again = await finish(flow.state)
    assert.equal((await authorize({ ticket: again.ticket })).id, String(created.id))
    assert.equal(await prisma.user.count({ where: { email: { startsWith: stamp } } }), 1)

    // ---- an address already used by an account is never joined silently
    const existing = await prisma.user.create({ data: { email: email(2), name: 'Existing', passwordHash: 'x' } })
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-2`, email: email(2) })
    await fails(finish(flow.state), 'email-exists')
    assert.equal((await prisma.user.findUnique({ where: { id: existing.id } })).googleId, null)

    // ---- unverified address, closed sign-up, Google's refusal, bad claims, Google unreachable
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-3`, email: email(3), email_verified: false })
    await fails(finish(flow.state), 'unverified')
    await g.saveGoogleLogin({ signup: false })
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-4`, email: email(4) })
    await fails(finish(flow.state), 'signup-closed')
    await g.saveGoogleLogin({ signup: true })
    flow = await begin(); await fails(finish(flow.state, { error: 'access_denied' }), 'cancelled')
    await fails(finish(flow.state), 'expired')
    for (const claims of [{ nonce: 'other' }, { aud: 'someone-else.apps.googleusercontent.com' }, { iss: 'https://evil.example' }, { exp: Math.floor(Date.now() / 1000) - 3600 }]) {
      flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-5`, email: email(5), ...claims })
      await fails(finish(flow.state), 'failed')
    }
    flow = await begin(); tokenAnswer = { status: 400, body: { error: 'invalid_grant' } }; await fails(finish(flow.state), 'failed')
    flow = await begin(); tokenAnswer = new Error('ECONNRESET'); await fails(finish(flow.state), 'unreachable')
    assert.equal(await prisma.user.count({ where: { email: { startsWith: stamp } } }), 2)

    // ---- two returns with the same state at once: one wins
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email(1) })
    const raced = await Promise.allSettled([finish(flow.state), finish(flow.state)])
    assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1)

    // ---- 2-step sign-in: the ticket waits for the code and is used only when it is right
    await prisma.user.update({ where: { id: created.id }, data: { totpEnabledAt: new Date() } })
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email(1) })
    const guarded = await finish(flow.state)
    await assert.rejects(() => authorize({ ticket: guarded.ticket }), /TOTP_REQUIRED/)
    await assert.rejects(() => authorize({ ticket: guarded.ticket, totp: '000000' }), /TOTP_INVALID/)
    await prisma.user.update({ where: { id: created.id }, data: { totpEnabledAt: null } })
    assert.equal((await authorize({ ticket: guarded.ticket })).id, String(created.id), 'the ticket survived the code prompts')

    // ---- a banned member cannot sign in with Google
    await prisma.user.update({ where: { id: created.id }, data: { status: 'BANNED' } })
    flow = await begin(); answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email(1) })
    await fails(finish(flow.state), 'not-allowed')
    await prisma.user.update({ where: { id: created.id }, data: { status: 'ACTIVE' } })

    // ---- connecting from account settings: by the signed-in member, one Google account each
    flow = await begin({ intent: 'link', userId: existing.id, next: '/dashboard/profile' }); answer(flow.nonce, { sub: `${stamp}-sub-1`, email: email(1) })
    await fails(finish(flow.state), 'already-linked')
    flow = await begin({ intent: 'link', userId: existing.id }); answer(flow.nonce, { sub: `${stamp}-sub-2`, email: 'someone@gmail.com', email_verified: false })
    assert.equal((await finish(flow.state)).kind, 'linked')
    const linked = await prisma.user.findUnique({ where: { id: existing.id } })
    assert.equal(linked.googleId, `${stamp}-sub-2`); assert.equal(linked.email, email(2), 'the account keeps its own email')
    flow = await begin({ intent: 'link', userId: existing.id }); answer(flow.nonce, { sub: `${stamp}-sub-9`, email: email(9) })
    await fails(finish(flow.state), 'other-google')
    await assert.rejects(() => g.startGoogleSignIn({ intent: 'link' }), e => e.code === 'not-allowed')

    // ---- disconnecting only while another way in remains
    assert.equal((await g.googleConnection(created.id)).canDisconnect, false, 'an account Google made has no other way in')
    await assert.rejects(() => g.disconnectGoogle(created.id), e => e.status === 409)
    assert.equal((await g.googleConnection(existing.id)).canDisconnect, false)
    await prisma.user.update({ where: { id: existing.id }, data: { passwordChangedAt: new Date() } })
    assert.equal((await g.googleConnection(existing.id)).canDisconnect, true)
    await g.disconnectGoogle(existing.id)
    assert.equal((await prisma.user.findUnique({ where: { id: existing.id } })).googleId, null)

    // ---- switched off: no new flows
    await g.saveGoogleLogin({ enabled: false })
    await assert.rejects(() => g.startGoogleSignIn({ intent: 'login' }), e => e.code === 'unavailable')
    console.log('google-login connected: all checks passed')
  } finally {
    await prisma.user.deleteMany({ where: { email: { startsWith: stamp } } })
    if (before) await prisma.setting.upsert({ where: { key: KEY }, create: before, update: { value: before.value } }); else await prisma.setting.deleteMany({ where: { key: KEY } })
    await prisma.$disconnect()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
