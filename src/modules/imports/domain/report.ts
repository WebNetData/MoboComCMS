/**
 * Import reports and error exports. CSV cells that a spreadsheet would run as
 * a formula (=, +, -, @, tab, CR) are prefixed with a quote, so a crafted
 * value in an imported file cannot execute when the report is opened.
 */

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** Totals kept on the job while it runs ("created", "variantsCreated", "imagesDownloaded"…). */
export type Stats = Record<string, number>

export const addStats = (into: Stats, add: Record<string, number | undefined>) => {
  for (const [key, value] of Object.entries(add)) if (value) into[key] = (into[key] || 0) + value
  return into
}

/** Persian labels for the counters shown in the dry run, progress and report. */
export const STAT_LABELS: Record<string, string> = {
  total: 'کل رکوردها', processed: 'پردازش‌شده', valid: 'معتبر', warnings: 'دارای هشدار', invalid: 'نامعتبر',
  create: 'ساخته می‌شود', update: 'به‌روزرسانی می‌شود', skip: 'رد می‌شود', duplicates: 'تکراری در فایل',
  created: 'ساخته‌شده', updated: 'به‌روزرسانی‌شده', skipped: 'ردشده', failed: 'ناموفق',
  categoriesCreated: 'دستهٔ جدید', brandsCreated: 'برند جدید', groupsCreated: 'گروه ویژگی جدید', groupsLinked: 'اتصال گروه ویژگی به دسته',
  attributesCreated: 'ویژگی جدید', valuesCreated: 'مقدار ویژگی جدید',
  variantsCreated: 'تنوع جدید', variantsUpdated: 'تنوع به‌روزشده', variantsDisabled: 'تنوع غیرفعال‌شده', variantsDeleted: 'تنوع حذف‌شده',
  imagesQueued: 'تصویر برای دریافت', imagesDownloaded: 'تصویر دریافت‌شده', imagesReused: 'تصویر تکراری (استفادهٔ دوباره)', imagesFailed: 'تصویر ناموفق',
  artistsCreated: 'هنرمند جدید', albumsCreated: 'آلبوم جدید', seasonsCreated: 'فصل جدید', episodesCreated: 'قسمت جدید', episodesUpdated: 'قسمت به‌روزشده',
  termsCreated: 'دستهٔ جدید بخش', authorsMatched: 'نویسندهٔ شناسایی‌شده',
}
