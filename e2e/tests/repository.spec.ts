import { createPublicKey, verify } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { test, expect } from '../helpers'
import { writeZip } from '../../src/modules/packages/domain/zip'

/**
 * Plugin & theme repository, end to end on one site playing both roles (the client points at this same server;
 * REPOSITORY_ALLOW_PRIVATE=1 is set by the test web server). Uses its own product ids and removes what it can.
 */
test.describe.configure({ mode: 'serial' })

const RUN = Date.now().toString(36)
const FREE = `e2e-free-${RUN}`
const PAID = `e2e-paid-${RUN}`
const zipOf = (id: string, version: string, kind: 'plugin' | 'theme' = 'plugin') => writeZip(new Map<string, Buffer>([
  ['manifest.json', Buffer.from(JSON.stringify({ id, name: `Pack ${id}`, version, kind, runtime: 'declarative', requiresCore: '^1.0.0', ...(kind === 'theme' ? { design: { radius: 10, colors: { background: '#111111', surface: '#1a1a1a', accent: '#66ddaa', text: '#eeeeee', muted: '#999999', border: '#333333' } } } : { slots: { 'home.before-main': 'slots/banner.html' } }) }))],
  ...(kind === 'plugin' ? [['slots/banner.html', Buffer.from('<p>hello from the repository</p>')] as [string, Buffer]] : []),
]))

test.describe('repository', () => {
  let key = ''
  let publicKey = ''
  let fingerprint = ''
  const ids: Record<string, number> = {}

  test.afterAll(async ({ playwright, baseURL }) => {
    const { hasAdmin } = await import('../helpers')
    if (!hasAdmin()) return
    const { ADMIN_STATE } = await import('../paths')
    const admin = await playwright.request.newContext({ baseURL, storageState: ADMIN_STATE, extraHTTPHeaders: { origin: baseURL! } })
    for (const slug of [FREE, PAID]) {
      await admin.post('/api/admin/repository/client', { data: { op: 'deactivate', slug } })
      await admin.delete(`/api/admin/packages/${slug}`)
    }
    for (const id of Object.values(ids)) await admin.post('/api/admin/repository', { data: { op: 'product.save', id, slug: 'x', name: 'closed', active: false } }).catch(() => undefined)
    await admin.post('/api/admin/repository/client', { data: { op: 'disconnect' } })
    await admin.post('/api/admin/repository', { data: { op: 'settings', enabled: false } })
    await admin.dispose()
  })

  test('the vendor role is off until switched on, then publishes products and signed releases', async ({ admin, playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL })
    await admin.post('/api/admin/repository', { data: { op: 'settings', enabled: false } })
    expect((await guest.get('/api/repo/v1/catalog')).status(), 'off: the API does not exist').toBe(404)
    expect((await admin.post('/api/admin/repository', { data: { op: 'settings', enabled: true, name: 'E2E vendor' } })).ok()).toBeTruthy()

    const bad = await admin.post('/api/admin/repository', { data: { op: 'product.save', slug: 'Bad Slug', name: 'x' } })
    expect(bad.status()).toBe(400)
    for (const [slug, price] of [[FREE, '0'], [PAID, '1500']] as const) {
      const saved = await admin.post('/api/admin/repository', { data: { op: 'product.save', slug, name: `Pack ${slug}`, summary: 'sample', price, active: true, kind: 'PLUGIN', siteLimit: 1, supportDays: 365 } })
      expect(saved.ok(), await saved.text()).toBeTruthy()
      ids[slug] = (await saved.json()).id
    }

    const upload = async (productId: number, buffer: Buffer, changelog = 'first') => admin.post('/api/admin/repository/upload', { multipart: { productId: String(productId), changelog, file: { name: 'pack.zip', mimeType: 'application/zip', buffer } } })
    expect((await upload(ids[FREE], Buffer.from('not a zip'))).status(), 'a broken file is refused').toBe(400)
    expect((await upload(ids[FREE], zipOf('another-id', '1.0.0'))).status(), 'a package for another product is refused').toBe(400)
    expect((await upload(ids[FREE], zipOf(FREE, '1.0.0'))).ok()).toBeTruthy()
    expect((await upload(ids[FREE], zipOf(FREE, '1.0.0'))).status(), 'a version is published once').toBe(409)
    expect((await upload(ids[PAID], zipOf(PAID, '1.0.0'))).ok()).toBeTruthy()

    const meta = await (await guest.get('/api/repo/v1/meta')).json()
    publicKey = meta.publicKey; fingerprint = meta.fingerprint
    expect(meta.name).toBe('E2E vendor')
    const catalog = await (await guest.get('/api/repo/v1/catalog')).json()
    const free = catalog.products.find((p: { slug: string }) => p.slug === FREE)
    expect(free.latest.version).toBe('1.0.0')
    // The release signature verifies with the published key, and only for exactly those bytes.
    const payload = (o: Record<string, unknown>) => Buffer.from(`{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(o[k])}`).join(',')}}`)
    const signed = { slug: FREE, version: free.latest.version, sha256: free.latest.sha256, size: free.latest.size }
    expect(verify(null, payload(signed), createPublicKey(publicKey), Buffer.from(free.latest.signature, 'base64url'))).toBe(true)
    expect(verify(null, payload({ ...signed, sha256: '0'.repeat(64) }), createPublicKey(publicKey), Buffer.from(free.latest.signature, 'base64url'))).toBe(false)
    expect(JSON.stringify(catalog)).not.toContain('fileId')
    await guest.dispose()
  })

  test('downloads: free is open, paid needs an activated license for that site', async ({ admin, playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL })
    expect((await guest.get(`/api/repo/v1/download/${FREE}/1.0.0`)).status()).toBe(200)
    expect((await guest.get(`/api/repo/v1/download/${FREE}/9.9.9`)).status()).toBe(404)
    expect((await guest.get(`/api/repo/v1/download/${PAID}/1.0.0`)).status(), 'no key').toBeGreaterThanOrEqual(400)

    const granted = await admin.post('/api/admin/repository', { data: { op: 'license.grant', productId: ids[PAID], email: 'buyer@example.com', note: 'e2e' } })
    key = (await granted.json()).key
    expect(key).toMatch(/^MBC-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/)
    const headers = { 'x-license-key': key, 'x-license-site': 'shop-one.example.com' }
    expect((await guest.get(`/api/repo/v1/download/${PAID}/1.0.0`, { headers })).status(), 'valid key but not activated for the site').toBe(403)

    const activate = (site: string, k = key, slug = PAID) => guest.post('/api/repo/v1/licenses/activate', { data: { key: k, slug, site, coreVersion: '1.5.0' } })
    expect((await activate('shop-one.example.com', 'MBC-AAAAA-AAAAA-AAAAA-AAAAA')).status(), 'unknown key').toBe(404)
    expect((await activate('shop-one.example.com', key, FREE)).status(), "another product's key is not confirmed").toBe(404)
    expect((await activate('not a host!')).status()).toBe(400)
    const first = await activate('shop-one.example.com')
    expect(first.status()).toBe(200)
    const cert = await first.json()
    expect(verify(null, Buffer.from(`{${Object.keys(cert.certificate).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(cert.certificate[k])}`).join(',')}}`), createPublicKey(publicKey), Buffer.from(cert.signature, 'base64url'))).toBe(true)
    expect(cert.certificate).toMatchObject({ product: PAID, site: 'shop-one.example.com', status: 'ACTIVE' })
    expect((await activate('https://Shop-One.example.com/path')).status(), 'the same site again just refreshes').toBe(200)
    const second = await activate('shop-two.example.com')
    expect(second.status(), 'the license allows one site').toBe(409)
    expect((await second.json()).reason).toBe('limit')
    expect((await guest.get(`/api/repo/v1/download/${PAID}/1.0.0`, { headers })).status()).toBe(200)
    // Lower-case, spaced or look-alike characters in a typed key still work.
    expect((await activate('shop-one.example.com', key.toLowerCase().replace(/-/g, ' '))).status()).toBe(200)
    await guest.dispose()
  })

  test('a site connects with a confirmed key fingerprint, installs free and licensed packages, and follows revocation', async ({ admin, baseURL }) => {
    const post = (data: unknown) => admin.post('/api/admin/repository/client', { data })
    const meta = await (await post({ op: 'meta', url: baseURL })).json()
    expect(meta.fingerprint).toBe(fingerprint)
    expect((await post({ op: 'connect', url: baseURL, fingerprint: 'AAAA-BBBB' })).status(), 'an unconfirmed fingerprint is refused').toBe(409)
    expect((await post({ op: 'connect', url: baseURL, fingerprint })).ok()).toBeTruthy()

    const browse = await (await admin.get('/api/admin/repository/client')).json()
    expect(browse.connected).toBe(true)
    const free = browse.products.find((p: { slug: string }) => p.slug === FREE)
    expect(free).toMatchObject({ free: true, unverified: false, compatible: true })
    const installFree = await post({ op: 'install', slug: FREE })
    expect(installFree.ok(), await installFree.text()).toBeTruthy()
    expect((await installFree.json()).version).toBe('1.0.0')

    // Paid: refused without a license, then with a wrong key, then works.
    expect((await post({ op: 'install', slug: PAID })).status()).toBe(402)
    expect((await post({ op: 'activate', slug: PAID, key: 'nonsense' })).status()).toBe(400)
    expect((await post({ op: 'activate', slug: PAID, key: 'MBC-AAAAA-AAAAA-AAAAA-AAAAA' })).status()).toBe(404)
    const site = new URL(baseURL!).hostname
    // The vendor first releases the place used by the other site in the earlier test.
    const licenses = await (await admin.get('/api/admin/repository?view=licenses&q=e2e')).json()
    const row = licenses.rows.find((l: { slug: string }) => l.slug === PAID)
    expect(row.sites.some((s: { site: string }) => s.site === 'shop-one.example.com')).toBe(true)
    expect((await admin.post('/api/admin/repository', { data: { op: 'license.site', id: row.id, site: 'shop-one.example.com' } })).ok()).toBeTruthy()
    expect((await post({ op: 'activate', slug: PAID, key })).ok(), `site ${site}`).toBeTruthy()
    const installPaid = await post({ op: 'install', slug: PAID })
    expect(installPaid.ok(), await installPaid.text()).toBeTruthy()

    const after = await (await admin.get('/api/admin/repository/client')).json()
    expect(after.products.find((p: { slug: string }) => p.slug === PAID)).toMatchObject({ installed: { version: '1.0.0' }, license: { state: 'active' } })

    // A newer release is offered as an update and installs over the old one.
    expect((await admin.post('/api/admin/repository/upload', { multipart: { productId: String(ids[PAID]), changelog: 'second', file: { name: 'p.zip', mimeType: 'application/zip', buffer: zipOf(PAID, '1.1.0') } } })).ok()).toBeTruthy()
    expect((await admin.post('/api/admin/repository/upload', { multipart: { productId: String(ids[PAID]), changelog: 'old', file: { name: 'p.zip', mimeType: 'application/zip', buffer: zipOf(PAID, '1.0.5') } } })).status(), 'an older version cannot be published after a newer one').toBe(409)
    const withUpdate = await (await admin.get('/api/admin/repository/client')).json()
    expect(withUpdate.products.find((p: { slug: string }) => p.slug === PAID).update).toBe('1.1.0')
    expect((await (await post({ op: 'install', slug: PAID })).json()).upgraded).toBe(true)

    // Revocation: the daily check switches the package off and downloads stop.
    expect((await admin.post('/api/admin/repository', { data: { op: 'license.status', id: row.id, status: 'REVOKED' } })).ok()).toBeTruthy()
    const refreshed = await (await post({ op: 'refresh' })).json()
    expect(refreshed.revoked).toContain(PAID)
    const revoked = await (await admin.get('/api/admin/repository/client')).json()
    expect(revoked.products.find((p: { slug: string }) => p.slug === PAID)).toMatchObject({ license: { state: 'revoked' }, installed: { enabled: false } })
    expect((await post({ op: 'install', slug: PAID })).status()).toBe(403)
    // …and comes back when the vendor restores it.
    await admin.post('/api/admin/repository', { data: { op: 'license.status', id: row.id, status: 'ACTIVE' } })
    expect((await (await post({ op: 'refresh' })).json()).revoked).not.toContain(PAID)
  })

  test('buying with the wallet issues a license once, reports a shortfall, and the buyer can download', async ({ admin }) => {
    // The compiled fixture finishes the preceding vendor/client scenarios in
    // seconds. They share the loopback IP's one-minute repository bucket with
    // this buyer. Let that real window expire; keep the application's limits.
    if (process.env.MOBOCOM_ISOLATED_FIXTURE === '1' && process.env.NODE_ENV === 'production') {
      await new Promise(resolve => setTimeout(resolve, 60_000))
    }
    // The signed-in administrator plays the buyer. Their Toman wallet is topped up directly in the database.
    const db = new PrismaClient()
    try {
      const user = await db.user.findUnique({ where: { email: String(process.env.E2E_ADMIN_EMAIL).toLowerCase() } })
      expect(user).toBeTruthy()
      await db.walletAccount.upsert({ where: { userId_currency: { userId: user!.id, currency: 'IRT' } }, create: { userId: user!.id, currency: 'IRT', balanceMinor: 100_000n }, update: { balanceMinor: 100_000n } })
      const expensive = await admin.post('/api/admin/repository', { data: { op: 'product.save', slug: `e2e-dear-${RUN}`, name: 'Dear pack', price: '900000000', active: true } })
      ids[`e2e-dear-${RUN}`] = (await expensive.json()).id
      await admin.post('/api/admin/repository/upload', { multipart: { productId: String(ids[`e2e-dear-${RUN}`]), changelog: 'x', file: { name: 'p.zip', mimeType: 'application/zip', buffer: zipOf(`e2e-dear-${RUN}`, '1.0.0') } } })

      const buy = (productId: number, requestId: string) => admin.post('/api/repo/mine', { data: { op: 'buy', productId, requestId } })
      const poor = await buy(ids[`e2e-dear-${RUN}`], 'req-dear-000001')
      expect(poor.status()).toBe(402)
      expect((await poor.json()).shortfall).toBeGreaterThan(0)
      expect((await buy(ids[FREE], 'req-free-000001')).status(), 'a free product needs no license').toBe(409)
      expect((await buy(ids[PAID], 'short')).status(), 'the request id is required').toBe(400)

      const first = await buy(ids[PAID], 'req-paid-000001')
      expect(first.ok(), await first.text()).toBeTruthy()
      expect((await (await buy(ids[PAID], 'req-paid-000001')).json()).repeated, 'the same request is not charged twice').toBe(true)
      const account = await db.walletAccount.findUnique({ where: { userId_currency: { userId: user!.id, currency: 'IRT' } } })
      expect(Number(account!.balanceMinor)).toBe(100_000 - 1500)

      const mine = await (await admin.get('/api/repo/mine')).json()
      const bought = mine.licenses.find((l: { slug: string; paid: string }) => l.slug === PAID && l.paid)
      expect(bought.key).toMatch(/^MBC-/)
      const zip = await admin.get(`/api/repo/mine/download?license=${bought.id}`)
      expect(zip.status()).toBe(200)
      expect(zip.headers()['content-type']).toBe('application/zip')
      expect((await zip.body()).subarray(0, 2).toString()).toBe('PK')
      expect((await admin.get('/api/repo/mine/download?license=999999')).status()).toBe(404)
      expect((await admin.post('/api/repo/mine', { data: { op: 'release-site', licenseId: 999999, site: 'x.example.com' } })).status(), "another person's license cannot be touched").toBe(404)
    } finally { await db.$disconnect() }
  })

  test('only administrators reach the management APIs and buyers must sign in', async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } })
    for (const path of ['/api/admin/repository', '/api/admin/repository/client']) expect([401, 403], path).toContain((await guest.get(path)).status())
    expect([401, 403]).toContain((await guest.post('/api/admin/repository', { data: { op: 'settings', enabled: true } })).status())
    expect([401, 403]).toContain((await guest.post('/api/admin/repository/upload', { multipart: { productId: '1', file: { name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('x') } } })).status())
    expect((await guest.get('/api/repo/mine')).status()).toBe(401)
    expect((await guest.post('/api/repo/mine', { data: { op: 'buy', productId: 1, requestId: 'abcdefgh12' } })).status()).toBe(401)
    await guest.dispose()
  })
})
