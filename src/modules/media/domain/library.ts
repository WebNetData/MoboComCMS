export const LIBRARY_KINDS = ['image', 'audio', 'video', 'document', 'archive', 'file'] as const
export type LibraryKind = typeof LIBRARY_KINDS[number]
export type LibraryAsset = { id: string; url: string; name: string; mime: string; kind: LibraryKind; bytes: string; width: number; height: number; alt: string; caption: string; tags: string[]; folderId: number | null; revision: number; archivedAt: string | null; editable: boolean }
export type LibraryFolder = { id: number; name: string; parentId: number | null; revision: number; editable: boolean }
export class LibraryError extends Error { constructor(message: string, readonly status = 400, readonly reason: ''|'invalid-media'|'unavailable' = '') { super(message) } }
export function libraryName(value: unknown) {
  const name = String(value ?? '').normalize('NFC').trim()
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new LibraryError('نام باید بین ۱ تا ۱۲۰ نویسه باشد')
  return name
}
export function libraryTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : String(value ?? '').split(/[,،]/)
  return [...new Set(tags.map(t => String(t).normalize('NFC').trim()).filter(Boolean))].slice(0, 30).map(t => t.slice(0, 60))
}
export const folderKey = (parentId: number | null, name: string) => `${parentId ?? 0}:${name.normalize('NFKC').toLocaleLowerCase()}`
export function folderId(value: unknown): number | null {
  if (value === null || value === '' || value === undefined) return null
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new LibraryError('پوشه نامعتبر است')
  return id
}
export function libraryKind(mime: string, name: string): LibraryKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive'
  if (/\.(pdf|txt|csv|docx?|xlsx?|pptx?|epub)$/i.test(name)) return 'document'
  return 'file'
}
export const transferUrl = (id: string) => `/api/media/transfers/${id}`
