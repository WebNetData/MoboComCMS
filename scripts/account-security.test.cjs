const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const cache = new Map()
function load(relative) {
  const file = path.resolve(__dirname, '..', relative.endsWith('.ts') ? relative : `${relative}.ts`)
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
const totp = load('src/shared/security/totp')
const verify = load('src/shared/security/totp-verify')
const seals = load('src/modules/site/config/trust-seals')

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
  assert.deepEqual(sec.normalizeSecurityPolicy(null), { requireAdmin2fa: false, emailReset: true, smsReset: true })
  assert.deepEqual(sec.normalizeSecurityPolicy({ requireAdmin2fa: 'yes', emailReset: false }), { requireAdmin2fa: false, emailReset: false, smsReset: true })
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
  const middleware = read('src/middleware.ts')
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
})

// ---- cms.posts is the magazine, and only the magazine
test('the magazine permission is named only where the magazine is guarded', () => {
  const files = []
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) { if (entry.name !== 'generated') walk(full) } else if (/\.(ts|tsx|json)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('cms.posts')) files.push(path.relative(path.resolve(__dirname, '..'), full).split(path.sep).join('/')) } }
  walk(path.resolve(__dirname, '..', 'src'))
  // Each of these is the magazine itself (posts, their categories, comments, templates, newsletter, journal), the
  // or a list of "any content editor" that names every section (collections hold items of every section and take that list).
  assert.deepEqual(files.sort(), [
    'src/app/admin/layout.tsx', 'src/app/admin/roles/page.tsx',
    'src/modules/ai/server/http/admin.ts', 'src/modules/content/server/http/history.ts', 'src/modules/editor/server/documents.ts', 'src/modules/editor/server/http/documents.ts', 'src/modules/downloads/server/http/files.ts', 'src/modules/identity/domain/sections.ts', 'src/modules/identity/rbac.ts', 'src/modules/journal/server/http/routes.ts',
    'src/modules/mail/server/http/newsletter.ts', 'src/modules/moderation/domain/queue.ts', 'src/modules/paywall/server/http/paywall.ts', 'src/modules/site/server/builder.ts',
    'src/modules/site/server/http/admin/builder/post-template/route.ts', 'src/modules/site/server/http/admin/cms/route.ts', 'src/modules/site/server/http/admin/comments/route.ts',
    'src/modules/site/server/http/builder/post-template.ts', 'src/modules/site/server/http/theme/templates.ts', 'src/modules/site/server/pages/blog/[slug]/page.tsx', 'src/plugins/journal/manifest.json',
  ].sort(), 'a new place accepts cms.posts: make sure it is the magazine, then list it here')
  // No section's own guard takes it: not as a second choice, not in a menu.
  for (const file of ['src/modules/music/server/http/routes.ts', 'src/modules/cinema/server/http/routes.ts', 'src/modules/games/server/http/routes.ts', 'src/modules/software/server/http/routes.ts', 'src/modules/media/server/admin.ts', 'src/modules/taxonomy/server/http/routes.ts', 'src/modules/reviews/server/http/routes.ts', 'src/modules/forum/server/community.ts', 'src/modules/forum/server/http/admin.ts', 'src/app/api/admin/studios/route.ts'])
    assert.equal(read(file).includes('cms.posts'), false, file)
  for (const plugin of ['music', 'cinema', 'games', 'software', 'forum']) assert.equal(read(`src/plugins/${plugin}/manifest.json`).includes('cms.posts'), false, plugin)
  // Where it still sits beside other permissions, it guards a post and nothing else.
  assert.match(read('src/modules/paywall/server/http/paywall.ts'), /post: \['cms\.posts'\], software: \['software\.manage'\], game: \['games\.manage'\]/)
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
  assert.deepEqual(sections.SITE_SECTIONS.map((section) => section.id), ['businesses', 'magazine', 'music', 'cinema', 'games', 'software', 'store', 'forum', 'reviews'])
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
