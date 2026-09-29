/**
 * Cleaning inside downloaded files: the tags and names a source site leaves in
 * the file itself (MP3 ID3 tags and cover art, the title of a video, shortcut
 * and "visit our site" files inside archives). Pure functions only; the
 * server side (server/clean.ts) downloads, cleans and caches the files.
 */

export type CleanKind = 'audio' | 'video' | 'archive'

const KINDS: Record<string, CleanKind> = {
  mp3: 'audio',
  mp4: 'video', m4v: 'video', mkv: 'video', webm: 'video', mov: 'video', avi: 'video',
  zip: 'archive', '7z': 'archive',
}

/** What kind of cleaning a file name gets (null: served as it is). */
export function cleanKindOf(name: string): CleanKind | null {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return KINDS[ext] ?? null
}

// ------------------------------------------------------------------ MP3 (ID3)

const syncsafe = (bytes: Uint8Array, at: number) => ((bytes[at] & 0x7f) << 21) | ((bytes[at + 1] & 0x7f) << 14) | ((bytes[at + 2] & 0x7f) << 7) | (bytes[at + 3] & 0x7f)

/**
 * Size of one ID3v2 tag starting at the beginning of `head` (header + body + footer),
 * or 0 when `head` does not start with a tag. Needs at least 10 bytes.
 */
export function id3v2Size(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0
  if (head[3] === 0xff || head[4] === 0xff || [6, 7, 8, 9].some((i) => head[i] >= 0x80)) return 0
  const footer = (head[5] & 0x10) !== 0
  return 10 + syncsafe(head, 6) + (footer ? 10 : 0)
}

/**
 * Bytes to cut from the end of an MP3: an ID3v1 tag ("TAG", 128 bytes, plus the
 * 227-byte enhanced "TAG+" block) and an APEv2 tag before it. `tail` is the last
 * bytes of the file (at least 128 + 227 + 32, fewer for small files).
 */
export function trailingTagSize(tail: Uint8Array): number {
  let cut = 0
  const at = (offset: number, text: string) => [...text].every((char, i) => tail[offset + i] === char.charCodeAt(0))
  if (tail.length >= 128 && at(tail.length - 128, 'TAG')) {
    cut = 128
    if (tail.length >= 128 + 227 && at(tail.length - 128 - 227, 'TAG+')) cut += 227
  }
  const end = tail.length - cut
  if (end >= 32 && at(end - 32, 'APETAGEX')) {
    const view = new DataView(tail.buffer, tail.byteOffset + end - 32, 32)
    const size = view.getUint32(12, true)
    const flags = view.getUint32(20, true)
    const header = (flags & 0x80000000) !== 0 ? 32 : 0
    if (size >= 32 && size + header <= end) cut += size + header
  }
  return cut
}

export type Mp3Tags = { title?: string; artist?: string; album?: string; comment?: string; url?: string }

function textFrame(id: string, text: string): Uint8Array {
  // UTF-16 with BOM (encoding 1): readable by every ID3v2.3 player, Persian included.
  const body = new Uint8Array(1 + 2 + text.length * 2)
  body[0] = 1; body[1] = 0xff; body[2] = 0xfe
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); body[3 + i * 2] = code & 0xff; body[4 + i * 2] = code >> 8 }
  return frame(id, body)
}

function frame(id: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + body.length)
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i)
  new DataView(out.buffer).setUint32(4, body.length)
  out.set(body, 10)
  return out
}

function commentFrame(text: string): Uint8Array {
  // encoding, language "fas", empty description (BOM + terminator), then the text.
  const head = [1, 0x66, 0x61, 0x73, 0xff, 0xfe, 0, 0, 0xff, 0xfe]
  const body = new Uint8Array(head.length + text.length * 2)
  body.set(head)
  for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); body[head.length + i * 2] = code & 0xff; body[head.length + 1 + i * 2] = code >> 8 }
  return frame('COMM', body)
}

function urlFrame(url: string): Uint8Array {
  return frame('WXXX', new Uint8Array([0, 0, ...[...url].map((char) => char.charCodeAt(0) & 0x7f)]))
}

function pictureFrame(jpeg: Uint8Array): Uint8Array {
  const mime = 'image/jpeg'
  const body = new Uint8Array(1 + mime.length + 1 + 1 + 1 + jpeg.length)
  let at = 0
  body[at++] = 0
  for (const char of mime) body[at++] = char.charCodeAt(0)
  body[at++] = 0
  body[at++] = 3 // front cover
  body[at++] = 0 // empty description
  body.set(jpeg, at)
  return frame('APIC', body)
}

/** A fresh ID3v2.3 tag with this site's details (and cover, as JPEG). */
export function buildId3(tags: Mp3Tags, cover?: Uint8Array | null): Uint8Array {
  const clean = (value?: string) => (value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 250)
  const frames: Uint8Array[] = []
  if (clean(tags.title)) frames.push(textFrame('TIT2', clean(tags.title)))
  if (clean(tags.artist)) frames.push(textFrame('TPE1', clean(tags.artist)))
  if (clean(tags.album)) frames.push(textFrame('TALB', clean(tags.album)))
  if (clean(tags.comment)) frames.push(commentFrame(clean(tags.comment)))
  if (/^https?:\/\/[\x21-\x7e]+$/.test(tags.url || '')) frames.push(urlFrame(tags.url as string))
  if (cover?.length) frames.push(pictureFrame(cover))
  const size = frames.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(10 + size)
  out.set([0x49, 0x44, 0x33, 3, 0, 0], 0)
  out[6] = (size >> 21) & 0x7f; out[7] = (size >> 14) & 0x7f; out[8] = (size >> 7) & 0x7f; out[9] = size & 0x7f
  let at = 10
  for (const item of frames) { out.set(item, at); at += item.length }
  return out
}

// ------------------------------------------------------------------ archives

/** Shortcut and web-page files a download site drops into archives ("Visit our site.url"). */
const SHORTCUTS = /\.(url|website|webloc|lnk|desktop|htm|html|mht|mhtml)$/i
const NOTES = /\.(txt|nfo|diz|rtf|md)$/i

/** Entries to delete from an archive: shortcuts always, text notes when they mention a listed source. */
export function archiveJunk(entries: { path: string; text?: string }[], words: readonly string[]): string[] {
  const needles = words.map((word) => word.toLowerCase()).flatMap((word) => (word.includes('.') ? [word, word.split('.')[0]].filter((w) => w.length >= 4) : [word]))
  return entries.filter((entry) => {
    const name = entry.path.split(/[\\/]/).pop() || ''
    if (SHORTCUTS.test(name)) return true
    if (!NOTES.test(name)) return false
    const haystack = `${name}\n${entry.text || ''}`.toLowerCase()
    return needles.some((needle) => haystack.includes(needle))
  }).map((entry) => entry.path)
}

/** Whether a note's text is worth reading to decide (small text files only). */
export const isNoteFile = (path: string) => NOTES.test(path)

// ------------------------------------------------------------------ video

/**
 * ffmpeg arguments that copy every stream unchanged but drop the file's own
 * metadata (title, comment, encoder notes, chapters) and the per-stream titles,
 * keeping the stream languages. The title becomes this site's.
 */
export function ffmpegArgs(input: string, output: string, meta: { title?: string; comment?: string }): string[] {
  const args = ['-hide_banner', '-v', 'error', '-y', '-ignore_unknown', '-i', input, '-map', '0', '-c', 'copy', '-map_metadata:g', '-1', '-map_chapters', '-1', '-metadata:s', 'title=', '-metadata:s', 'comment=', '-metadata:s', 'handler_name=']
  const clean = (value?: string) => (value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200)
  if (clean(meta.title)) args.push('-metadata', `title=${clean(meta.title)}`)
  if (clean(meta.comment)) args.push('-metadata', `comment=${clean(meta.comment)}`)
  if (/\.(mp4|m4v|mov)$/i.test(output)) args.push('-movflags', '+faststart')
  args.push(output)
  return args
}
