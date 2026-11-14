export type MediaPublicationIssue = { key: string; label: string }

const text = (row: Record<string, unknown>, key: string) => String(row[key] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const count = (row: Record<string, unknown>, key: string) => {
  const value = row[key]
  if (typeof value === 'number') return value
  if (Array.isArray(value)) return value.length
  if (typeof value === 'string') { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : 0 } catch { return 0 } }
  return 0
}
const missing = (row: Record<string, unknown>, key: string, label: string) => text(row, key) ? [] : [{ key, label }]

/** Small blocking essentials shared by the editor review and the publishing owners. Optional quality signals stay advisory. */
export function mediaPublicationIssues(type: string, row: Record<string, unknown>, related: { links?: number; seasons?: number; episodes?: number; episodesWithoutLinks?: number; albumCover?: string } = {}): MediaPublicationIssue[] {
  const issues: MediaPublicationIssue[] = []
  if (type === 'cinema-titles') {
    issues.push(...missing(row, 'title', 'عنوان'))
    issues.push(...missing(row, 'poster', 'پوستر'))
    if (text(row, 'summary').length < 40) issues.push({ key: 'summary', label: 'خلاصهٔ داستان (حداقل ۴۰ نویسه)' })
    issues.push(...missing(row, 'genres', 'ژانر'))
    if (row.kind === 'SERIES') {
      if (!related.seasons || !related.episodes) issues.push({ key: 'seasons', label: 'فصل و قسمت' })
      else if (related.episodesWithoutLinks) issues.push({ key: 'episodeLinks', label: 'پیوند هر قسمت' })
    } else if (!related.links) issues.push({ key: 'links', label: 'پیوند تماشا یا دریافت' })
  } else if (type === 'games') {
    issues.push(...missing(row, 'title', 'عنوان'))
    issues.push(...missing(row, 'cover', 'جلد بازی'))
    issues.push(...missing(row, 'summary', 'معرفی کوتاه'))
    issues.push(...missing(row, 'platforms', 'پلتفرم'))
    const release = row.releaseDate ? new Date(String(row.releaseDate)) : null
    const upcoming = !!release && release.getTime() > Date.now()
    if (!upcoming && !related.links) issues.push({ key: 'links', label: 'پیوند دریافت بازی' })
    if (/(^|,)\s*(pc|windows|mac|linux)\s*(,|$)/i.test(text(row, 'platforms'))) {
      let hasMinimum = false
      try { const requirements = JSON.parse(String(row.requirements || '{}')) as { min?: Record<string, string> }; hasMinimum = Object.values(requirements.min || {}).some(Boolean) } catch { /* invalid stored JSON stays incomplete */ }
      if (!hasMinimum) issues.push({ key: 'requirements', label: 'حداقل سیستم موردنیاز برای PC' })
    }
  } else if (type === 'software') {
    issues.push(...missing(row, 'title', 'نام نرم‌افزار'))
    issues.push(...missing(row, 'icon', 'آیکن'))
    issues.push(...missing(row, 'version', 'نسخه'))
    if (text(row, 'summary').length < 30) issues.push({ key: 'summary', label: 'معرفی کوتاه (حداقل ۳۰ نویسه)' })
    if (text(row, 'content').length < 120) issues.push({ key: 'content', label: 'توضیحات کامل (حداقل ۱۲۰ نویسه)' })
    issues.push(...missing(row, 'platforms', 'پلتفرم'))
    issues.push(...missing(row, 'size', 'حجم فایل'))
    if (!related.links) issues.push({ key: 'links', label: 'پیوند دریافت نرم‌افزار' })
  } else if (type === 'music-tracks') {
    issues.push(...missing(row, 'title', 'عنوان قطعه'))
    issues.push(...missing(row, 'audioUrl', 'فایل صوتی'))
    if (!text(row, 'cover') && !String(related.albumCover || '').trim()) issues.push({ key: 'cover', label: 'تصویر جلد قطعه یا آلبوم' })
    if (!(Number(row.duration) > 0)) issues.push({ key: 'duration', label: 'مدت قطعه' })
    issues.push(...missing(row, 'genre', 'سبک موسیقی'))
  } else if (type === 'music-albums') {
    issues.push(...missing(row, 'title', 'عنوان آلبوم'))
    issues.push(...missing(row, 'cover', 'جلد آلبوم'))
    if (!(Number(row.artistId) > 0)) issues.push({ key: 'artistId', label: 'هنرمند' })
  } else if (type === 'music-playlists') {
    issues.push(...missing(row, 'title', 'عنوان فهرست'))
    issues.push(...missing(row, 'cover', 'جلد فهرست'))
    if (!count(row, 'trackIds')) issues.push({ key: 'trackIds', label: 'قطعهٔ منتشرشده' })
  }
  return issues
}
