/** Metadata captured with a transfer; retries never infer a different song from a URL. */
export type MusicFileMetadata = { artist: string; title: string; album: string; quality: string }
export type MusicFileSettings = { rename: boolean; tag: boolean; brand: string; url: string }
const text = (v: unknown) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : ''
export function musicFileMetadata(raw: unknown): MusicFileMetadata {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return { artist: text(r.artist), title: text(r.title), album: text(r.album), quality: /^(128|192|256|320|lossless)$/.test(String(r.quality)) ? String(r.quality) : '' }
}
export function musicFileName(source: string, meta: MusicFileMetadata, enabled: boolean): string | undefined {
  const ext = /\.(mp3|m4a|flac|ogg|opus|wav)$/i.exec(source)?.[1].toLowerCase()
  if (!enabled || !ext || !meta.artist || !meta.title) return undefined
  const part = (s: string) => s.normalize('NFC').replace(/[<>:"/\\|?*%#]/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 70).trim()
  const artist = part(meta.artist), title = part(meta.title)
  if (!artist || !title) return undefined
  return `${artist} - ${title}${meta.quality ? ' - '+meta.quality : ''}.${ext}`
}
export function musicTagUrl(raw: unknown): string {
  try { const u = new URL(String(raw)); return /^https?:$/.test(u.protocol) && !u.username && !u.password && u.toString().length <= 250 ? u.toString() : 'https://mobocom.net/' } catch { return 'https://mobocom.net/' }
}
