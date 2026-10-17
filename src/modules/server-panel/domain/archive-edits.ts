import { entrySegments, archiveRefusal } from './archive'
import { DownloadError } from './downloads'
export type ArchiveEdit = { op: 'delete'; path: string } | { op: 'rename'; path: string; to: string } | { op: 'asset'; path: string; assetId: string } | { op: 'text'; path: string; text: string }
export const EDIT_LIMITS = { maxEntries: 20000, maxTotalBytes: 2 * 1024 ** 3 }
export function archivePath(value: unknown): string {
  const raw = String(value ?? '')
  const parts = entrySegments(raw)
  if (!parts?.length || raw.length > 500 || parts.length > 20 || /[\u0000-\u001f\u007f:*?<>|]/.test(raw) || parts.some(p => p.startsWith('@') || p.startsWith('-')) || parts.join('/') !== raw) throw new DownloadError('مسیر داخل آرشیو نامعتبر است')
  return parts.join('/')
}
export function archiveEdits(value: unknown): ArchiveEdit[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 200) throw new DownloadError('حداکثر ۲۰۰ تغییر در هر نوبت مجاز است')
  let bytes = 0
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new DownloadError('تغییر آرشیو نامعتبر است')
    const path = archivePath(item.path)
    if (item.op === 'delete') return { op: 'delete', path }
    if (item.op === 'rename') return { op: 'rename', path, to: archivePath(item.to) }
    if (item.op === 'asset' && /^[a-f0-9-]{36}$/.test(String(item.assetId))) return { op: 'asset', path, assetId: String(item.assetId) }
    if (item.op === 'text' && typeof item.text === 'string') { bytes += Buffer.byteLength(item.text); if (bytes > 2 * 1024 ** 2) throw new DownloadError('متن تغییرات بیش از ۲ مگابایت است'); return { op: 'text', path, text: item.text } }
    throw new DownloadError('نوع تغییر آرشیو نامعتبر است')
  })
}
/** Full technical listing only; never approve a truncated tail or an archive link. */
export function inspectTechnicalListing(output: string) {
  const marker = output.indexOf('\n----------\n')
  if (marker < 0) throw new DownloadError('فهرست کامل آرشیو خوانده نشد')
  const seen = new Set<string>()
  const entries = output.slice(marker + 12).split(/\n\s*\n/).filter(block => /^Path = /m.test(block)).map(block => {
    const field = (name: string) => new RegExp(`^${name} = (.*)$`, 'm').exec(block)?.[1] || ''
    const dir = field('Folder') === '+' || /^D/.test(field('Attributes'))
    const name = field('Path').replace(/\/$/, '')
    const path = archivePath(name), key = path.normalize('NFC').toLowerCase()
    if (seen.has(key)) throw new DownloadError('آرشیو نام تکراری دارد')
    seen.add(key)
    if (field('Symbolic Link') || field('Hard Link') || /\b[lbcps][rwxstST-]{9}\b/.test(field('Attributes')) || /Link|Reparse/.test(field('Characteristics'))) throw new DownloadError('آرشیو دارای لینک یا فایل ویژه است')
    const size = dir ? 0 : Number(field('Size'))
    if (!dir && (!field('Size') || !Number.isSafeInteger(size) || size < 0)) throw new DownloadError('حجم ورودی آرشیو معتبر نیست')
    return { path, type: dir ? 'dir' as const : 'file' as const, size }
  })
  if (archiveRefusal(entries, EDIT_LIMITS)) throw new DownloadError('آرشیو از محدودیت امن تعداد، حجم یا مسیر خارج است')
  return entries
}
