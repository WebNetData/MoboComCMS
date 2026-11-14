import { db } from '@/platform/database/prisma'
import { formatMoney, normalizeCurrency } from '@/shared/money'
import { COMPARABLE, COMPARE_MAX, ITEM_LABEL, itemKey, type ItemRef, type ItemType } from '@/modules/content/domain/items'
import { itemCards } from '@/modules/content/server/registry'
import { dimensionSummariesFor, ratingsFor } from '@/modules/reviews/server/reviews'
import { dimensionsFor } from '@/modules/reviews/domain/dimensions'
import { formatRuntime, licenseLabel, parseJsonObject, splitList, type Requirements } from '@/modules/media/domain/media'
import { listLabels } from '@/modules/vocabulary/server/vocabulary'
import { attributeFieldsForCategory, parseJson } from '@/modules/catalog/server/product-config'
import { deliversInstantly } from '@/modules/store/domain/digital-codes'
import { isModuleEnabled } from '@/extensions/server/modules'
import { publicProductWhere } from '@/modules/catalog/domain/product-publication'

/**
 * Side-by-side comparison of up to four items of one type. Each row is a label
 * plus one display value per item; numeric rows name the direction in which a
 * value is better so the table can mark the best cell.
 */
export type CompareRow = { label: string; values: string[]; better?: 'high' | 'low'; numbers?: (number | null)[]; group?: string }
export type Comparison = {
  type: ItemType
  label: string
  items: { key: string; title: string; subtitle: string; url: string; image: string; access: string }[]
  rows: CompareRow[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')
const date = (d: Date | null | undefined) => (d ? d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }) : '')
const yes = (value: boolean) => (value ? '✓ دارد' : '—')
const REQ: [keyof Requirements['min'], string][] = [['os', 'سیستم‌عامل'], ['cpu', 'پردازنده'], ['gpu', 'کارت گرافیک'], ['ram', 'حافظه'], ['storage', 'فضای خالی']]

function row(label: string, values: (string | number | null | undefined)[], extra: Partial<CompareRow> = {}): CompareRow {
  return { label, values: values.map((value) => (value === null || value === undefined || value === '' ? '—' : typeof value === 'number' ? fa(value) : value)), ...extra }
}
function numeric(label: string, values: (number | null | undefined)[], better: 'high' | 'low', format: (n: number) => string = fa, group?: string): CompareRow {
  return { label, values: values.map((value) => (value === null || value === undefined ? '—' : format(value))), numbers: values.map((value) => value ?? null), better, group }
}

/** Keeps the requested order and drops unknown or mixed-type references. */
export function parseCompareRefs(raw: unknown): ItemRef[] {
  const refs: ItemRef[] = []
  for (const part of String(raw || '').split(',').slice(0, COMPARE_MAX)) {
    const [type, id] = part.split(':')
    const n = Number(id)
    if (!COMPARABLE.includes(type as ItemType) || !Number.isSafeInteger(n) || n <= 0) continue
    if (refs.length && refs[0].type !== type) continue
    if (!refs.some((ref) => ref.id === n)) refs.push({ type: type as ItemType, id: n })
  }
  return refs
}

export async function compareItems(refs: ItemRef[]): Promise<Comparison | null> {
  if (!refs.length) return null
  const type = refs[0].type
  const vipOn = await isModuleEnabled('membership')
  const cards = await itemCards(refs)
  const present = refs.filter((ref) => cards.has(itemKey(ref)))
  if (!present.length) return null
  const ids = present.map((ref) => ref.id)
  const ratings = await ratingsFor(present)
  const rating = (id: number) => ratings.get(`${type}:${id}`)
  const ratingRows = [
    numeric('امتیاز کاربران (از ۵)', ids.map((id) => rating(id)?.average ?? null), 'high', (n) => `${n.toLocaleString('fa-IR', { minimumFractionDigits: 1 })} از ۵`),
    row('تعداد امتیاز', ids.map((id) => rating(id)?.count || 0)),
    numeric('علاقه‌مندی', ids.map((id) => rating(id)?.favorites || 0), 'high'),
  ]
  // Members' specialist scores per dimension, in the type's order; a dimension nobody scored on any compared item is left out with the other empty rows.
  const summaries = await dimensionSummariesFor(present)
  const summary = (id: number) => summaries.get(`${type}:${id}`)
  const DIMENSION_GROUP = 'امتیاز تخصصی کاربران (از ۵)'
  const dimensionRows: CompareRow[] = [
    ...dimensionsFor(type).map((dimension) => numeric(dimension.label, ids.map((id) => summary(id)?.dimensions.find((entry) => entry.key === dimension.key)?.average ?? null), 'high', (n) => n.toLocaleString('fa-IR', { minimumFractionDigits: 1 }), DIMENSION_GROUP)),
    ...(ids.some((id) => summary(id)?.verifiedCount) ? [{ ...row('امتیازدهندگان با تجربهٔ تأییدشده', ids.map((id) => summary(id)?.verifiedCount || 0)), group: DIMENSION_GROUP }] : []),
  ]
  const rows: CompareRow[] = []

  if (type === 'software') {
    const map = new Map((await db.softwareTitle.findMany({ where: { id: { in: ids } } })).map((r) => [r.id, r]))
    const s = ids.map((id) => map.get(id))
    const licenses = (await listLabels('software')).LICENSE ?? {}
    rows.push(
      row('نسخه', s.map((r) => r?.version)), row('سازنده', s.map((r) => r?.developer)), row('مجوز', s.map((r) => (r ? licenses[r.license] || licenseLabel(r.license, true) : ''))),
      row('سیستم‌عامل', s.map((r) => splitList(r?.platforms).join('، '))), row('دسته', s.map((r) => r?.category)), row('حجم', s.map((r) => r?.size)),
      row('انتشار نسخه', s.map((r) => date(r?.releasedAt))), row('آخرین به‌روزرسانی', s.map((r) => date(r?.updatedAt))),
      numeric('دانلود', s.map((r) => r?.downloads ?? null), 'high'), numeric('بازدید', s.map((r) => r?.views ?? null), 'high'),
      ...ratingRows,
      row('پیش‌نیازها', s.map((r) => r?.requirements)),
      row('دسترسی', s.map((r) => (vipOn && r?.access === 'MEMBERS' ? '♛ ویژهٔ VIP' : 'رایگان برای همه'))),
      ...dimensionRows,
    )
  } else if (type === 'game') {
    const map = new Map((await db.gameTitle.findMany({ where: { id: { in: ids } } })).map((r) => [r.id, r]))
    const g = ids.map((id) => map.get(id))
    const req = g.map((r) => parseJsonObject<Requirements>(r?.requirements, { min: {}, rec: {} }))
    rows.push(
      row('پلتفرم', g.map((r) => splitList(r?.platforms).join('، '))), row('ژانر', g.map((r) => splitList(r?.genres).join('، '))),
      row('سازنده', g.map((r) => r?.developer)), row('ناشر', g.map((r) => r?.publisher)), row('تاریخ انتشار', g.map((r) => date(r?.releaseDate))),
      numeric('نمرهٔ منتقدان (از ۱۰۰)', g.map((r) => r?.score ?? null), 'high'),
      numeric('نمرهٔ کاربران (از ۱۰)', g.map((r) => r?.userScore ?? null), 'high', (n) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })),
      row('ردهٔ سنی', g.map((r) => r?.ageRating)), numeric('بازدید', g.map((r) => r?.views ?? null), 'high'),
      ...ratingRows,
      ...REQ.map(([key, label]) => ({ ...row(`${label} (حداقل)`, req.map((r) => r.min?.[key])), group: 'سیستم مورد نیاز' })),
      ...REQ.map(([key, label]) => ({ ...row(`${label} (پیشنهادی)`, req.map((r) => r.rec?.[key])), group: 'سیستم مورد نیاز' })),
      ...dimensionRows,
    )
  } else if (type === 'title') {
    const map = new Map((await db.cinemaTitle.findMany({ where: { id: { in: ids } }, include: { seasons: { select: { _count: { select: { episodes: true } } } } } })).map((r) => [r.id, r]))
    const t = ids.map((id) => map.get(id))
    rows.push(
      row('نوع', t.map((r) => (r?.kind === 'SERIES' ? 'سریال' : 'فیلم'))), row('سال', t.map((r) => (r?.year ? `${r.year}${r.endYear ? `–${r.endYear}` : ''}` : ''))),
      numeric('امتیاز IMDb', t.map((r) => r?.imdbRating ?? null), 'high', (n) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })),
      row('مدت', t.map((r) => (r?.runtime ? formatRuntime(r.runtime, true) : ''))),
      row('فصل / قسمت', t.map((r) => (r?.kind === 'SERIES' ? `${fa(r.seasons.length)} فصل · ${fa(r.seasons.reduce((sum, season) => sum + season._count.episodes, 0))} قسمت` : ''))),
      row('ژانر', t.map((r) => splitList(r?.genres).join('، '))), row('کارگردان', t.map((r) => r?.director)), row('کشور', t.map((r) => splitList(r?.countries).join('، '))),
      row('زبان', t.map((r) => splitList(r?.languages).join('، '))), row('کیفیت', t.map((r) => r?.quality)), row('دوبلهٔ فارسی', t.map((r) => yes(!!r?.dubbed))), row('زیرنویس فارسی', t.map((r) => yes(!!r?.subtitle))),
      row('ردهٔ سنی', t.map((r) => r?.ageRating)), numeric('بازدید', t.map((r) => r?.views ?? null), 'high'),
      ...ratingRows,
      ...dimensionRows,
    )
  } else if (type === 'product') {
    const products = await db.product.findMany({ where: { id: { in: ids }, ...publicProductWhere }, include: { category: { select: { name: true } }, variants: { where: { active: true }, select: { priceMinor: true } } } })
    const map = new Map(products.map((r) => [r.id, r]))
    const p = ids.map((id) => map.get(id))
    const reviews = await db.productReview.groupBy({ by: ['productId'], where: { productId: { in: ids }, status: 'APPROVED' }, _avg: { rating: true }, _count: true })
    const reviewOf = (id: number) => reviews.find((r) => r.productId === id)
    const priceMinor = (r: (typeof products)[number] | undefined) => (r ? (r.variants.length ? r.variants.reduce((min, v) => (v.priceMinor < min ? v.priceMinor : min), r.variants[0].priceMinor) : r.priceMinor) : null)
    const sameCurrency = new Set(p.map((r) => r?.currency)).size === 1
    rows.push(
      {
        label: 'قیمت', better: sameCurrency ? 'low' : undefined,
        values: p.map((r) => { const minor = priceMinor(r); return r && minor !== null ? `${r.variants.length > 1 ? 'از ' : ''}${formatMoney(minor, normalizeCurrency(r.currency), 'fa-IR')}` : '—' }),
        numbers: sameCurrency ? p.map((r) => { const minor = priceMinor(r); return minor === null ? null : Number(minor) }) : undefined,
      },
      row('قیمت ویژهٔ VIP', p.map((r) => (r && r.memberPriceMinor > 0n ? formatMoney(r.memberPriceMinor, normalizeCurrency(r.currency), 'fa-IR') : ''))),
      row('موجودی', p.map((r) => (!r ? '' : r.kind !== 'PHYSICAL' ? (deliversInstantly(r) ? 'تحویل آنی' : r.digitalMode === 'CODES' ? 'ناموجود' : 'تحویل دیجیتال') : r.stock > 0 ? `${fa(r.stock)} عدد` : 'ناموجود'))),
      row('نوع', p.map((r) => (r?.kind === 'PHYSICAL' ? 'کالای فیزیکی' : r ? 'محصول دیجیتال' : ''))), row('دسته', p.map((r) => r?.category?.name)),
      row('وضعیت کالا', p.map(r => r?.kind === 'PHYSICAL' ? ({ NEW: 'نو', OPEN_BOX: 'جعبه‌باز', USED: 'کارکرده', REFURBISHED: 'بازسازی‌شده' } as Record<string, string>)[r.condition] || '' : ''), { group: 'وضعیت و ضمانت' }),
      row('درجهٔ ظاهری', p.map(r => r?.kind === 'PHYSICAL' && r.condition !== 'NEW' ? r.conditionGrade : ''), { group: 'وضعیت و ضمانت' }),
      row('وضعیت ظاهری', p.map(r => r?.kind === 'PHYSICAL' && r.condition !== 'NEW' ? r.conditionNotes : ''), { group: 'وضعیت و ضمانت' }),
      row('گزارش سلامت', p.map(r => r?.kind === 'PHYSICAL' && r.condition !== 'NEW' ? r.healthReport : ''), { group: 'وضعیت و ضمانت' }),
      row('ضمانت', p.map(r => r?.warranty), { group: 'وضعیت و ضمانت' }),
      numeric('امتیاز خریداران (از ۵)', ids.map((id) => { const avg = reviewOf(id)?._avg.rating; return avg == null ? null : Math.round(avg * 10) / 10 }), 'high', (n) => `${n.toLocaleString('fa-IR', { minimumFractionDigits: 1 })} از ۵`),
      row('تعداد نظر', ids.map((id) => reviewOf(id)?._count || 0)),
      numeric('علاقه‌مندی', ids.map((id) => rating(id)?.favorites || 0), 'high'),
    )
    // Specification rows: union of the attribute fields of every compared category.
    const fields = new Map<string, string>()
    for (const product of p) if (product) for (const field of await attributeFieldsForCategory(product.categoryId).catch(() => [])) if (!fields.has(field.key)) fields.set(field.key, field.label)
    const specs = p.map((r) => parseJson<Record<string, string>>(r?.specifications, {}))
    for (const [key, label] of fields) rows.push({ ...row(label, specs.map((spec) => spec[key])), group: 'مشخصات' })
  }

  return {
    type, label: ITEM_LABEL[type].many,
    items: present.flatMap((ref) => { const card = cards.get(itemKey(ref)); return card ? [{ key: itemKey(ref), title: card.title, subtitle: card.subtitle, url: card.url, image: card.image, access: card.access }] : [] }),
    rows: rows.filter((r) => r.values.some((value) => value !== '—')),
  }
}

/** Index of the best cell of a numeric row, or -1 when there is no single winner. */
export function bestIndex(r: CompareRow): number {
  if (!r.better || !r.numbers) return -1
  const values = r.numbers.map((n, i) => [n, i] as const).filter((entry): entry is readonly [number, number] => entry[0] !== null)
  if (values.length < 2) return -1
  const best = r.better === 'high' ? Math.max(...values.map(([n]) => n)) : Math.min(...values.map(([n]) => n))
  const winners = values.filter(([n]) => n === best)
  return winners.length === 1 ? winners[0][1] : -1
}
