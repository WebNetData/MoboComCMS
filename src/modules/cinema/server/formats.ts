import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { CinemaFormatError, defaultFormat, parseFormatInput, structureOf, type CinemaFormat, type FormatStructure } from '@/modules/cinema/domain/formats'

type Tx = Prisma.TransactionClient
type Audit = (tx: Tx, id: number, action: 'created' | 'updated' | 'deleted', metadata: Record<string, unknown>) => Promise<unknown>
const ORDER: Prisma.CinemaFormatOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { id: 'asc' }]
const shape = (row: { structure: string } & Omit<CinemaFormat, 'structure'>): CinemaFormat => ({ ...row, structure: structureOf(row.structure) })

/** Every format with how many titles have it, for the admin list. */
export async function adminFormats() {
  const rows = await db.cinemaFormat.findMany({ orderBy: ORDER, include: { _count: { select: { titles: true } } } })
  return rows.map(({ _count, createdAt: _created, updatedAt: _updated, ...row }) => ({ ...shape(row), titles: _count.titles }))
}

/** Active formats in the owner's order, for the title form, the public filter and labels. */
export async function activeFormats(): Promise<CinemaFormat[]> {
  const rows = await db.cinemaFormat.findMany({ where: { active: true }, orderBy: ORDER, select: { id: true, slug: true, name: true, nameEn: true, plural: true, structure: true, icon: true, sortOrder: true, active: true } })
  return rows.map(shape)
}

export async function createFormat(input: Record<string, unknown>, audit: Audit) {
  const data = parseFormatInput(input, true) as Prisma.CinemaFormatCreateInput
  return db.$transaction(async (tx) => {
    if (await tx.cinemaFormat.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw new CinemaFormatError('نوعی با همین نشانی هست', 409)
    const row = await tx.cinemaFormat.create({ data })
    await audit(tx, row.id, 'created', { slug: row.slug, structure: row.structure })
    return row
  })
}

/** The structure of a format in use does not change: its titles' links or seasons would no longer match it. */
export async function updateFormat(id: number, input: Record<string, unknown>, audit: Audit) {
  const data = parseFormatInput(input, false)
  return db.$transaction(async (tx) => {
    const existing = await tx.cinemaFormat.findUnique({ where: { id }, include: { _count: { select: { titles: true } } } })
    if (!existing) throw new CinemaFormatError('این نوع پیدا نشد', 404)
    if (data.structure && data.structure !== existing.structure && existing._count.titles) throw new CinemaFormatError(`ساختار نوعی که ${existing._count.titles.toLocaleString('fa-IR')} عنوان دارد عوض نمی‌شود؛ یک نوع تازه بسازید و عنوان‌ها را به آن ببرید`, 409)
    const row = await tx.cinemaFormat.update({ where: { id }, data })
    await audit(tx, id, 'updated', { fields: Object.keys(data) })
    return row
  }, { isolationLevel: 'Serializable' })
}

/** A format is deleted only when no title has it, and never the last format of its structure. */
export async function deleteFormat(id: number, audit: Audit) {
  return db.$transaction(async (tx) => {
    const existing = await tx.cinemaFormat.findUnique({ where: { id }, include: { _count: { select: { titles: true } } } })
    if (!existing) throw new CinemaFormatError('این نوع پیدا نشد', 404)
    if (existing._count.titles) throw new CinemaFormatError(`${existing._count.titles.toLocaleString('fa-IR')} عنوان این نوع را دارند؛ اول آن‌ها را به نوع دیگری ببرید یا این نوع را غیرفعال کنید`, 409)
    if (await tx.cinemaFormat.count({ where: { structure: existing.structure, id: { not: id } } }) === 0) throw new CinemaFormatError('آخرین نوعِ این ساختار حذف نمی‌شود', 409)
    await tx.cinemaFormat.delete({ where: { id } })
    await audit(tx, id, 'deleted', { slug: existing.slug })
    return { id }
  }, { isolationLevel: 'Serializable' })
}

/**
 * The format and kind a title is saved with. A chosen format sets the kind; a kind alone (an import, IMDb data)
 * keeps the title's format when it already fits and otherwise takes the default format of that kind.
 */
export async function resolveTitleFormat(tx: Tx, body: Record<string, unknown>, existing: { formatId: number | null; kind: string } | null, parsedKind: string | undefined) {
  const formats = await tx.cinemaFormat.findMany({ select: { id: true, structure: true, sortOrder: true, active: true } })
  if (body.formatId !== undefined && body.formatId !== null && body.formatId !== '') {
    const id = Number(body.formatId)
    const chosen = formats.find((format) => format.id === id)
    if (!chosen) throw new CinemaFormatError('نوع انتخاب‌شده وجود ندارد')
    if (!chosen.active && chosen.id !== existing?.formatId) throw new CinemaFormatError('این نوع غیرفعال است؛ نوع دیگری انتخاب کنید')
    return { formatId: chosen.id, kind: structureOf(chosen.structure) }
  }
  const kind: FormatStructure = structureOf(parsedKind ?? existing?.kind)
  const current = formats.find((format) => format.id === existing?.formatId)
  if (current && current.structure === kind) return { formatId: current.id, kind }
  const fallback = defaultFormat(formats.map((format) => ({ ...format, structure: structureOf(format.structure) })), kind)
  return { formatId: fallback?.id ?? null, kind }
}
