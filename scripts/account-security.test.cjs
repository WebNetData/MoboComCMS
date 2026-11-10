const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript-api')

const cache = new Map()
function load(relative) {
  let file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
  if (!fs.existsSync(file)) file = file.slice(0, -3) + '/index.ts'
  if (cache.has(file)) return cache.get(file).exports
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  cache.set(file, mod)
  const localRequire = (specifier) => (specifier.startsWith('@/') ? load(`src/${specifier.slice(2)}`) : require(specifier))
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports)
  return mod.exports
}
const read = (relative) => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8')

const sec = load('src/modules/identity/domain/account-security')
const { safeNext, authEntryHref } = load('src/modules/identity/domain/continuation')
const totp = load('src/shared/security/totp')
const verify = load('src/shared/security/totp-verify')
const seals = load('src/modules/site/config/trust-seals')
const userGroups = load('src/modules/account/domain/user-groups')
const audiences = load('src/modules/account/domain/item-audience')
const sectionAudience = load('src/modules/account/domain/section-access')

test('password login normalizes verified-mobile candidates and email without changing the credential contract', () => {
  const { loginIdentifier } = load('src/modules/identity/domain/login-identifier')
  for (const input of ['09123456789', '+989123456789', '00989123456789', '۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩']) assert.deepEqual(loginIdentifier(input), { kind: 'phone', value: '+989123456789' })
  assert.deepEqual(loginIdentifier('  Member@Example.COM  '), { kind: 'email', value: 'member@example.com' })
  for (const input of [null, {}, '0912', '', 'person@invalid', 'a'.repeat(255)]) assert.equal(loginIdentifier(input), null)
})

test('user groups validate bounded capabilities without accepting fractional or negative discounts', () => {
  const group = userGroups.normalizeGroup({ name: 'گروه خریداران' })
  assert.equal(group.discountPercent, 0)
  for (const discountPercent of [-1, 91, 1.5, 'not-a-number']) assert.throws(() => userGroups.normalizeGroup({ name: 'مشتریان', discountPercent }))
  assert.equal(userGroups.normalizeGroup({ name: 'مشتریان', color: 'url(bad)', active: false }).color, '#4b45ee')
})

test('group pricing chooses the cheapest regular, product, variant and percentage price without creating a free order', () => {
  const deal = { percent: 20, prices: new Map([['1:0', 700n], ['1:3', 900n]]) }
  assert.equal(userGroups.dealPrice(1000n, deal, 1, 3), 700n)
  assert.equal(userGroups.dealPrice(600n, deal, 1, 3), 480n)
  assert.equal(userGroups.dealPrice(1000n, { percent: 0, prices: new Map() }, 1, null), 1000n)
  assert.equal(userGroups.dealPrice(1n, { percent: 90, prices: new Map() }, 1, null), 1n)
})

test('item audience writes reject malformed input rather than silently opening a limited item', () => {
  assert.equal(audiences.storedAudience([]), '')
  assert.equal(audiences.storedAudience(['group:2', 'vip', 'group:2']), '["group:2","vip"]')
  for (const value of [null, {}, 'group:2', ['unknown'], ['group:2', 1]]) assert.throws(() => audiences.storedAudience(value))
  assert.deepEqual(audiences.parseAudience('not-json'), [])
  assert.equal(audiences.AUDIENCE_ITEMS.prompt.permission, 'prompts.manage')
  assert.equal(sectionAudience.sectionOfApi('/api/music/track/1'), 'music')
  assert.equal(sectionAudience.sectionOfApi('/api/music-other'), null)
})

test('account continuation preserves exact local paths and refuses external, malformed and looping destinations', () => {
  for (const value of ['/checkout/cart', '/products/example?option=1&name=%D8%A2#details', '/forum/topic/5', '/login-help', '/']) assert.equal(safeNext(value), value)
  for (const value of [undefined, null, [], '//evil.example', 'https://evil.example', '/\\evil.example', '/\nevil.example', '/%5cevil.example', '/%2fevil.example', '/%00', '/bad%escape', '/login?next=/cart', '/register#form', '/welcome?next=/welcome', '/a/../login', '/%6cogin', '/' + 'a'.repeat(500)]) assert.equal(safeNext(value), '', String(value))
})

test('account entry switches carry one destination without credentials or query injection', () => {
  const next = '/checkout/cart?coupon=a&b=2#review'
  let href = authEntryHref('/register', next)
  assert.equal(new URL(href, 'https://example.invalid').searchParams.get('next'), next)
  href = authEntryHref('/register', next, { method: 'password' })
  assert.equal(new URL(href, 'https://example.invalid').searchParams.get('method'), 'password')
  href = authEntryHref('/login', next, { registered: '1' })
  assert.equal(new URL(href, 'https://example.invalid').searchParams.get('next'), next)
  assert.equal(new URL(href, 'https://example.invalid').searchParams.get('registered'), '1')
  assert.equal(authEntryHref('/login', '//evil.example', { next: '/injected' }), '/login')
  assert.equal(authEntryHref('/register', ''), '/register')
})

test('request token access uses the same startup auth secret without loading authentication providers', async () => {
  const originalSecret = process.env.NEXTAUTH_SECRET, originalMode = process.env.NODE_ENV
  const source = ts.transpileModule(read('src/modules/identity/server/access.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  function access() {
    const mod = { exports: {} }
    const requireAccess = name => {
      if (name === 'next-auth/jwt') return { getToken: async ({ req, secret }) => ({ request: req, secret }) }
      if (name === '@/platform/config/env') return load('src/platform/config/env')
      if (name === '@/platform/database/prisma') return { db: {} }
      if (name === '@/modules/identity/rbac') return { hasPermission: () => false, parsePermissions: () => null }
      if (name === '@/modules/identity/domain/account-security') return sec
      if (name === '@/modules/identity/server/authentication-restrictions') return { globalAuthenticationDenied: () => { throw Error('Raw token decoding must not run authorization') } }
      throw Error(`Unexpected access dependency: ${name}`)
    }
    new Function('require', 'module', 'exports', source)(requireAccess, mod, mod.exports)
    return mod.exports
  }
  try {
    process.env.NODE_ENV = 'development'; process.env.NEXTAUTH_SECRET = ' configured-test-secret '
    const configured = access(), req = { fixture: true }
    process.env.NEXTAUTH_SECRET = 'runtime-change'
    assert.deepEqual(await configured.getRawToken(req), { request: req, secret: 'configured-test-secret' }, 'same startup snapshot as authOptions')
    delete process.env.NEXTAUTH_SECRET
    assert.equal((await access().getRawToken(req)).secret, 'dev-secret-change-me')
    process.env.NODE_ENV = 'production'; assert.throws(access, /NEXTAUTH_SECRET is required/)
  } finally {
    if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = originalSecret
    if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode
  }
})

test('a reset link is spent only by a password the final save will accept', () => {
  const source = read('src/modules/identity/server/account-security.ts')
  const reset = source.slice(source.indexOf('export async function resetWithToken'), source.indexOf('export async function resetWithSms'))
  assert.ok(reset.indexOf('passwordProblem(password, { email: owner?.email })') > 0, 'the account-derived rule runs here too')
  assert.ok(reset.indexOf('passwordProblem(password') < reset.indexOf('usedAt: null'), 'a refused password leaves the link usable')
})

test('password policy refuses short, trivial and account-derived passwords', () => {
  assert.match(sec.passwordProblem('short'), /۸/)
  assert.match(sec.passwordProblem('a'.repeat(129)), /۱۲۸/)
  assert.ok(sec.passwordProblem('12345678'))
  assert.ok(sec.passwordProblem('aaaaaaaaaa'))
  assert.ok(sec.passwordProblem('Password123'))
  assert.ok(sec.passwordProblem('myalireza!2024', { email: 'alireza@example.com' }))
  assert.equal(sec.passwordProblem('Tr0ub4dor&3-horse'), '')
  assert.equal(sec.passwordProblem(undefined).length > 0, true)
})

test('backup codes compare without separators or case', () => {
  assert.equal(sec.formatBackupCode('abcde12345'), 'abcde-12345')
  assert.equal(sec.normalizeBackupCode(' ABCDE-12345 '), 'abcde12345')
  assert.equal(sec.looksLikeBackupCode('abcde-12345'), true)
  assert.equal(sec.looksLikeBackupCode('123456'), false)
  assert.equal(sec.normalizeTotpInput('۱۲۳ ۴۵۶'), '123456')
  assert.equal(sec.normalizeTotpInput('١٢٣٤٥٦'), '123456')
})

test('a session signed in before the password changed is revoked', () => {
  const changed = new Date('2026-10-01T10:00:00Z')
  assert.equal(sec.sessionRevoked(changed.getTime() - 60_000, changed), true)
  assert.equal(sec.sessionRevoked(changed.getTime() + 5_000, changed), false)
  assert.equal(sec.sessionRevoked(changed.getTime() - 500, changed), false, 'clock slack')
  assert.equal(sec.sessionRevoked(undefined, changed), false, 'legacy tokens are stamped on first use')
  assert.equal(sec.sessionRevoked(Date.now(), null), false)
})

test('security policy normalises unknown input to safe defaults', () => {
  assert.deepEqual(sec.normalizeSecurityPolicy(null), { requireAdmin2fa: false, emailReset: true, smsReset: true, emailOtp: true })
  assert.deepEqual(sec.normalizeSecurityPolicy({ requireAdmin2fa: 'yes', emailReset: false }), { requireAdmin2fa: false, emailReset: false, smsReset: true, emailOtp: true })
  assert.equal(sec.maskEmail('alireza@gmail.com'), 'a******@gmail.com')
  assert.equal(sec.maskEmail('ab@x.io'), 'a**@x.io')
  assert.equal(sec.maskEmail('nope'), '')
})

test('TOTP matches RFC 6238 (SHA-1) and reports the matching step', () => {
  const secret = totp.base32Encode(new Uint8Array(Buffer.from('12345678901234567890')))
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  // RFC 6238 appendix B: T=59 → 94287082, T=1111111109 → 07081804 (last six digits)
  assert.equal(verify.totpCode(secret, 59_000), '287082')
  assert.equal(verify.totpCode(secret, 1_111_111_109_000), '081804')
  assert.equal(verify.matchTotp(secret, '287082', 59_000), 1)
  assert.equal(verify.matchTotp(secret, '287082', 89_000), 1, 'previous step is accepted for drift')
  assert.equal(verify.matchTotp(secret, '287082', 150_000), null)
  assert.equal(verify.matchTotp(secret, 'abc', 59_000), null)
  assert.match(totp.totpUri(secret, 'a@b.c', 'موبوکام'), /^otpauth:\/\/totp\/.+secret=GEZD/)
})

test('server panel keeps using the shared TOTP helpers', () => {
  const policy = load('src/modules/server-panel/domain/policy')
  assert.equal(typeof policy.base32Encode, 'function')
  assert.equal(policy.totpCounter(59_000).length, 8)
})

test('eNamad embed code keeps only its link and logo', () => {
  const code = `<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=123456&amp;Code=AbCdEf'><img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=123456&amp;Code=AbCdEf' alt='' style='cursor:pointer' code='AbCdEf'></a>`
  const seal = seals.parseSealCode(code)
  assert.equal(seal.kind, 'enamad')
  assert.equal(seal.href, 'https://trustseal.enamad.ir/?id=123456&Code=AbCdEf')
  assert.equal(seal.image, 'https://trustseal.enamad.ir/logo.aspx?id=123456&Code=AbCdEf')
})

test('Samandehi embed code: the link comes from its onclick', () => {
  const code = `<img referrerpolicy='origin' id = 'rgvjjzpgoeukfukzjxlzsizp' style = 'cursor:pointer' onclick = 'window.open("https://logo.samandehi.ir/Verify.aspx?id=987&p=xlaorfthmcsi", "Popup","toolbar=no")' alt = 'logo-samandehi' src = 'https://logo.samandehi.ir/logo.aspx?id=987&p=qftinbpd' />`
  const seal = seals.parseSealCode(code)
  assert.equal(seal.kind, 'samandehi')
  assert.equal(seal.href, 'https://logo.samandehi.ir/Verify.aspx?id=987&p=xlaorfthmcsi')
  assert.equal(seal.image, 'https://logo.samandehi.ir/logo.aspx?id=987&p=qftinbpd')
})

test('seal URLs must be https and issuer hosts cannot be spoofed', () => {
  assert.equal(seals.parseSealCode(`<img src="javascript:alert(1)">`), null)
  assert.equal(seals.parseSealCode(`<img src="http://example.com/a.png">`), null)
  assert.equal(seals.parseSealCode('no image here'), null)
  const spoof = seals.parseSealCode(`<a href="https://trustseal.enamad.ir.evil.com/x"><img src="https://trustseal.enamad.ir.evil.com/logo.png"></a>`)
  assert.equal(spoof.kind, 'custom')
  assert.equal(seals.safeSealUrl('https://user:pw@x.com/a.png'), '')
  const config = seals.normalizeTrustSeals({ seals: [
    { id: 'enamad', kind: 'enamad', image: 'https://evil.com/logo.png' },
    { id: 'ok', kind: 'custom', image: 'https://cdn.example.com/badge.png', href: 'javascript:alert(1)' },
    { id: 'ok', kind: 'custom', image: 'https://cdn.example.com/b.png', enabled: false },
  ] })
  assert.equal(config.seals.length, 2, 'an eNamad seal must point at eNamad')
  assert.equal(config.seals[0].href, '')
  assert.notEqual(config.seals[0].id, config.seals[1].id)
  assert.equal(seals.visibleSeals(config).length, 1)
  assert.equal(seals.visibleSeals({ ...config, enabled: false }).length, 0)
})

test('sign-in wiring: 2-step code, unspent SMS codes, revocation and staff policy', () => {
  const auth = read('src/modules/identity/auth.ts')
  assert.match(auth, /TOTP_REQUIRED/)
  assert.match(auth, /consume: false/, 'the SMS code is checked before the 2-step prompt without being used up')
  assert.match(auth, /sessionRevoked\(token\.authAt/)
  const access = read('src/modules/identity/server/access.ts')
  assert.match(access, /return resolveCurrentUser\(Number\(token\.uid\), token\.authAt, reader\)/, 'request and queued work share the canonical current identity through the selected reader')
  assert.match(access, /sessionRevoked\(authAt, current\.passwordChangedAt\)/)
  assert.match(access, /adminNeedsTwoFactor\(user, reader\) \? null : user/)
  const service = read('src/modules/identity/server/account-security.ts')
  assert.match(service, /step <= user\.totpLastStep/, 'a code is accepted once')
  assert.match(service, /tokenHash\(token\)/, 'only the hash of a reset token is stored')
  assert.match(service, /usedAt: null \}, data: \{ usedAt/, 'reset links are single use')
  const middleware = read('src/proxy.ts')
  assert.match(middleware, /\/reset-password' \? 'no-referrer'/)
})

// ---- ready-made roles: a manager of one part of the site gets that part only
test('section manager presets hold known permissions and stay inside their own section', () => {
  // The permission list includes what plugins declare, so their manifests are read too.
  const seen = new Map()
  const open = (file) => {
    const full = fs.existsSync(file) && fs.statSync(file).isFile() ? file : `${file}.ts`
    if (seen.has(full)) return seen.get(full).exports
    if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'))
    const mod = { exports: {} }; seen.set(full, mod)
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText
    new Function('require', 'module', 'exports', source)((name) => name.startsWith('@/') ? open(path.resolve(__dirname, '..', 'src', name.slice(2))) : name.startsWith('.') ? open(path.resolve(path.dirname(full), name)) : require(name), mod, mod.exports)
    return mod.exports
  }
  const rbac = open(path.resolve(__dirname, '..', 'src/modules/identity/rbac'))
  const known = new Set(rbac.ALL_PERMISSIONS)
  for (const [name, permissions] of Object.entries(rbac.ROLE_PRESETS)) {
    assert.ok(permissions.every((permission) => known.has(permission)), `${name} names a permission that does not exist`)
    assert.ok(rbac.ROLE_PRESET_LABELS[name], `${name} has no name in the role form`)
  }
  const own = { 'music-manager': 'music.manage', 'cinema-manager': 'cinema.manage', 'games-manager': 'games.manage', 'software-manager': 'software.manage', 'forum-manager': 'forum.moderate' }
  for (const [name, permission] of Object.entries(own)) {
    // dashboard.view opens the panel; the section's own permission is all else it gets.
    assert.deepEqual([...rbac.ROLE_PRESETS[name]].sort(), ['dashboard.view', permission].sort(), name)
    assert.equal(rbac.isFullAccess(rbac.ROLE_PRESETS[name].join(',')), false)
  }
  // cms.posts reaches every content section, so no single-section preset may carry it.
  for (const name of [...Object.keys(own), 'store-manager']) assert.equal(rbac.ROLE_PRESETS[name].includes('cms.posts'), false, name)
  assert.deepEqual(rbac.parsePermissions(rbac.ROLE_PRESETS['music-manager'].join(',')).sort(), ['dashboard.view', 'music.manage'])
  // A general manager saved before a core permission existed keeps full access: the role is stored as the list of core permissions of its day; forms.handle came later.
  const before = rbac.PERMISSIONS.filter((permission) => !rbac.CORE_ADDED_LATER.includes(permission)).join(',')
  assert.equal(rbac.isFullAccess(before), true)
  const held = rbac.parsePermissions(before)
  for (const permission of ['games.manage', 'music.manage', 'cinema.manage', 'software.manage', 'forms.handle', 'settings.manage']) assert.ok(held.includes(permission), permission)
  // Every core permission is either one of the originals or listed as added later — nothing in between.
  assert.ok(rbac.CORE_ADDED_LATER.every((permission) => rbac.PERMISSIONS.includes(permission)))
  assert.ok(rbac.CORE_ADDED_LATER.includes('forms.handle'))
  // Losing one of the originals is still not full access.
  assert.equal(rbac.isFullAccess(before.replace('roles.manage', 'x')), false)
})

// ---- cms.posts is the magazine, and only the magazine
test('the magazine permission is named only where the magazine is guarded', () => {
  const files = []
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) { if (entry.name !== 'generated') walk(full) } else if (/\.(ts|tsx|json)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('cms.posts')) files.push(path.relative(path.resolve(__dirname, '..'), full).split(path.sep).join('/')) } }
  walk(path.resolve(__dirname, '..', 'src'))
  // Each of these is the magazine itself (posts, their categories, comments, templates, newsletter, journal), the
  // or a list of "any content editor" that names every section (collections hold items of every section and take that list).
  assert.deepEqual(files.sort(), [
    // The typed audience registry maps only posts to the Magazine permission; each other type has its own.
    'src/modules/account/domain/item-audience.ts',
    // Read-only canonical documentation bundled for the engineering assistant; not an authorization consumer.
    'src/modules/ai/domain/engineering-knowledge.generated.json',
    // Operational tools/context map only Magazine creation/publication and Magazine records to this key.
    'src/modules/ai/domain/operations.ts', 'src/modules/ai/server/operations/context.ts',
    // Contextual advice maps the Magazine page only to its own manager/author guard.
    'src/modules/ai/server/page-assistant/access.ts',
    // Browser writing prompts/results are Magazine-only and never publish content.
    'src/modules/ai/server/http/chat-web.ts',
    // Visibility of the common operational AI entry: any existing tool's section
    // permission, never authority over another section; its APIs recheck each tool.
    'src/components/admin/ManageBar.tsx',
    // The component library is read by whoever builds pages in any section, to place components; changing it needs settings.manage.
    'src/modules/site/server/http/admin/components.ts', 'src/modules/packages/server/http/components.ts',
    'src/app/admin/layout.tsx', 'src/app/admin/roles/page.tsx',
    'src/modules/ai/server/http/admin.ts', 'src/modules/content/server/http/history.ts', 'src/modules/editor/server/documents.ts', 'src/modules/editor/server/document-validation.ts', 'src/modules/editor/server/http/documents.ts', 'src/modules/downloads/server/http/files.ts', 'src/modules/identity/domain/sections.ts', 'src/modules/identity/rbac.ts', 'src/modules/journal/server/body-proposals.ts', 'src/modules/journal/server/http/routes.ts', 'src/modules/journal/server/review-bulk.ts', 'src/modules/journal/server/review.ts',
    'src/modules/mail/server/http/newsletter.ts', 'src/modules/moderation/domain/queue.ts', 'src/modules/paywall/server/http/paywall.ts', 'src/modules/site/server/builder.ts',
    'src/modules/site/server/http/admin/builder/post-template/route.ts', 'src/modules/site/server/http/admin/cms/route.ts', 'src/modules/site/server/http/admin/comments/route.ts',
    'src/modules/site/server/http/builder/post-template.ts', 'src/modules/site/server/http/builder/targets.ts', 'src/modules/site/server/http/theme/templates.ts', 'src/modules/site/server/pages/blog/[slug]/page.tsx', 'src/plugins/journal/manifest.json',
    // The magazine's managed list (post formats): managed with the magazine's own permission.
    'src/modules/vocabulary/domain/registry.ts',
  ].sort(), 'a new place accepts cms.posts: make sure it is the magazine, then list it here')
  // No section's own guard takes it: not as a second choice, not in a menu.
  for (const file of ['src/modules/music/server/http/routes.ts', 'src/modules/cinema/server/http/routes.ts', 'src/modules/games/server/http/routes.ts', 'src/modules/software/server/http/routes.ts', 'src/modules/media/server/admin.ts', 'src/modules/taxonomy/server/http/routes.ts', 'src/modules/reviews/server/http/routes.ts', 'src/modules/forum/server/community.ts', 'src/modules/forum/server/http/admin.ts', 'src/app/api/admin/studios/route.ts'])
    assert.equal(read(file).includes('cms.posts'), false, file)
  for (const plugin of ['music', 'cinema', 'games', 'software', 'forum']) assert.equal(read(`src/plugins/${plugin}/manifest.json`).includes('cms.posts'), false, plugin)
  // Where it still sits beside other permissions, it guards a post and nothing else.
  assert.match(read('src/modules/paywall/server/http/paywall.ts'), /post: \['cms\.posts'\], software: \['software\.manage'\], game: \['games\.manage'\]/)
  assert.match(read('src/modules/site/server/http/builder/targets.ts'), /kind === 'post' \? 'cms\.posts' : kind === 'product' \? 'cms\.products' : 'cms\.pages'/)
  assert.match(read('src/modules/moderation/domain/queue.ts'), /key: 'item-reviews', module: 'reviews', permissions: \['reviews\.moderate'\]/)
})

test('roles that held the magazine permission keep what it used to open', () => {
  const seen = new Map()
  const open = (file) => {
    const full = fs.existsSync(file) && fs.statSync(file).isFile() ? file : `${file}.ts`
    if (seen.has(full)) return seen.get(full).exports
    if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'))
    const mod = { exports: {} }; seen.set(full, mod)
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText
    new Function('require', 'module', 'exports', source)((name) => name.startsWith('@/') ? open(path.resolve(__dirname, '..', 'src', name.slice(2))) : name.startsWith('.') ? open(path.resolve(path.dirname(full), name)) : require(name), mod, mod.exports)
    return mod.exports
  }
  const rbac = open(path.resolve(__dirname, '..', 'src/modules/identity/rbac'))
  const sql = read('prisma/migrations/20261203120000_posts_permission_is_the_magazine/migration.sql')
  const granted = [...sql.matchAll(/\|\| ',([a-z.]+)' WHERE/g)].map((match) => match[1])
  assert.deepEqual(granted.sort(), [...rbac.FORMERLY_OPENED_BY_POSTS].sort(), 'the migration grants exactly what cms.posts used to open')
  assert.equal(/\b(DROP|DELETE|ALTER|CREATE|TRUNCATE)\b/i.test(sql.replace(/^--.*$/gm, '')), false, 'data only: nothing is removed or restructured')
  assert.ok(granted.every((permission) => rbac.ALL_PERMISSIONS.includes(permission)))
  // The magazine manager is the magazine alone; the seeded "content backup" role and its preset agree.
  assert.deepEqual([...rbac.ROLE_PRESETS['magazine-manager']].sort(), ['cms.posts', 'dashboard.view'])
  const seeded = JSON.parse(read('prisma/system-roles.json')).find((role) => role.name === 'backup').permissions.split(',')
  assert.deepEqual(seeded.sort(), [...rbac.ROLE_PRESETS.backup].sort())
  for (const permission of rbac.FORMERLY_OPENED_BY_POSTS) assert.ok(rbac.ROLE_PRESETS['content-manager'].includes(permission))
  assert.equal(rbac.ROLE_PRESETS['content-editor'], undefined)
})

// ---- managers of the site's sections
test('a choice of sections stands for one role with exactly their permissions', () => {
  const sections = load('src/modules/identity/domain/sections')
  assert.deepEqual(sections.SITE_SECTIONS.map((section) => section.id), ['vpn', 'hosting', 'prompts', 'businesses', 'magazine', 'music', 'cinema', 'games', 'software', 'store', 'forum', 'reviews'])
  assert.deepEqual(sections.sectionRole(['vpn']).permissions, ['dashboard.view', 'plans.manage', 'subs.manage'])
  assert.deepEqual(sections.sectionsOf(['subs.manage']), [], 'supporting subscriptions alone is not the full VPN section')
  assert.deepEqual(sections.sectionRole(['hosting']).permissions, ['dashboard.view', 'hosting.manage'])
  assert.deepEqual(sections.sectionRole(['prompts']).permissions, ['dashboard.view', 'prompts.manage'])
  assert.deepEqual(sections.sectionRole(['businesses']).permissions, ['dashboard.view', 'businesses.manage'])
  assert.deepEqual(sections.sectionsOf(['reviews.moderate']), ['reviews'], 'review moderation does not grant business management')
  assert.deepEqual(sections.sectionRole(['games', 'music']), { name: 'sections:music+games', nameFa: 'مدیر موزیک و بازی', nameEn: 'Manager: music, games', permissions: ['dashboard.view', 'music.manage', 'games.manage'] })
  assert.deepEqual(sections.sectionRole(['store']).permissions, ['dashboard.view', 'cms.products', 'orders.manage'])
  assert.deepEqual(sections.normalizeSections(['music', 'nonsense', 'music', 'magazine']), ['magazine', 'music'])
  assert.deepEqual(sections.normalizeSections('music'), [])
  assert.deepEqual(sections.sectionsOf(['dashboard.view', 'cms.products']), [], 'half a section is not the section')
  assert.deepEqual(sections.sectionsOf(['cms.products', 'orders.manage', 'cms.posts']), ['magazine', 'store'])
  // Only the panel plus whole sections is a section role; anything else belongs to the role form.
  assert.equal(sections.isSectionRole(['dashboard.view', 'music.manage']), true)
  assert.equal(sections.isSectionRole(['music.manage', 'cms.products', 'orders.manage']), true)
  assert.equal(sections.isSectionRole(['dashboard.view', 'music.manage', 'users.manage']), false)
  assert.equal(sections.isSectionRole(['dashboard.view', 'cms.products']), false, 'half of the store')
  assert.equal(sections.isSectionRole(['dashboard.view']), false)
  assert.equal(sections.isSectionRole([]), false)
  // No section hands out the power to manage accounts, roles or settings.
  for (const section of sections.SITE_SECTIONS) for (const permission of section.permissions) assert.equal(['users.manage', 'roles.manage', 'settings.manage', 'extensions.code', 'finance.manage'].includes(permission), false, section.id)
})

test('every way of changing a staff account goes through the staff guard', () => {
  const list = read('src/modules/identity/server/http/admin/users/route.ts'), one = read('src/modules/identity/server/http/admin/users/[id]/route.ts'), roles = read('src/modules/identity/server/http/admin/roles/route.ts')
  assert.equal(list.split('accountChangeRefusal(').length - 1, 2, 'create and update')
  assert.equal(one.split('accountChangeRefusal(').length - 1, 2, 'status and role')
  assert.equal(roles.split('roleRefusal(admin').length - 1, 4, 'create, update (before and after) and delete')
  // Leaving the staff clears the role in the same write; staff without a role would be full access.
  assert.ok(list.includes("if (data.role === 'CUSTOMER') data.roleId = null"))
  assert.ok(one.includes("roleId: role === 'ADMIN' ? roleId : null"))
})

// ---- section authors: a second, narrower key of the same section
test('a section author role holds the panel and author permissions only, and is never a manager or full access', () => {
  const seen = new Map()
  const open = (file) => {
    const full = fs.existsSync(file) && fs.statSync(file).isFile() ? file : file + '.ts'
    if (seen.has(full)) return seen.get(full).exports
    if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'))
    const mod = { exports: {} }; seen.set(full, mod)
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText
    new Function('require', 'module', 'exports', source)((name) => name.startsWith('@/') ? open(path.resolve(__dirname, '..', 'src', name.slice(2))) : name.startsWith('.') ? open(path.resolve(path.dirname(full), name)) : require(name), mod, mod.exports)
    return mod.exports
  }
  const rbac = open(path.resolve(__dirname, '..', 'src/modules/identity/rbac'))
  const sections = load('src/modules/identity/domain/sections')
  assert.deepEqual(sections.AUTHOR_SECTIONS.map((section) => [section.id, section.permission, section.manage]), [['prompts', 'prompts.author', 'prompts.manage'], ['magazine', 'journal.author', 'cms.posts'], ['cinema', 'cinema.author', 'cinema.manage'], ['music', 'music.author', 'music.manage'], ['games', 'games.author', 'games.manage'], ['software', 'software.author', 'software.manage']])
  for (const section of sections.AUTHOR_SECTIONS) {
    // Declared by the section's own plugin, so it exists; not a core permission, so no stored full-access role is touched by it.
    assert.ok(rbac.ALL_PERMISSIONS.includes(section.permission), section.permission)
    assert.equal(rbac.PERMISSIONS.includes(section.permission), false, section.permission)
    // The section it writes in is one the owner hands out, with that manage permission.
    assert.ok(sections.SITE_SECTIONS.find((site) => site.id === section.id).permissions.includes(section.manage), section.id)
    assert.equal(sections.authorPermissionOf(section.manage), section.permission)
  }
  assert.equal(sections.authorPermissionOf('forum.moderate'), null)
  const role = sections.authorRole(['music', 'magazine', 'nope'])
  assert.deepEqual(role, { name: 'authors:magazine+music', nameFa: 'نویسندهٔ مجله و موزیک', nameEn: 'Author: magazine, music', permissions: ['dashboard.view', 'journal.author', 'music.author'] })
  assert.equal(rbac.isFullAccess(role.permissions.join(',')), false)
  assert.deepEqual(rbac.parsePermissions(role.permissions.join(',')), role.permissions)
  // An author role is not a manager role and holds no section: nothing that asks for the section's permission lets it in.
  assert.equal(sections.isAuthorRole(role.permissions), true); assert.equal(sections.isSectionRole(role.permissions), false)
  assert.deepEqual(sections.sectionsOf(role.permissions), []); assert.deepEqual(sections.authorSectionsOf(role.permissions), ['magazine', 'music'])
  for (const section of sections.AUTHOR_SECTIONS) assert.equal(role.permissions.includes(section.manage), false)
  // A manager role is not an author role; a role with anything else beside author permissions is the role form's.
  const manager = sections.sectionRole(['magazine']).permissions
  assert.equal(sections.isAuthorRole(manager), false); assert.equal(sections.isSectionRole(manager), true); assert.deepEqual(sections.authorSectionsOf(manager), [])
  assert.equal(sections.isAuthorRole(['dashboard.view']), false)
  assert.equal(sections.isAuthorRole(['dashboard.view', 'journal.author', 'cms.posts']), false)
  assert.equal(sections.isAuthorRole(['dashboard.view', 'journal.author', 'users.manage']), false)
  assert.deepEqual(sections.normalizeAuthorSections(['software', 'forum', 'magazine', 'magazine']), ['magazine', 'software'])
  assert.deepEqual(sections.normalizeAuthorSections('magazine'), [])
})

test('an author permission is taken only by the content owners, through the scope guard', () => {
  const files = []
  const names = ['journal.author', 'cinema.author', 'music.author', 'games.author', 'software.author', 'prompts.author']
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) { if (entry.name !== 'generated') walk(full) } else if (/[.](ts|tsx|json)$/.test(entry.name) && names.some((name) => fs.readFileSync(full, 'utf8').includes(name))) files.push(path.relative(path.resolve(__dirname, '..'), full).split(path.sep).join('/')) } }
  walk(path.resolve(__dirname, '..', 'src'))
  assert.deepEqual(files.sort(), [
    // The generated engineering reference quotes the canonical standing rules; it grants no permission.
    'src/modules/ai/domain/engineering-knowledge.generated.json',
    'src/modules/prompts/server/transaction.ts', 'src/plugins/prompt-master/manifest.json',
    'src/modules/editor/server/documents.ts', 'src/modules/editor/server/http/documents.ts', 'src/modules/identity/domain/sections.ts', 'src/modules/media/server/admin.ts', 'src/modules/site/server/http/admin/cms/route.ts',
    // Games have an admin of their own: its routes take the author through the same guard, and its shell only decides which tabs to show.
    'src/modules/games/server/http/routes.ts', 'src/app/admin/games/shared.tsx',
    // The sections' managed lists (game platforms, software licences…): nobody's own items; a section author only reads them, through the scope guard.
    'src/modules/vocabulary/domain/registry.ts',
    // Authors may open their existing shared media library; this shell only exposes its menu.
    'src/app/admin/layout.tsx',
    // The title form's people suggestions: through the scope guard, an author sees people of published titles and their own.
    'src/modules/cinema/server/http/people.ts',
    // The title form's list of formats (film, series, anime…): not anyone's own items; an author only reads it, through the scope guard.
    'src/modules/cinema/server/http/formats.ts',
    // The game and software forms' studio suggestions: studios are nobody's own items; an author only reads names, through the scope guard.
    'src/modules/studios/server/http/suggest.ts',
    'src/plugins/cinema/manifest.json', 'src/plugins/games/manifest.json', 'src/plugins/journal/manifest.json', 'src/plugins/music/manifest.json', 'src/plugins/software/manifest.json',
  ].sort(), 'a new place accepts an author permission: it must hold the author to their own items, then be listed here')
  const authorMenus = read('src/app/admin/layout.tsx').split(/\r?\n/).filter(line => names.some(name => line.includes(name)))
  assert.equal(authorMenus.length, 1, 'author permissions expose only the shared Library menu in this shell')
  assert.match(authorMenus[0], /href: '\/admin\/media'/)
  // Where a section's permission is asked plainly, the author permission is not offered beside it.
  const cms = read('src/modules/site/server/http/admin/cms/route.ts').split('\r\n').join('\n')
  assert.ok(cms.includes("if (type === 'posts' || (type === 'postcats' && reading)) return requireContentScope(req, perm, 'journal.author')"))
  assert.equal(cms.split("'journal.author'").length - 1, 1, 'named once, in the one function that decides the caller')
  const guard = read('src/modules/identity/server/access.ts').split('\r\n').join('\n')
  assert.ok(guard.includes("const manager = await requirePerm(req, manage, reader)\n  if (manager) return { admin: manager, authorId: null }"))
  assert.ok(guard.includes('return writer ? { admin: writer, authorId: writer.id } : null'))
  // Every read and write of the two owners is narrowed by that id.
  for (const piece of ["const own = type === 'posts' && caller.authorId ? { authorId: caller.authorId } : null", "if (!held || (caller.authorId && held.authorId !== caller.authorId)) return err('not found', 404)", "if (type === 'posts' && caller.authorId) {", "const own = type === 'posts' && caller.authorId ? { authorId: caller.authorId } : {}"]) assert.ok(cms.includes(piece), piece)
  const media = read('src/modules/media/server/admin.ts').split('\r\n').join('\n')
  for (const piece of ["const own = caller.authorId && trashable(type) ? { createdById: caller.authorId } : null", "if (!held || (caller.authorId && held.createdById !== caller.authorId)) return err('not found', 404)", "const own = caller.authorId ? { createdById: caller.authorId } : {}", "create({ data: AUTHORED[type] && actor ? { ...data, createdById: actor.id } : data })"]) assert.ok(media.includes(piece), piece)
  // The games admin of its own: the list, its batches and a game's updates go through the same guard and are narrowed the same way.
  const games = read('src/modules/games/server/http/routes.ts').split('\r\n').join('\n'), owner = read('src/modules/games/server/admin.ts').split('\r\n').join('\n')
  assert.ok(games.includes("const caller = await requireContentScope(req, 'games.manage', 'games.author')"))
  assert.equal(games.split("'games.author'").length - 1, 1, 'named once, in the one function that decides the caller')
  for (const handler of ['GET_list', 'POST_list', 'GET_franchises', 'GET_updates', 'POST_updates', 'DELETE_updates']) assert.ok(games.includes('export async function ' + handler + '(req: NextRequest) {') && new RegExp('export async function ' + handler + '[^}]*?gamesWriter[(]req[)]').test(games), handler)
  // The dashboard, the release plan, franchise changes and the settings stay the manager's.
  for (const handler of ['GET_dashboard', 'POST_franchises', 'DELETE_franchises', 'GET_releases', 'POST_releases', 'GET_settings']) assert.ok(new RegExp('export async function ' + handler + '[(]req: NextRequest[)] [{]\\n  const g = await gamesAdmin[(]req[)]').test(games), handler)
  for (const piece of ["const ownGames = (scope: GameScope) => (scope.authorId ? { createdById: scope.authorId } : {})", "const where: Record<string, unknown> = { ...own }", "const found = await db.gameTitle.findMany({ where: { id: { in: asked }, ...ownGames(scope) } })", "if (scope.authorId && !AUTHOR_BULK.includes(action)) throw new GameError(", "const game = await db.gameTitle.findFirst({ where: { id: gameId, ...ownGames(scope) }", "await gameFor(gameId, scope, true)"]) assert.ok(owner.includes(piece), piece)
  assert.equal(owner.split('await gameFor(gameId, scope, true)').length - 1, 2, 'saving and deleting an update both ask whose game it is')
  // What an author does not get keeps asking for the section's own permission.
  assert.match(read('src/modules/content/server/http/history.ts'), /if \(type === 'posts'\)\s*\{[\s\S]*?perms:\s*\['cms\.posts'\],\s*module:\s*'journal'/)
  assert.equal(read('src/modules/site/server/http/admin/comments/route.ts').includes('.author'), false)
  assert.equal(read('src/modules/identity/rbac.ts').includes('.author'), false, 'the list of content editors (collections) does not name authors')
})

test('the trash keeps what an item was, and is entered and left only by its own actions', () => {
  const trash = load('src/modules/content/domain/trash')
  const at = new Date('2026-10-12T10:00:00.000Z')
  assert.deepEqual(trash.trashData({ status: 'PUBLISHED' }, 7, at), { status: 'TRASHED', trashedStatus: 'PUBLISHED', trashedAt: at, trashedById: 7 })
  assert.deepEqual(trash.trashData({ status: 'DRAFT' }, 7, at).trashedStatus, 'DRAFT')
  assert.throws(() => trash.trashData({ status: 'TRASHED', trashedStatus: 'PUBLISHED' }, 7), /already/)
  assert.deepEqual(trash.restoreData({ status: 'TRASHED', trashedStatus: 'PUBLISHED' }), { status: 'PUBLISHED', trashedStatus: '', trashedAt: null, trashedById: null })
  // What it was is unknown or impossible: a draft, never public and never the trash again.
  for (const was of ['', null, undefined, 'TRASHED']) assert.equal(trash.restoreData({ status: 'TRASHED', trashedStatus: was }).status, 'DRAFT')
  assert.throws(() => trash.restoreData({ status: 'PUBLISHED', trashedStatus: '' }), /not in the trash/)
  assert.equal(trash.isTrashed({ status: 'TRASHED' }), true); assert.equal(trash.isTrashed({ status: 'DRAFT' }), false)
  assert.equal(trash.formStatus('PUBLISHED'), 'PUBLISHED'); assert.equal(trash.formStatus(undefined), undefined)
  assert.throws(() => trash.formStatus('TRASHED'))
  // The database holds the same rule for every kind of item that can wait in the trash.
  const sql = read('prisma/migrations/20261224120000_section_authors/migration.sql')
  const gamesSql = read('prisma/migrations/20261225120000_game_authors/migration.sql')
  assert.ok(gamesSql.includes('ALTER TABLE "GameTitle" ADD CONSTRAINT "GameTitle_trash_state" CHECK (("status" = \'TRASHED\') = ("trashedAt" IS NOT NULL)')); assert.equal(/DROP |DELETE |UPDATE /.test(gamesSql), false)
  for (const table of ['Post', 'MusicAlbum', 'MusicTrack', 'CinemaTitle', 'SoftwareTitle']) assert.ok(sql.includes('ALTER TABLE "' + table + '" ADD CONSTRAINT "' + table + '_trash_state" CHECK (("status" = \'TRASHED\') = ("trashedAt" IS NOT NULL)'), table)
  assert.equal(/DROP |DELETE |UPDATE /.test(sql), false, 'additive only')
})

test('an author is told what was decided about their delete request, once, and never for their own decision', async () => {
  const made = []
  let fail = false
  const source = ts.transpileModule(read('src/modules/content/server/trash-notice.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const logged = []
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)((name) => name === '@/modules/notifications/server/inbox' ? { createInboxEvent: async (event) => { if (fail) throw new Error('inbox down'); made.push(event) } } : name === '@/platform/observability/logger' ? { logEvent: (...args) => logged.push(args) } : require(name), mod, mod.exports)
  const tell = mod.exports.tellTrashDecision
  const at = new Date('2026-10-13T08:00:00.000Z')
  const base = { askedById: 7, askedAt: at, decidedById: 1, kind: 'post', id: 42, title: '  نوشتهٔ من  ', href: '/admin/posts' }
  await tell({ ...base, decision: 'restored' })
  await tell({ ...base, decision: 'deleted' })
  assert.deepEqual(made.map((event) => [event.userId, event.kind, event.dedupeKey, event.href]), [[7, 'TRASH_DECISION', 'trash:post:42:' + at.getTime() + ':restored', '/admin/posts'], [7, 'TRASH_DECISION', 'trash:post:42:' + at.getTime() + ':deleted', '/admin/posts']])
  assert.ok(made[0].bodyFa.includes('«نوشتهٔ من»') && made[0].titleFa.includes('پذیرفته نشد') && made[1].titleFa.includes('حذف شد'))
  // A later request on the same item is another request: its key differs by the time it was asked.
  await tell({ ...base, askedAt: new Date(at.getTime() + 1000), decision: 'restored' })
  assert.notEqual(made[2].dedupeKey, made[0].dedupeKey)
  made.length = 0
  // Nobody asked (a manager's own delete), the time is unknown, or the asker decided themselves: nobody is told.
  for (const quiet of [{ askedById: null }, { askedById: 0 }, { askedAt: null }, { decidedById: 7 }]) await tell({ ...base, ...quiet, decision: 'deleted' })
  assert.deepEqual(made, [])
  // The decision was already made: a notice that cannot be written is logged and nothing is thrown.
  fail = true
  await tell({ ...base, decision: 'deleted' })
  assert.equal(logged.length, 1); assert.equal(logged[0][1], 'content.trash_notice_failed')
  // The kind can be switched off like any other, and every owner that decides tells.
  assert.ok(read('src/modules/notifications/server/preferences.ts').includes("{ kind: 'TRASH_DECISION',"))
  for (const [file, calls] of [['src/modules/site/server/http/admin/cms/route.ts', 3], ['src/modules/media/server/admin.ts', 3], ['src/modules/games/server/admin.ts', 2]]) {
    const text = read(file)
    assert.equal(text.split(/await tell(?:TrashDecision|Decision)?\(/).length - 1, calls, file)
  }
})

// Internal human check: protocol and browser digest compatibility.
const humanRules = load('src/modules/identity/domain/human-check')
const { sha256Hex } = load('src/shared/security/sha256')
test('human-check defaults, per-surface switches and unavailable providers remain protective', () => {
  const base = humanRules.defaultHumanCheck()
  assert.equal(base.provider, 'builtin')
  assert.equal(humanRules.HUMAN_SURFACES.length, 9)
  for (const surface of humanRules.HUMAN_SURFACES) assert.equal(base.surfaces[surface.key], true)
  const selected = humanRules.normalizeHumanCheck({ provider: 'turnstile', difficulty: 'bad', surfaces: { comment: false, login: 'false' } })
  assert.equal(selected.provider, 'builtin'); assert.equal(selected.surfaces.login, true); assert.equal(selected.surfaces.comment, false)
  const cloud = humanRules.normalizeHumanCheck({ provider: 'turnstile' }, true)
  assert.equal(humanRules.providerFor(cloud, 'login', true), 'turnstile')
  assert.equal(humanRules.providerFor(cloud, 'comment', true), 'builtin')
  assert.equal(humanRules.providerFor(cloud, 'login', false), 'builtin')
  assert.equal(humanRules.providerFor({ ...base, provider: 'off' }, 'login', false), 'off')
  assert.equal(humanRules.providerFor(selected, 'comment', false), 'off')
})
test('browser SHA-256 agrees with Node for Unicode, block boundaries and random proof inputs', () => {
  const crypto = require('node:crypto')
  for (const text of ['', 'abc', 'سلام 🎵', ...[55,56,63,64,65,120,128,300].map(n => 'x'.repeat(n)), ...Array.from({ length: 30 }, () => crypto.randomBytes(32).toString('hex') + ':123456')]) assert.equal(sha256Hex(text), crypto.createHash('sha256').update(text).digest('hex'))
  assert.equal(humanRules.leadingZeroBits('0000ffff'), 16)
  assert.equal(humanRules.leadingZeroBits('00008fff'), 16)
  assert.equal(humanRules.leadingZeroBits('00001fff'), 19)
})
test('proof parser refuses honeypots, oversized input and noncanonical nonces', () => {
  const proof = 'a'.repeat(100) + '.' + 'b'.repeat(43) + '.12'
  assert.ok(humanRules.parseProof(proof))
  for (const token of [null, {}, proof + '.hp', proof + '.extra', proof.replace('.12', '.-1'), proof.replace('.12', '.1e6'), 'a'.repeat(601)]) assert.equal(humanRules.parseProof(token), null)
  assert.equal(humanRules.validPayload({ v: 1, s: 'comment', r: 'a'.repeat(32), b: 16, i: 1, e: 2 }), true)
  for (const patch of [{ s: 'admin' }, { b: 0 }, { r: 'not-a-salt' }, { e: 1 }, { i: 1.5 }]) assert.equal(humanRules.validPayload({ v: 1, s: 'comment', r: 'a'.repeat(32), b: 16, i: 1, e: 2, ...patch }), false)
})

test('combined OTP entry cannot bypass registration protection when password login is disabled', () => {
  const base = humanRules.defaultHumanCheck()
  const loginOff = { ...base, surfaces: { ...base.surfaces, login: false } }
  assert.equal(humanRules.providerFor(loginOff, 'login', false), 'off')
  assert.equal(humanRules.providerFor(loginOff, 'entry', false), 'builtin')
  const bothOff = { ...loginOff, surfaces: { ...loginOff.surfaces, register: false } }
  assert.equal(humanRules.providerFor(bothOff, 'entry', false), 'off')
  assert.equal(humanRules.surfaceGroup('entry'), 'auth')
})

test('whitespace-only Turnstile credentials cannot select a bypassing provider', () => {
  const previous = process.env.TURNSTILE_SECRET_KEY
  const mod = { exports: {} }, code = ts.transpileModule(read('src/modules/identity/server/turnstile.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require','module','exports',code)(name => name === '@/platform/http/rate-limit' ? { clientIp: () => 'owned' } : require(name), mod, mod.exports)
  try { process.env.TURNSTILE_SECRET_KEY = '   '; assert.equal(mod.exports.turnstileConfigured(), false); process.env.TURNSTILE_SECRET_KEY = 'owned-test-only'; assert.equal(mod.exports.turnstileConfigured(), true) } finally { if (previous === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = previous }
})

test('Google sign-in: claims, the chooser address, settings and the wiring around them', () => {
  const read = (relative) => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n')
  const g = load('src/modules/identity/domain/google-login')
  const client = '123456789012-abcdefgh12345678.apps.googleusercontent.com', now = 1_800_000_000_000, sec = now / 1000
  const token = claims => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`
  const base = { iss: 'https://accounts.google.com', aud: client, iat: sec, exp: sec + 3600, nonce: 'n1', sub: '1098765', email: 'A@Gmail.com', email_verified: true, name: ' Ali   Reza ', picture: 'https://lh3.googleusercontent.com/a/x' }
  const check = (claims) => g.checkGoogleClaims(g.decodeIdTokenPayload(token(claims)), { clientId: client, nonce: 'n1', now })
  const good = check(base)
  assert.equal(good.ok, true)
  assert.deepEqual(good.identity, { sub: '1098765', email: 'a@gmail.com', emailVerified: true, name: 'Ali Reza', picture: 'https://lh3.googleusercontent.com/a/x' })
  assert.equal(check({ ...base, iss: 'accounts.google.com' }).ok, true)
  for (const [claims, error] of [[{ iss: 'https://evil.example' }, 'ISSUER'], [{ aud: 'other' }, 'AUDIENCE'], [{ aud: [client, 'other'] }, 'AUDIENCE'], [{ exp: sec - 120 }, 'EXPIRED'], [{ iat: sec + 600 }, 'EXPIRED'], [{ nonce: 'n2' }, 'NONCE'], [{ nonce: undefined }, 'NONCE'], [{ sub: 'has space' }, 'SUBJECT']]) {
    assert.equal(check({ ...base, ...claims }).error, error, JSON.stringify(claims))
  }
  assert.equal(check({ ...base, aud: [client, 'other'], azp: client }).ok, true)
  assert.equal(check({ ...base, email_verified: false }).identity.emailVerified, false)
  assert.equal(check({ ...base, picture: 'https://evil.example/p.png' }).identity.picture, '')
  assert.equal(g.checkGoogleClaims(g.decodeIdTokenPayload('not-a-jwt'), { clientId: client, nonce: 'n1', now }).error, 'MALFORMED')
  assert.equal(g.decodeIdTokenPayload('a.' + 'x'.repeat(9000) + '.c'), null)
  // The chooser: PKCE S256, scope openid email profile, an account chooser every time.
  const url = new URL(g.googleAuthorizeUrl({ clientId: client, redirectUri: 'https://site.example/api/login/google/callback', state: 's', nonce: 'n', challenge: 'c', locale: 'fa' }))
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.deepEqual(Object.fromEntries(url.searchParams), { client_id: client, redirect_uri: 'https://site.example/api/login/google/callback', response_type: 'code', scope: 'openid email profile', state: 's', nonce: 'n', code_challenge: 'c', code_challenge_method: 'S256', prompt: 'select_account', hl: 'fa' })
  // Settings: off by default, sign-up on unless switched off; client IDs look like Google's.
  assert.deepEqual(g.normalizeGoogleLogin(undefined), { enabled: false, clientId: '', clientSecret: '', signup: true })
  assert.equal(g.normalizeGoogleLogin({ enabled: 'true' }).enabled, false)
  assert.equal(g.validGoogleClientId(client), true)
  assert.equal(g.validGoogleClientId('abc.apps.googleusercontent.com'), false)
  for (const code of ['unavailable', 'cancelled', 'expired', 'failed', 'unreachable', 'unverified', 'email-exists', 'signup-closed', 'not-allowed', 'already-linked', 'other-google']) assert.ok(g.isGoogleLoginError(code), code)
  assert.equal(g.isGoogleLoginError('__proto__'), false)
  // Wiring: the session provider, the routes, the proxy purpose on both sides, history, and an additive migration.
  const auth = read('src/modules/identity/auth.ts')
  assert.match(auth, /id: 'google',[\s\S]*?peekGoogleTicket\(credentials\?\.ticket\)[\s\S]*?await secondFactor\(user, credentials\?\.totp\)\s*\n\s*if \(!await consumeGoogleTicket\(credentials\?\.ticket\)\) return null/)
  assert.match(read('src/app/api/login/google/route.ts'), /GET_start as GET/)
  assert.match(read('src/app/api/login/google/callback/route.ts'), /GET_callback as GET/)
  assert.match(read('src/app/api/me/google/route.ts'), /GET_me as GET, DELETE_me as DELETE/)
  const http = read('src/modules/identity/server/http/google.ts')
  assert.match(http, /\/login\/google#\$\{new URLSearchParams\(\{ ticket: outcome\.ticket/, 'the ticket travels in the fragment')
  assert.match(http, /sameSite: 'lax', path: COOKIE_PATH, maxAge: GOOGLE_FLOW_TTL_MS \/ 1000/)
  assert.match(read('src/modules/social/domain/egress.ts'), /key: 'google',[^\n]*hosts: \['oauth2\.googleapis\.com'\]/)
  assert.match(read('deploy/ubuntu/xray-config.cjs'), /google: \['full:oauth2\.googleapis\.com'\]/)
  assert.match(read('src/modules/content/server/http/history.ts'), /type === 'settings-google-login'/)
  assert.match(read('src/modules/identity/server/http/security.ts'), /view'\) === 'google'\) return sectionSettingsSaveWith/)
  const sql = read('prisma/migrations/20270301120000_google_login/migration.sql')
  assert.doesNotMatch(sql, /DROP|UPDATE|DELETE|ALTER COLUMN/i)
  assert.match(sql, /CREATE UNIQUE INDEX "User_googleId_key" ON "User"\("googleId"\)/)
  for (const schema of ['prisma/schema.prisma', 'prisma/schema.postgresql.prisma']) assert.match(read(schema), /googleId\s+String\?\s+@unique\n\s+googleEmail\s+String\s+@default\(""\)\n\s+googleLinkedAt DateTime\?/)
})
