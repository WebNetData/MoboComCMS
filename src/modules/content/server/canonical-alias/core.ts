import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { Prisma as PrismaClient } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { trashData, TRASHED } from '@/modules/content/domain/trash'
import { auditAdminStrict } from '@/platform/audit/server'
import { availableCodeStock } from '@/modules/catalog/server/code-stock'
import { isPublicProduct } from '@/modules/catalog/domain/product-publication'
import { requirePerm } from '@/modules/identity/server/access'

export type CanonicalAliasKind = 'product' | 'cinema' | 'game' | 'software'
type Tx = Prisma.TransactionClient
type Client = Tx | typeof db
type Alias = Prisma.ContentCanonicalAliasGetPayload<Record<string, never>>
type StatusRow = { id: number; slug: string; status?: string; active?: boolean; approval?: string; audienceGroups?: string; access?: string; publishedAt?: Date | null; trashedStatus?: string | null; updatedAt: Date; title: string; titleEn?: string; kind?: string; year?: number | null; releaseDate?: Date | null; version?: string; platforms?: string; stock?: number; digitalMode?: string; variants?: { id: number; stock: number }[] }

export const OWNERS: Record<CanonicalAliasKind, { module: string; permission: string; path: (slug: string) => string }> = {
  product: { module: 'store', permission: 'cms.products', path: slug => `/products/${encodeURIComponent(slug)}` },
  cinema: { module: 'cinema', permission: 'cinema.manage', path: slug => `/cinema/${encodeURIComponent(slug)}` },
  game: { module: 'games', permission: 'games.manage', path: slug => `/games/${encodeURIComponent(slug)}` },
  software: { module: 'software', permission: 'software.manage', path: slug => `/software/${encodeURIComponent(slug)}` },
}

export class CanonicalAliasError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const norm = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export const cleanId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
const live = (row: StatusRow) => row.active !== undefined
  ? isPublicProduct({ active: row.active, approval: row.approval || '', audienceGroups: row.audienceGroups || '' })
  : row.status === 'PUBLISHED' && row.access === 'PUBLIC' && !row.audienceGroups && (!row.publishedAt || row.publishedAt <= new Date())
const pathFor = (kind: CanonicalAliasKind, slug: string) => OWNERS[kind].path(slug)

function aliasForPath(client: Client, kind: CanonicalAliasKind, path: string) {
  const common = { sourcePath: path, active: true }
  if (kind === 'product') return client.contentCanonicalAlias.findFirst({ where: { ...common, kind: 'PRODUCT' } })
  if (kind === 'cinema') return client.contentCanonicalAlias.findFirst({ where: { ...common, kind: 'CINEMA' } })
  if (kind === 'game') return client.contentCanonicalAlias.findFirst({ where: { ...common, kind: 'GAME' } })
  return client.contentCanonicalAlias.findFirst({ where: { ...common, kind: 'SOFTWARE' } })
}

async function upsertAlias(tx: Tx, input: { kind: CanonicalAliasKind; sourceId: number; targetId: number; sourcePath: string; targetPath: string; sourceVersion: Date; targetVersion: Date; reviewerId: number }) {
  const common = { sourcePath: input.sourcePath, targetPath: input.targetPath, sourceVersion: input.sourceVersion, targetVersion: input.targetVersion, reviewedByUserId: input.reviewerId }
  if (input.kind === 'product') return tx.contentCanonicalAlias.upsert({ where: { productSourceId: input.sourceId }, create: { ...common, kind: 'PRODUCT', productSourceId: input.sourceId, productTargetId: input.targetId }, update: { ...common, productTargetId: input.targetId, reviewedAt: new Date(), active: true } })
  if (input.kind === 'cinema') return tx.contentCanonicalAlias.upsert({ where: { cinemaSourceId: input.sourceId }, create: { ...common, kind: 'CINEMA', cinemaSourceId: input.sourceId, cinemaTargetId: input.targetId }, update: { ...common, cinemaTargetId: input.targetId, reviewedAt: new Date(), active: true } })
  if (input.kind === 'game') return tx.contentCanonicalAlias.upsert({ where: { gameSourceId: input.sourceId }, create: { ...common, kind: 'GAME', gameSourceId: input.sourceId, gameTargetId: input.targetId }, update: { ...common, gameTargetId: input.targetId, reviewedAt: new Date(), active: true } })
  return tx.contentCanonicalAlias.upsert({ where: { softwareSourceId: input.sourceId }, create: { ...common, kind: 'SOFTWARE', softwareSourceId: input.sourceId, softwareTargetId: input.targetId }, update: { ...common, softwareTargetId: input.targetId, reviewedAt: new Date(), active: true } })
}

export async function entity(client: Client, kind: CanonicalAliasKind, id: number): Promise<StatusRow | null> {
  if (kind === 'product') {
    const row = await client.product.findUnique({ where: { id }, select: { id: true, slug: true, active: true, approval: true, audienceGroups: true, updatedAt: true, name: true, nameEn: true, kind: true, stock: true, digitalMode: true, variants: { select: { id: true, stock: true } } } })
    return row ? { ...row, title: row.name, titleEn: row.nameEn } : null
  }
  if (kind === 'cinema') return client.cinemaTitle.findUnique({ where: { id }, select: { id: true, slug: true, status: true, access: true, audienceGroups: true, publishedAt: true, trashedStatus: true, updatedAt: true, title: true, titleEn: true, kind: true, year: true } })
  if (kind === 'game') return client.gameTitle.findUnique({ where: { id }, select: { id: true, slug: true, status: true, access: true, audienceGroups: true, publishedAt: true, trashedStatus: true, updatedAt: true, title: true, titleEn: true, releaseDate: true, platforms: true } })
  return client.softwareTitle.findUnique({ where: { id }, select: { id: true, slug: true, status: true, access: true, audienceGroups: true, publishedAt: true, trashedStatus: true, updatedAt: true, title: true, titleEn: true, version: true, platforms: true } })
}

export function aliasSource(client: Client, kind: CanonicalAliasKind, sourceId: number) {
  if (kind === 'product') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'PRODUCT', productSourceId: sourceId } })
  if (kind === 'cinema') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'CINEMA', cinemaSourceId: sourceId } })
  if (kind === 'game') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'GAME', gameSourceId: sourceId } })
  return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'SOFTWARE', softwareSourceId: sourceId } })
}

function aliasIncoming(client: Client, kind: CanonicalAliasKind, targetId: number) {
  if (kind === 'product') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'PRODUCT', productTargetId: targetId } })
  if (kind === 'cinema') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'CINEMA', cinemaTargetId: targetId } })
  if (kind === 'game') return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'GAME', gameTargetId: targetId } })
  return client.contentCanonicalAlias.findFirst({ where: { active: true, kind: 'SOFTWARE', softwareTargetId: targetId } })
}

export function aliasTargetId(alias: Alias, kind: CanonicalAliasKind) {
  const id = kind === 'product' ? alias.productTargetId : kind === 'cinema' ? alias.cinemaTargetId : kind === 'game' ? alias.gameTargetId : alias.softwareTargetId
  if (!id) throw new CanonicalAliasError('نوع رکورد هم‌نشانی با مقصد ذخیره‌شده سازگار نیست', 409)
  return id
}

function candidatesWhere(kind: CanonicalAliasKind, row: StatusRow) {
  const name = norm(row.title)
  if (kind === 'product') return { active: true, approval: 'APPROVED', audienceGroups: '', kind: row.kind, OR: [{ name: { equals: row.title, mode: 'insensitive' } }, ...(row.titleEn ? [{ name: { equals: row.titleEn, mode: 'insensitive' } }] : []), ...(row.titleEn ? [{ nameEn: { equals: row.titleEn, mode: 'insensitive' } }] : [])] }
  const sameTitle = [{ title: { equals: row.title, mode: 'insensitive' } }, ...(row.titleEn ? [{ title: { equals: row.titleEn, mode: 'insensitive' } }, { titleEn: { equals: row.title, mode: 'insensitive' } }, { titleEn: { equals: row.titleEn, mode: 'insensitive' } }] : [])]
  if (kind === 'cinema') return { status: 'PUBLISHED', kind: row.kind, year: row.year, OR: sameTitle }
  if (kind === 'game') return { status: 'PUBLISHED', releaseDate: row.releaseDate ? { gte: new Date(Date.UTC(row.releaseDate.getUTCFullYear(), 0, 1)), lt: new Date(Date.UTC(row.releaseDate.getUTCFullYear() + 1, 0, 1)) } : null, OR: sameTitle }
  return { status: 'PUBLISHED', version: row.version, OR: sameTitle }
}

async function productBlockers(client: Client, row: StatusRow) {
  const [codesByVariant, reservations, orders, locationStock] = await Promise.all([
    row.digitalMode === 'CODES' ? availableCodeStock(client, row.id) : Promise.resolve(new Map<number | null, number>()),
    client.inventoryReservation.count({ where: { productId: row.id, status: 'HELD' } }),
    client.order.count({ where: {
      OR: [
        { status: 'PENDING' },
        { status: 'PAID', OR: [{ productDelivery: { is: null } }, { productDelivery: { is: { status: { in: ['PENDING', 'PROCESSING', 'PACKED'] } } } }] },
      ],
      AND: [{ OR: [{ productId: row.id }, { lines: { some: { productId: row.id } } }] }],
    } }),
    client.locationStock.findMany({ where: { productId: row.id, quantity: { not: 0 } }, select: { quantity: true } }),
  ])
  const codes = [...codesByVariant.values()].reduce((sum, value) => sum + value, 0)
  const stock = row.stock === -1 || row.variants?.some(variant => variant.stock === -1) ? -1 : Math.max(0, row.stock ?? 0) + (row.variants || []).reduce((sum, variant) => sum + Math.max(0, variant.stock), 0)
  const physicalLocationStock = locationStock.some(item => item.quantity < 0) ? -1 : locationStock.reduce((sum, item) => sum + item.quantity, 0)
  return { stock, physicalLocationStock, codes, reservations, pendingOrders: orders }
}

const hasProductBlockers = (blockers: Awaited<ReturnType<typeof productBlockers>>) => blockers.stock !== 0 || blockers.physicalLocationStock !== 0 || blockers.codes > 0 || blockers.reservations > 0 || blockers.pendingOrders > 0

const MEDIA_PAYWALL_OWNER: Partial<Record<CanonicalAliasKind, string>> = { cinema: 'title', game: 'game', software: 'software' }
async function mediaAccessBlockers(client: Client, kind: CanonicalAliasKind, source: StatusRow, target: StatusRow) {
  const ownerType = MEDIA_PAYWALL_OWNER[kind]
  if (!ownerType) return null
  const ownerIds = [source.id, target.id]
  let descendantLinkIds: number[] = []
  if (kind === 'cinema' && source.kind === 'SERIES' && target.kind === 'SERIES') {
    const seasons = await client.cinemaSeason.findMany({ where: { titleId: { in: ownerIds } }, select: { episodes: { select: { id: true } } } })
    const episodeIds = seasons.flatMap(season => season.episodes.map(episode => episode.id))
    if (episodeIds.length) {
      descendantLinkIds = (await client.mediaLink.findMany({ where: { ownerType: 'episode', ownerId: { in: episodeIds } }, select: { id: true } })).map(link => link.id)
    }
  }
  const [paidItems, purchases, descendantPaidItems, descendantPurchases] = await Promise.all([
    client.paidItem.count({ where: { ownerType, ownerId: { in: ownerIds } } }),
    client.contentPurchase.count({ where: { ownerType, ownerId: { in: ownerIds } } }),
    descendantLinkIds.length ? client.paidItem.count({ where: { ownerType: 'link', ownerId: { in: descendantLinkIds } } }) : Promise.resolve(0),
    descendantLinkIds.length ? client.contentPurchase.count({ where: { ownerType: 'link', ownerId: { in: descendantLinkIds } } }) : Promise.resolve(0),
  ])
  return { paidItems, purchases, descendantPaidItems, descendantPurchases }
}
const hasMediaAccessBlockers = (blockers: Awaited<ReturnType<typeof mediaAccessBlockers>>) => !!blockers && (blockers.paidItems > 0 || blockers.purchases > 0 || blockers.descendantPaidItems > 0 || blockers.descendantPurchases > 0)

function pairCompatible(kind: CanonicalAliasKind, source: StatusRow, target: StatusRow) {
  if (!live(source) || !live(target)) return false
  if (kind === 'product') return source.kind === target.kind && norm(source.title) === norm(target.title)
  if (kind === 'cinema') return source.kind === target.kind && source.year === target.year && norm(source.title) === norm(target.title)
  if (kind === 'game') return source.releaseDate?.getUTCFullYear() === target.releaseDate?.getUTCFullYear() && norm(source.title) === norm(target.title)
  return source.version === target.version && norm(source.title) === norm(target.title)
}

export async function canonicalAliasCandidates(kind: CanonicalAliasKind, sourceId: number) {
  const source = await entity(db, kind, sourceId)
  if (!source) throw new CanonicalAliasError('رکورد پیدا نشد', 404)
  const activeAlias = await aliasSource(db, kind, sourceId)
  if (activeAlias) {
    const targetId = aliasTargetId(activeAlias, kind), target = await entity(db, kind, targetId)
    return { source: { id: source.id, title: source.title, slug: source.slug, version: source.updatedAt.toISOString() }, candidates: [], activeAlias: target ? { targetId, target: target.title, sourcePath: activeAlias.sourcePath, targetPath: activeAlias.targetPath } : null }
  }
  if (!live(source)) throw new CanonicalAliasError('فقط رکورد منتشرشده را می‌توان برای هم‌نشانی بررسی کرد', 409)
  const rows: StatusRow[] = kind === 'product'
    ? (await db.product.findMany({ where: candidatesWhere(kind, source) as Prisma.ProductWhereInput, orderBy: { id: 'asc' }, take: 30 })).map(row => ({ ...row, title: row.name, titleEn: row.nameEn }))
    : kind === 'cinema'
      ? await db.cinemaTitle.findMany({ where: candidatesWhere(kind, source) as Prisma.CinemaTitleWhereInput, orderBy: { id: 'asc' }, take: 30 })
      : kind === 'game'
        ? await db.gameTitle.findMany({ where: candidatesWhere(kind, source) as Prisma.GameTitleWhereInput, orderBy: { id: 'asc' }, take: 30 })
        : await db.softwareTitle.findMany({ where: candidatesWhere(kind, source) as Prisma.SoftwareTitleWhereInput, orderBy: { id: 'asc' }, take: 30 })
  const options = []
  for (const target of rows) {
    if (target.id === source.id || !pairCompatible(kind, source, target)) continue
    const alias = await aliasSource(db, kind, target.id)
    if (!alias) options.push({ id: target.id, title: target.title, slug: target.slug, version: target.updatedAt.toISOString() })
  }
  return { source: { id: source.id, title: source.title, slug: source.slug, version: source.updatedAt.toISOString() }, candidates: options.slice(0, 12), activeAlias: null }
}

export async function previewCanonicalAlias(kind: CanonicalAliasKind, sourceId: number, targetId: number) {
  if (!sourceId || !targetId || sourceId === targetId) throw new CanonicalAliasError('دو رکورد متفاوت و معتبر انتخاب کنید')
  const [source, target, sourceAlias, targetAlias, incomingSourceAlias] = await Promise.all([
    entity(db, kind, sourceId), entity(db, kind, targetId),
    aliasSource(db, kind, sourceId),
    aliasSource(db, kind, targetId),
    aliasIncoming(db, kind, sourceId),
  ])
  if (!source || !target) throw new CanonicalAliasError('رکورد پیدا نشد', 404)
  if (sourceAlias) throw new CanonicalAliasError('این رکورد هم‌اکنون به رکورد اصلی دیگری ارجاع می‌دهد', 409)
  if (targetAlias) throw new CanonicalAliasError('رکورد مقصد خودش نام مستعار فعال است؛ مقصد اصلی را انتخاب کنید', 409)
  if (incomingSourceAlias) throw new CanonicalAliasError('این رکورد مقصد یک هم‌نشانی فعال دیگر است؛ ابتدا زنجیرهٔ موجود را بازگردانید', 409)
  if (!pairCompatible(kind, source, target)) throw new CanonicalAliasError('هم‌نشانی فقط برای دو مورد منتشرشده با نوع و عنوان سازگار انجام می‌شود', 422)
  const blockers = kind === 'product' ? await productBlockers(db, source) : null
  const mediaEntitlements = kind === 'product' ? null : await mediaAccessBlockers(db, kind, source, target)
  const blockedBySales = kind === 'product' ? hasProductBlockers(blockers!) : hasMediaAccessBlockers(mediaEntitlements)
  return {
    kind, source: { id: source.id, title: source.title, slug: source.slug, path: pathFor(kind, source.slug), version: source.updatedAt.toISOString() },
    target: { id: target.id, title: target.title, slug: target.slug, path: pathFor(kind, target.slug), version: target.updatedAt.toISOString() },
    blockers, mediaEntitlements, canCanonicalize: !blockedBySales,
    retain: kind === 'product'
      ? ['شناسه، فاکتور و ردیف سفارش، قیمت و فروش گذشته، موجودی، کدها، تنوع‌ها، دیدگاه‌ها، فایل‌ها و روابط کالا با همان محصول می‌مانند.']
      : ['شناسه، تاریخچهٔ ویرایش، دنبال‌کردن و ارجاع‌های قبلی روی رکورد مبدأ می‌مانند؛ هیچ رابطه‌ای منتقل یا حذف نمی‌شود.'],
    effect: 'نشانی عمومی مبدأ به مقصد زنده می‌رود و مبدأ به سطل زبالهٔ همان بخش می‌رود؛ بازگردانی با همان نسخه‌ها ممکن است.',
  }
}

async function lockAliasWrites(tx: Tx) {
  await tx.$executeRaw(PrismaClient.sql`SELECT pg_advisory_xact_lock(hashtext('mobocom-content-canonical-alias'))`)
}

async function assertAliasReviewer(req: NextRequest, kind: CanonicalAliasKind, reviewer: { id: number }, tx: Tx) {
  const current = await requirePerm(req, OWNERS[kind].permission, tx)
  if (!current || current.id !== reviewer.id) throw new CanonicalAliasError('مجوز بازبینی تغییر کرده است؛ صفحه را تازه کنید', 403)
}

async function assertSlugPathFree(client: Client, kind: CanonicalAliasKind, path: string) {
  const prior = await client.contentCanonicalAlias.findFirst({ where: { sourcePath: path, active: true }, select: { id: true } })
  if (prior) throw new CanonicalAliasError('این نشانی به‌عنوان هم‌نشانی فعال رزرو شده است؛ ابتدا آن را برگردانید', 409)
}

/** Prevent the original alias slug from being reassigned to another record. Call inside the owner write transaction. */
export async function assertCanonicalSourceSlugAvailable(kind: CanonicalAliasKind, slug: string, sourceId: number, client: Client = db) {
  const path = pathFor(kind, slug)
  const active = await client.contentCanonicalAlias.findFirst({ where: { sourcePath: path, active: true }, select: { id: true } })
  if (active) throw new CanonicalAliasError('این نشانی هنوز به رکورد اصلی دیگری هم‌نشانی دارد', 409)
  const source = await aliasSource(client, kind, sourceId)
  if (source) throw new CanonicalAliasError('برای ویرایش نشانی این رکورد، ابتدا هم‌نشانی را برگردانید', 409)
}

async function currentEntityVersion(tx: Tx, kind: CanonicalAliasKind, id: number, expected: Date, shouldBeLive: boolean) {
  const row = await entity(tx, kind, id)
  if (!row || row.updatedAt.getTime() !== expected.getTime() || (shouldBeLive && !live(row))) throw new CanonicalAliasError('یکی از رکوردها هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409)
  return row
}

export async function createCanonicalAlias(input: { kind: CanonicalAliasKind; sourceId: number; targetId: number; sourceVersion: string; targetVersion: string; reviewer: { id: number; email: string } }, req: NextRequest) {
  const { kind, sourceId, targetId, reviewer } = input
  const before = await previewCanonicalAlias(kind, sourceId, targetId)
  if (!before.canCanonicalize) throw new CanonicalAliasError(kind === 'product' ? 'هم‌نشانی مسدود است تا موجودی، کدها، رزروها و سفارش‌های باز از مسیر عادی تعیین تکلیف شوند' : 'هم‌نشانی رسانه‌ای با پیشنهاد پرداخت یا سابقهٔ دسترسی خریداری‌شده انجام نمی‌شود', 409)
  const sourceExpected = new Date(input.sourceVersion), targetExpected = new Date(input.targetVersion)
  if (![sourceExpected, targetExpected].every(date => Number.isFinite(date.getTime()))) throw new CanonicalAliasError('پیش‌نمایش را دوباره دریافت کنید', 409)
  return db.$transaction(async tx => {
    await lockAliasWrites(tx)
    await assertAliasReviewer(req, kind, reviewer, tx)
    const [source, target] = await Promise.all([
      currentEntityVersion(tx, kind, sourceId, sourceExpected, true), currentEntityVersion(tx, kind, targetId, targetExpected, true),
    ])
    if (!pairCompatible(kind, source, target)) throw new CanonicalAliasError('رکوردها دیگر همسان نیستند؛ پیش‌نمایش را تازه کنید', 409)
    const chain = await aliasSource(tx, kind, targetId)
    if (chain) throw new CanonicalAliasError('زنجیرهٔ هم‌نشانی مجاز نیست؛ مقصد اصلی را انتخاب کنید', 409)
    const incoming = await aliasIncoming(tx, kind, sourceId)
    if (incoming) throw new CanonicalAliasError('مبدأ مقصد یک هم‌نشانی فعال دیگر است؛ ابتدا زنجیرهٔ موجود را بازگردانید', 409)
    if (kind === 'product') {
      const blockers = await productBlockers(tx, source)
      if (hasProductBlockers(blockers)) {
        throw new CanonicalAliasError('هم‌نشانی تا تعیین تکلیف موجودی، کدها، رزروهای فعال و سفارش‌های باز از مسیر عادی مسدود است', 409)
      }
    } else {
      const blockers = await mediaAccessBlockers(tx, kind, source, target)
      if (hasMediaAccessBlockers(blockers)) throw new CanonicalAliasError('هم‌نشانی رسانه‌ای با پیشنهاد پرداخت یا سابقهٔ دسترسی خریداری‌شده انجام نمی‌شود', 409)
    }
    const sourcePath = pathFor(kind, source.slug), targetPath = pathFor(kind, target.slug)
    await assertSlugPathFree(tx, kind, sourcePath)
    const changed = kind === 'product'
      ? await tx.product.updateMany({ where: { id: sourceId, active: true, updatedAt: sourceExpected }, data: { active: false } })
      : kind === 'cinema'
        ? await tx.cinemaTitle.updateMany({ where: { id: sourceId, status: 'PUBLISHED', updatedAt: sourceExpected }, data: trashData({ status: 'PUBLISHED' }, reviewer.id) })
        : kind === 'game'
          ? await tx.gameTitle.updateMany({ where: { id: sourceId, status: 'PUBLISHED', updatedAt: sourceExpected }, data: trashData({ status: 'PUBLISHED' }, reviewer.id) })
          : await tx.softwareTitle.updateMany({ where: { id: sourceId, status: 'PUBLISHED', updatedAt: sourceExpected }, data: trashData({ status: 'PUBLISHED' }, reviewer.id) })
    if (!changed.count) throw new CanonicalAliasError('مبدأ هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409)
    const archivedSource = await entity(tx, kind, sourceId)
    if (!archivedSource) throw new CanonicalAliasError('مبدأ پس از آرشیو پیدا نشد؛ تلاش کنید پیش‌نمایش را تازه کنید', 409)
    await upsertAlias(tx, { kind, sourceId, targetId, sourcePath, targetPath, sourceVersion: archivedSource.updatedAt, targetVersion: targetExpected, reviewerId: reviewer.id })
    await auditAdminStrict({ req, actor: reviewer, action: `${kind}.canonical-alias.create`, targetType: `${kind}-canonical-alias`, targetId: sourceId, metadata: { sourceId, targetId, sourcePath, targetPath, retainedHistory: true } }, tx)
    return { id: sourceId, targetId, sourcePath, targetPath }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

export async function undoCanonicalAlias(kind: CanonicalAliasKind, sourceId: number, sourceVersion: string, targetVersion: string, reviewer: { id: number; email: string }, req: NextRequest) {
  const expectedSource = new Date(sourceVersion), expectedTarget = new Date(targetVersion)
  if (![expectedSource, expectedTarget].every(date => Number.isFinite(date.getTime()))) throw new CanonicalAliasError('پیش‌نمایش را تازه کنید', 409)
  return db.$transaction(async tx => {
    await lockAliasWrites(tx)
    await assertAliasReviewer(req, kind, reviewer, tx)
    const alias = await aliasSource(tx, kind, sourceId)
    if (!alias) throw new CanonicalAliasError('هم‌نشانی فعال پیدا نشد', 404)
    const targetId = aliasTargetId(alias, kind)
    const [source, target] = await Promise.all([entity(tx, kind, sourceId), entity(tx, kind, targetId)])
    if (!source || !target || source.updatedAt.getTime() !== expectedSource.getTime() || target.updatedAt.getTime() !== expectedTarget.getTime()) throw new CanonicalAliasError('یکی از رکوردها هم‌زمان تغییر کرده است؛ پیش‌نمایش را تازه کنید', 409)
    if (source.updatedAt.getTime() !== alias.sourceVersion.getTime()) throw new CanonicalAliasError('مبدأ پس از ایجاد هم‌نشانی ویرایش شده است؛ ابتدا از مسیر اصلی محتوا بازبینی و منتشرش کنید', 409)
    const restore = { status: source.trashedStatus && source.trashedStatus !== TRASHED ? source.trashedStatus : 'DRAFT', trashedStatus: '', trashedAt: null, trashedById: null }
    const result = kind === 'product'
      ? await tx.product.updateMany({ where: { id: sourceId, active: false, updatedAt: expectedSource }, data: { active: true } })
      : kind === 'cinema'
        ? await tx.cinemaTitle.updateMany({ where: { id: sourceId, status: TRASHED, updatedAt: expectedSource }, data: restore })
        : kind === 'game'
          ? await tx.gameTitle.updateMany({ where: { id: sourceId, status: TRASHED, updatedAt: expectedSource }, data: restore })
          : await tx.softwareTitle.updateMany({ where: { id: sourceId, status: TRASHED, updatedAt: expectedSource }, data: restore })
    if (!result.count) throw new CanonicalAliasError('مبدأ دیگر در وضعیت قابل‌بازگردانی نیست', 409)
    const deactivated = await tx.contentCanonicalAlias.updateMany({ where: { id: alias.id, active: true, sourceVersion: alias.sourceVersion, targetVersion: alias.targetVersion }, data: { active: false, reviewedByUserId: reviewer.id, reviewedAt: new Date() } })
    if (!deactivated.count) throw new CanonicalAliasError('هم‌نشانی هم‌زمان تغییر کرده است', 409)
    await auditAdminStrict({ req, actor: reviewer, action: `${kind}.canonical-alias.undo`, targetType: `${kind}-canonical-alias`, targetId: sourceId, metadata: { sourceId, targetId, sourcePath: alias.sourcePath, targetPath: alias.targetPath, retainedHistory: true } }, tx)
    return { id: sourceId, restored: true }
  }, { isolationLevel: 'Serializable', timeout: 30_000 })
}

export async function resolveCanonicalAliasPath(kind: CanonicalAliasKind, path: string): Promise<string | null> {
  const alias = await aliasForPath(db, kind, path)
  if (!alias) return null
  const targetId = aliasTargetId(alias, kind)
  const target = await entity(db, kind, targetId)
  return target && live(target) ? pathFor(kind, target.slug) : null
}

export async function resolveCanonicalAliasSlug(kind: CanonicalAliasKind, slug: string) {
  return resolveCanonicalAliasPath(kind, pathFor(kind, slug))
}
