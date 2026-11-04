import { db } from '@/platform/database/prisma'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import {
  HOSTING_KINDS, HostingError, cyclesFor, kindMeta, kindsOf, monthlyEquivalent, normalizeProduct, normalizeProvider, savingPercent,
  type HostingGroup, type PublicHostingProduct,
} from '@/modules/hosting/domain/catalog'
import { hostingDriver, hasHostingDriver } from '@/modules/hosting/server/drivers/registry'

export type { PublicHostingProduct }

const KIND_ORDER: string[] = HOSTING_KINDS.map((kind) => kind.id)
const unique = (error: unknown) => (error as { code?: string })?.code === 'P2002'
const parseList = (value: string): string[] => { try { const list = JSON.parse(value); return Array.isArray(list) ? list.map(String) : [] } catch { return [] } }
const parseConfig = (value: string): Record<string, unknown> => { try { const data = JSON.parse(value); return data && typeof data === 'object' && !Array.isArray(data) ? data : {} } catch { return {} } }

// ============ Admin ============

/** Everything the Admin pages show. A provider's secret is reported only as present or not. */
export async function adminHostingCatalog() {
  const [providers, products] = await Promise.all([
    db.hostingProvider.findMany({ orderBy: [{ family: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true } } } }),
    db.hostingProduct.findMany({ orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { id: 'asc' }], include: { prices: true } }),
  ])
  return {
    providers: providers.map(({ secret, config: _config, _count, ...provider }) => ({
      ...provider, hasSecret: Boolean(secret), products: _count.products, built: hasHostingDriver(provider.driver),
    })),
    // In the order of HOSTING_KINDS (web hosting first, then servers), then the Admin's own order.
    products: products.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).map((product) => ({
      ...product,
      features: parseList(product.features),
      trafficPackMinor: product.trafficPackMinor.toString(),
      stoppedHourlyMinor: product.stoppedHourlyMinor.toString(),
      prices: product.prices.map((price) => ({ cycle: price.cycle, currency: price.currency, amountMinor: price.amountMinor.toString(), setupMinor: price.setupMinor.toString() })),
    })),
  }
}

export async function saveHostingProvider(raw: Record<string, unknown>) {
  const input = normalizeProvider(raw)
  const data = {
    name: input.name, family: input.family, driver: input.driver, url: input.url, username: input.username,
    location: input.location, capacity: input.capacity, active: input.active,
  }
  if (input.id) {
    const current = await db.hostingProvider.findUnique({ where: { id: input.id }, select: { driver: true, _count: { select: { products: true } } } })
    if (!current) throw new HostingError('سامانه پیدا نشد')
    if (current.driver !== input.driver && current._count.products) throw new HostingError('نوع سامانه‌ای که محصول دارد عوض نمی‌شود؛ سامانهٔ تازه بسازید')
    return db.hostingProvider.update({
      where: { id: input.id },
      // A new secret replaces the stored one; an empty field keeps it. The last check no longer describes it.
      data: { ...data, ...(input.secret ? { secret: encryptPanelCredential(input.secret), lastCheckAt: null, lastCheckOk: null, lastCheckMessage: '' } : {}) },
      select: { id: true },
    })
  }
  if (!input.secret) throw new HostingError('رمز یا توکن اتصال لازم است')
  return db.hostingProvider.create({ data: { ...data, secret: encryptPanelCredential(input.secret) }, select: { id: true } })
}

export async function deleteHostingProvider(id: number) {
  const current = await db.hostingProvider.findUnique({ where: { id }, select: { _count: { select: { products: true } } } })
  if (!current) return false
  if (current._count.products) throw new HostingError('این سامانه محصول دارد؛ اول محصولات را به سامانهٔ دیگری ببرید یا حذف کنید')
  // The foreign key refuses too, if a product was linked in between.
  await db.hostingProvider.delete({ where: { id } })
  return true
}

/** Runs the driver's connection check and records the answer on the provider. */
export async function testHostingProvider(id: number) {
  const provider = await db.hostingProvider.findUnique({ where: { id } })
  if (!provider) throw new HostingError('سامانه پیدا نشد')
  let secret = ''
  try { secret = decryptPanelCredential(provider.secret) } catch { throw new HostingError('رمز ذخیره‌شده خوانده نشد؛ کلید رمزگذاری سرور را بررسی کنید') }
  const result = await hostingDriver({ driver: provider.driver, url: provider.url, username: provider.username, secret, config: parseConfig(provider.config) }).testConnection()
  const message = result.message.slice(0, 300)
  await db.hostingProvider.update({ where: { id }, data: { lastCheckAt: new Date(), lastCheckOk: result.ok, lastCheckMessage: message } })
  return { ok: result.ok, message }
}

export async function saveHostingProduct(raw: Record<string, unknown>) {
  const input = normalizeProduct(raw)
  if (input.providerId) {
    const provider = await db.hostingProvider.findUnique({ where: { id: input.providerId }, select: { family: true } })
    if (!provider) throw new HostingError('سامانهٔ انتخاب‌شده پیدا نشد')
    if (provider.family !== kindMeta(input.kind)?.family) throw new HostingError('این سامانه برای این نوع محصول نیست')
  }
  const { id, prices, features, ...fields } = input
  const data = { ...fields, features: JSON.stringify(features) }
  try {
    return await db.$transaction(async (tx) => {
      const product = id
        ? await tx.hostingProduct.update({ where: { id }, data, select: { id: true } })
        : await tx.hostingProduct.create({ data, select: { id: true } })
      // Prices are replaced as a whole; the unique (product, cycle, currency) key refuses a duplicate.
      await tx.hostingPrice.deleteMany({ where: { productId: product.id } })
      if (prices.length) await tx.hostingPrice.createMany({ data: prices.map((price) => ({ ...price, productId: product.id })) })
      return product
    })
  } catch (error) {
    if (unique(error)) throw new HostingError('این نامک برای محصول دیگری است')
    if ((error as { code?: string })?.code === 'P2025') throw new HostingError('محصول پیدا نشد')
    throw error
  }
}

export async function deleteHostingProduct(id: number) {
  const removed = await db.hostingProduct.deleteMany({ where: { id } })
  return removed.count > 0
}

// ============ Public ============

/**
 * Active products of a public page with their prices, in the order the Admin set. Amounts are whole toman
 * (the base currency has no minor unit), small enough for a number.
 */
export async function publicHostingCatalog(group: HostingGroup): Promise<PublicHostingProduct[]> {
  const products = await db.hostingProduct.findMany({
    where: { active: true, kind: { in: kindsOf(group) }, prices: { some: {} } },
    orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    include: { prices: true },
  })
  return products
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((product) => {
      const allowed = cyclesFor(product.kind)
      const prices = product.prices
        .filter((price) => price.currency === product.currency && allowed.includes(price.cycle as never))
        .sort((a, b) => allowed.indexOf(a.cycle as never) - allowed.indexOf(b.cycle as never))
      return {
        id: product.id, slug: product.slug, name: product.name, tagline: product.tagline, description: product.description,
        kind: product.kind, kindLabel: kindMeta(product.kind)?.label || product.kind,
        cpuCores: product.cpuCores, ramMb: product.ramMb, diskGb: product.diskGb, diskType: product.diskType,
        trafficGb: product.trafficGb, bandwidthMbps: product.bandwidthMbps, sites: product.sites, mailboxes: product.mailboxes,
        databases: product.databases, ipv4: product.ipv4, location: product.location, features: parseList(product.features),
        featured: product.featured, hourly: Boolean(kindMeta(product.kind)?.hourly), currency: product.currency,
        prices: prices.map((price) => ({
          cycle: price.cycle,
          amount: Number(price.amountMinor),
          setup: Number(price.setupMinor),
          monthly: Number(monthlyEquivalent(price)),
          saving: savingPercent(prices, price.cycle, product.currency),
        })),
      }
    })
    .filter((product) => product.prices.length > 0)
}
