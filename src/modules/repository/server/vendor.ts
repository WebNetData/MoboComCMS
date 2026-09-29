import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { moveWallet, walletBalance } from '@/modules/wallet/server/wallet'
import { PACKAGE_LIMITS, PackageError, normalizeEntries, parseManifest } from '@/modules/packages/domain/format'
import { ZipError, readZip } from '@/modules/packages/domain/zip'
import {
  ACTIVATION_MESSAGES, RepoError, buildCertificate, checkReleaseManifest, decideActivation, maskKey, normalizeLicenseKey, normalizeProduct, normalizeSiteHost, releaseAllowed, updatesUntilFor,
  type Certificate,
} from '@/modules/repository/domain/repository'
import { fingerprintOf, newLicenseKey, sha256, signPayload, vendorKeys } from './crypto'

export const releaseDirectory = () => join(process.cwd(), 'storage', 'repository')
const CONFIG_KEY = 'repository.vendor.v1'
const hashKey = (key: string) => sha256(`license:${key}`)
const money = (minor: bigint) => `${Number(minor).toLocaleString('fa-IR')} تومان`

export interface VendorConfig { enabled: boolean; name: string }
export async function getVendorConfig(): Promise<VendorConfig> {
  const stored = await readJsonSetting(CONFIG_KEY)
  return { enabled: stored?.enabled === true, name: String(stored?.name || '').slice(0, 80) }
}
export async function saveVendorConfig(input: Record<string, unknown>): Promise<VendorConfig> {
  const next: VendorConfig = { enabled: input.enabled === true, name: String(input.name ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 80) }
  await writeJsonSetting(CONFIG_KEY, next)
  return next
}

// ------------------------------------------------------------------ products and releases

const releaseView = (r: { id: number; version: string; sha256: string; size: number; changelog: string; requiresCore: string; runtime: string; published: boolean; createdAt: Date }) => ({
  id: r.id, version: r.version, sha256: r.sha256, size: r.size, changelog: r.changelog, requiresCore: r.requiresCore, runtime: r.runtime, published: r.published, createdAt: r.createdAt.toISOString(),
})

export async function listProducts() {
  const rows = await db.repoProduct.findMany({ orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }], include: { releases: { orderBy: { createdAt: 'desc' } }, _count: { select: { licenses: true } } } })
  return rows.map((p) => ({
    id: p.id, slug: p.slug, kind: p.kind, name: p.name, summary: p.summary, description: p.description, icon: p.icon, cover: p.cover, author: p.author, category: p.category,
    price: p.priceMinor.toString(), priceLabel: p.priceMinor === 0n ? 'رایگان' : money(p.priceMinor), siteLimit: p.siteLimit, supportDays: p.supportDays, active: p.active, featured: p.featured,
    downloads: p.downloads, sold: p.sold, licenses: p._count.licenses, releases: p.releases.map(releaseView),
  }))
}

export async function saveProduct(input: Record<string, unknown>, id?: number) {
  const data = normalizeProduct(input)
  try {
    if (id) {
      const current = await db.repoProduct.findUnique({ where: { id } })
      if (!current) throw new RepoError('محصول پیدا نشد', 404)
      // The id is the package id; changing it would orphan releases and licenses.
      return await db.repoProduct.update({ where: { id }, data: { ...data, slug: current.slug, kind: current.kind } })
    }
    return await db.repoProduct.create({ data })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new RepoError('این شناسه قبلاً ثبت شده است', 409)
    throw error
  }
}

export async function deleteProduct(id: number) {
  const product = await db.repoProduct.findUnique({ where: { id }, include: { releases: { select: { fileId: true } }, _count: { select: { licenses: true } } } })
  if (!product) return
  if (product._count.licenses > 0) throw new RepoError('محصولی که لایسنس دارد حذف نمی‌شود؛ آن را غیرفعال کنید', 409)
  await Promise.all(product.releases.map((r) => unlink(join(releaseDirectory(), r.fileId)).catch(() => undefined)))
  await db.repoProduct.delete({ where: { id } })
}

/** A release is a package zip; its manifest decides the version and must match the product. */
export async function uploadRelease(productId: number, upload: Buffer, changelog: string) {
  const product = await db.repoProduct.findUnique({ where: { id: productId }, include: { releases: { select: { version: true } } } })
  if (!product) throw new RepoError('محصول پیدا نشد', 404)
  if (upload.length > PACKAGE_LIMITS.uploadBytes) throw new RepoError(`حجم فایل حداکثر ${PACKAGE_LIMITS.uploadBytes / 1024 / 1024} مگابایت است`, 413)
  let manifest: ReturnType<typeof parseManifest>
  try {
    const entries = normalizeEntries(readZip(upload, PACKAGE_LIMITS))
    const source = entries.get('manifest.json')
    if (!source) throw new RepoError('manifest.json در ریشهٔ zip نیست')
    manifest = parseManifest(JSON.parse(source.toString('utf8')), new Set(entries.keys()))
  } catch (error) {
    if (error instanceof RepoError) throw error
    if (error instanceof ZipError || error instanceof PackageError) throw new RepoError(error.message)
    throw new RepoError('فایل zip یا manifest.json معتبر نیست')
  }
  checkReleaseManifest(manifest, product, product.releases.map((r) => r.version))
  const fileId = `${randomUUID()}.zip`
  await mkdir(releaseDirectory(), { recursive: true })
  await writeFile(join(releaseDirectory(), fileId), upload, { flag: 'wx', mode: 0o600 })
  return db.repoRelease.create({ data: { productId, version: manifest.version, fileId, sha256: sha256(upload), size: upload.length, changelog: String(changelog || '').slice(0, 5000), requiresCore: manifest.requiresCore || '', runtime: manifest.runtime } })
}

export async function setReleasePublished(id: number, published: boolean) {
  await db.repoRelease.update({ where: { id }, data: { published } })
}

async function readReleaseFile(fileId: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.zip$/.test(fileId)) return null
  try { return await readFile(join(releaseDirectory(), fileId)) } catch { return null }
}

// ------------------------------------------------------------------ licenses (vendor's view)

const licenseRow = (l: { id: number; keyEnc: string; keyLast4: string; productId: number; userId: number | null; email: string; source: string; status: string; siteLimit: number; paidMinor: bigint; note: string; createdAt: Date; updatesUntil: Date | null; product?: { slug: string; name: string }; activations?: { site: string; active: boolean; lastSeenAt: Date; coreVersion: string }[] }, reveal: boolean) => ({
  id: l.id, key: reveal ? decryptPanelCredential(l.keyEnc) : maskKey(l.keyLast4), productId: l.productId, product: l.product?.name || '', slug: l.product?.slug || '', userId: l.userId, email: l.email, source: l.source, status: l.status,
  siteLimit: l.siteLimit, paid: l.paidMinor > 0n ? money(l.paidMinor) : '', note: l.note, createdAt: l.createdAt.toISOString(), updatesUntil: l.updatesUntil?.toISOString() || '',
  sites: (l.activations || []).map((a) => ({ site: a.site, active: a.active, lastSeenAt: a.lastSeenAt.toISOString(), coreVersion: a.coreVersion })),
})

export async function listLicenses(filter: { q?: string; productId?: number; status?: string; page?: number }) {
  const page = Math.max(1, filter.page || 1)
  const q = String(filter.q || '').trim()
  const where = {
    ...(filter.productId ? { productId: filter.productId } : {}), ...(filter.status === 'ACTIVE' || filter.status === 'REVOKED' ? { status: filter.status } : {}),
    ...(q ? { OR: [{ email: { contains: q } }, { note: { contains: q } }, { keyLast4: { contains: q.slice(-5).toUpperCase() } }, { activations: { some: { site: { contains: q.toLowerCase() } } } }] } : {}),
  }
  const [rows, total] = await Promise.all([
    db.repoLicense.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { product: { select: { slug: true, name: true } }, activations: true } }),
    db.repoLicense.count({ where }),
  ])
  return { rows: rows.map((l) => licenseRow(l, false)), total, page, pages: Math.max(1, Math.ceil(total / 25)) }
}

async function issueLicense(input: { productId: number; userId: number | null; email: string; source: 'PURCHASE' | 'GRANT'; paidMinor: bigint; note: string }) {
  const product = await db.repoProduct.findUnique({ where: { id: input.productId } })
  if (!product) throw new RepoError('محصول پیدا نشد', 404)
  const key = newLicenseKey()
  const license = await db.repoLicense.create({
    data: { keyHash: hashKey(key), keyEnc: encryptPanelCredential(key), keyLast4: key.slice(-5), productId: product.id, userId: input.userId, email: input.email.slice(0, 254), source: input.source, siteLimit: product.siteLimit, paidMinor: input.paidMinor, currency: product.currency, note: input.note.slice(0, 300), updatesUntil: updatesUntilFor(product.supportDays, new Date()) },
  })
  return { license, key }
}

/** A license given by the administrator (a gift, a partner, a manual sale). The key is shown once in the response. */
export async function grantLicense(input: { productId: number; email?: string; userId?: number; note?: string }) {
  const { license, key } = await issueLicense({ productId: input.productId, userId: input.userId || null, email: String(input.email || ''), source: 'GRANT', paidMinor: 0n, note: String(input.note || '') })
  return { id: license.id, key }
}

export async function setLicenseStatus(id: number, status: 'ACTIVE' | 'REVOKED') {
  const result = await db.repoLicense.updateMany({ where: { id }, data: { status } })
  if (!result.count) throw new RepoError('لایسنس پیدا نشد', 404)
}

export async function extendLicense(id: number, days: number) {
  const license = await db.repoLicense.findUnique({ where: { id } })
  if (!license) throw new RepoError('لایسنس پیدا نشد', 404)
  const n = Math.trunc(days)
  if (!Number.isFinite(n) || n < 1 || n > 3650) throw new RepoError('تعداد روز معتبر نیست')
  const from = license.updatesUntil && license.updatesUntil > new Date() ? license.updatesUntil : new Date()
  await db.repoLicense.update({ where: { id }, data: { updatesUntil: new Date(from.getTime() + n * 86_400_000) } })
}

export async function releaseSite(licenseId: number, site: string, owner?: { userId: number }) {
  const license = await db.repoLicense.findUnique({ where: { id: licenseId } })
  if (!license || (owner && license.userId !== owner.userId)) throw new RepoError('لایسنس پیدا نشد', 404)
  await db.repoActivation.updateMany({ where: { licenseId, site: normalizeSiteHost(site) }, data: { active: false } })
}

export async function repositoryStats() {
  const [products, licenses, active, revenue] = await Promise.all([
    db.repoProduct.count(), db.repoLicense.count(), db.repoLicense.count({ where: { status: 'ACTIVE' } }), db.repoLicense.aggregate({ _sum: { paidMinor: true } }),
  ])
  return { products, licenses, active, revenue: money(revenue._sum.paidMinor || 0n), downloads: (await db.repoProduct.aggregate({ _sum: { downloads: true } }))._sum.downloads || 0 }
}

// ------------------------------------------------------------------ buying (wallet)

export async function buyProduct(userId: number, productId: number, requestId: string) {
  const id = String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  if (id.length < 8) throw new RepoError('درخواست نامعتبر است')
  const product = await db.repoProduct.findUnique({ where: { id: productId } })
  if (!product || !product.active) throw new RepoError('این محصول در دسترس نیست', 404)
  if (product.priceMinor === 0n) throw new RepoError('این محصول رایگان است و لایسنس نمی‌خواهد', 409)
  const marker = `buy:${id}`
  const existing = await db.repoLicense.findFirst({ where: { userId, productId, note: marker }, select: { id: true } })
  if (existing) return { licenseId: existing.id, repeated: true }
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (!user) throw new RepoError('کاربر پیدا نشد', 404)
  const price = Number(product.priceMinor)
  const paid = await moveWallet({ userId, amount: -price, currency: product.currency, type: 'PURCHASE', description: `خرید «${product.name}» از مخزن افزونه‌ها`, idempotencyKey: `repo:buy:${userId}:${product.id}:${id}` })
  if (!paid.ok) {
    if (/insufficient/i.test(paid.message || '')) {
      const balance = await walletBalance(userId, product.currency)
      throw new RepoError('موجودی کیف پول کافی نیست', 402, { shortfall: Math.max(0, price - balance), currency: product.currency })
    }
    throw new RepoError(paid.message || 'پرداخت انجام نشد', 502)
  }
  const { license } = await issueLicense({ productId: product.id, userId, email: user.email, source: 'PURCHASE', paidMinor: product.priceMinor, note: marker })
  await db.repoProduct.update({ where: { id: product.id }, data: { sold: { increment: 1 } } })
  return { licenseId: license.id, repeated: false }
}

/** The buyer's own licenses, with the full keys. */
export async function licensesOf(userId: number) {
  const rows = await db.repoLicense.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { product: { select: { slug: true, name: true } }, activations: true } })
  return rows.map((l) => licenseRow(l, true))
}

// ------------------------------------------------------------------ public repository API

const signedRelease = async (slug: string, r: { version: string; sha256: string; size: number }) => ({ slug, version: r.version, sha256: r.sha256, size: r.size })

/** The catalog: every active product with its newest published release, each release signed so sites can verify it. */
export async function publicCatalog(filter: { kind?: string; q?: string } = {}) {
  const q = String(filter.q || '').trim().toLowerCase()
  const rows = await db.repoProduct.findMany({
    where: { active: true, ...(filter.kind === 'PLUGIN' || filter.kind === 'THEME' ? { kind: filter.kind } : {}) },
    orderBy: [{ featured: 'desc' }, { downloads: 'desc' }, { updatedAt: 'desc' }], take: 300,
    include: { releases: { where: { published: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const products = []
  for (const p of rows) {
    if (q && !`${p.name} ${p.summary} ${p.slug} ${p.category}`.toLowerCase().includes(q)) continue
    const r = p.releases[0]
    products.push({
      slug: p.slug, kind: p.kind, name: p.name, summary: p.summary, icon: p.icon, author: p.author, category: p.category, price: p.priceMinor.toString(), currency: p.currency, siteLimit: p.siteLimit, supportDays: p.supportDays, featured: p.featured,
      latest: r ? { version: r.version, size: r.size, sha256: r.sha256, requiresCore: r.requiresCore, runtime: r.runtime, changelog: r.changelog, publishedAt: r.createdAt.toISOString(), signature: await signPayload(await signedRelease(p.slug, r)) } : null,
    })
  }
  return { products }
}

export async function publicMeta() {
  const { publicPem } = await vendorKeys()
  const config = await getVendorConfig()
  return { name: config.name, publicKey: publicPem, fingerprint: fingerprintOf(publicPem), version: 1 }
}

export async function publicProduct(slug: string) {
  const p = await db.repoProduct.findFirst({ where: { slug, active: true }, include: { releases: { where: { published: true }, orderBy: { createdAt: 'desc' }, take: 10 } } })
  if (!p) return null
  return {
    id: p.id, slug: p.slug, kind: p.kind, name: p.name, summary: p.summary, description: p.description, icon: p.icon, cover: p.cover, author: p.author, category: p.category,
    price: p.priceMinor.toString(), priceLabel: p.priceMinor === 0n ? 'رایگان' : money(p.priceMinor), siteLimit: p.siteLimit, supportDays: p.supportDays, downloads: p.downloads,
    releases: p.releases.map((r) => ({ version: r.version, size: r.size, changelog: r.changelog, requiresCore: r.requiresCore, publishedAt: r.createdAt.toISOString() })),
  }
}

async function findLicense(rawKey: unknown, slug: string) {
  const key = normalizeLicenseKey(rawKey)
  if (!key) throw new RepoError('کلید لایسنس معتبر نیست', 400)
  const license = await db.repoLicense.findUnique({ where: { keyHash: hashKey(key) }, include: { product: true, activations: true } })
  // The same message for "no such key" and "another product's key": a key is never confirmed to belong to something else.
  if (!license || license.product.slug !== slug) throw new RepoError('این کلید برای این محصول معتبر نیست', 404)
  return license
}

async function certificateFor(license: { id: number; status: string; updatesUntil: Date | null; product: { slug: string } }, site: string) {
  const certificate: Certificate = buildCertificate({ licenseId: license.id, product: license.product.slug, site, status: license.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED', updatesUntil: license.updatesUntil, now: new Date() })
  return { certificate, signature: await signPayload(certificate) }
}

/** A site asks to run a license: a new site takes one of the license's places; the answer is a signed certificate. */
export async function activateLicense(input: { key: unknown; slug: string; site: unknown; coreVersion?: unknown; ipHash: string }) {
  const site = normalizeSiteHost(input.site)
  const license = await findLicense(input.key, input.slug)
  const decision = decideActivation(license, license.activations, site)
  if (!decision.ok) throw new RepoError(ACTIVATION_MESSAGES[decision.reason], decision.reason === 'revoked' ? 403 : 409, { reason: decision.reason })
  await db.repoActivation.upsert({
    where: { licenseId_site: { licenseId: license.id, site } },
    create: { licenseId: license.id, site, coreVersion: String(input.coreVersion || '').slice(0, 20), ipHash: input.ipHash },
    update: { active: true, lastSeenAt: new Date(), coreVersion: String(input.coreVersion || '').slice(0, 20), ipHash: input.ipHash },
  })
  return certificateFor(license, site)
}

/** Refreshes a certificate (the site's daily check). A revoked license answers with a revoked certificate, so the site can react. */
export async function checkLicense(input: { key: unknown; slug: string; site: unknown }) {
  const site = normalizeSiteHost(input.site)
  const license = await findLicense(input.key, input.slug)
  const activation = license.activations.find((a) => a.site === site && a.active)
  if (!activation) throw new RepoError('این سایت با این لایسنس فعال نشده است', 404, { reason: 'not-activated' })
  await db.repoActivation.update({ where: { id: activation.id }, data: { lastSeenAt: new Date() } })
  return certificateFor(license, site)
}

export async function deactivateLicense(input: { key: unknown; slug: string; site: unknown }) {
  const site = normalizeSiteHost(input.site)
  const license = await findLicense(input.key, input.slug)
  await db.repoActivation.updateMany({ where: { licenseId: license.id, site }, data: { active: false } })
  return { ok: true }
}

/** A release file. Free products need nothing; paid ones need a license that is active on this site and covers the release date. */
export async function downloadRelease(input: { slug: string; version: string; key?: unknown; site?: unknown }) {
  const product = await db.repoProduct.findFirst({ where: { slug: input.slug, active: true } })
  if (!product) throw new RepoError('محصول پیدا نشد', 404)
  const release = await db.repoRelease.findFirst({ where: { productId: product.id, version: input.version, published: true } })
  if (!release) throw new RepoError('نسخه پیدا نشد', 404)
  if (product.priceMinor > 0n) {
    const site = normalizeSiteHost(input.site)
    const license = await findLicense(input.key, product.slug)
    if (license.status !== 'ACTIVE') throw new RepoError('این لایسنس باطل شده است', 403)
    if (!license.activations.some((a) => a.site === site && a.active)) throw new RepoError('ابتدا لایسنس را برای این سایت فعال کنید', 403)
    if (!releaseAllowed(release.createdAt, license)) throw new RepoError('این نسخه بعد از پایان دورهٔ به‌روزرسانی لایسنس شما منتشر شده است؛ لایسنس را تمدید کنید', 403)
  }
  const buffer = await readReleaseFile(release.fileId)
  if (!buffer || sha256(buffer) !== release.sha256) throw new RepoError('فایل نسخه در دسترس نیست', 500)
  await db.repoProduct.update({ where: { id: product.id }, data: { downloads: { increment: 1 } } })
  return { buffer, version: release.version, sha256: release.sha256 }
}

/** A buyer downloads a release for another (non-MoboCom-connected) site, from their dashboard. */
export async function downloadForOwner(userId: number, licenseId: number, version?: string) {
  const license = await db.repoLicense.findFirst({ where: { id: licenseId, userId }, include: { product: true } })
  if (!license || license.status !== 'ACTIVE') throw new RepoError('لایسنس پیدا نشد یا باطل است', 404)
  const release = await db.repoRelease.findFirst({ where: { productId: license.productId, published: true, ...(version ? { version } : {}) }, orderBy: { createdAt: 'desc' } })
  if (!release || !releaseAllowed(release.createdAt, license)) throw new RepoError('نسخه‌ای در دورهٔ لایسنس شما موجود نیست', 404)
  const buffer = await readReleaseFile(release.fileId)
  if (!buffer) throw new RepoError('فایل نسخه در دسترس نیست', 500)
  await db.repoProduct.update({ where: { id: license.productId }, data: { downloads: { increment: 1 } } })
  return { buffer, filename: `${license.product.slug}-${release.version}.zip` }
}

/** The public catalog page: products without signatures (those are for sites, not visitors). */
export async function publicListing(filter: { kind?: string; q?: string } = {}) {
  const q = String(filter.q || '').trim().toLowerCase()
  const rows = await db.repoProduct.findMany({
    where: { active: true, ...(filter.kind === 'PLUGIN' || filter.kind === 'THEME' ? { kind: filter.kind } : {}) },
    orderBy: [{ featured: 'desc' }, { downloads: 'desc' }, { updatedAt: 'desc' }], take: 200,
    include: { releases: { where: { published: true }, orderBy: { createdAt: 'desc' }, take: 1, select: { version: true } } },
  })
  return rows.filter((p) => p.releases.length && (!q || `${p.name} ${p.summary} ${p.slug} ${p.category}`.toLowerCase().includes(q))).map((p) => ({
    slug: p.slug, kind: p.kind, name: p.name, summary: p.summary, icon: p.icon, author: p.author, category: p.category, free: p.priceMinor === 0n, priceLabel: p.priceMinor === 0n ? 'رایگان' : money(p.priceMinor), version: p.releases[0].version, featured: p.featured,
  }))
}
