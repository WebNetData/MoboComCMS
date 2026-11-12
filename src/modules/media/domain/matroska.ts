import { inflateSync } from 'node:zlib'

/**
 * Just enough Matroska (MKV/WebM) to find a file's subtitle lines through its own index, without reading the file:
 * the track list near its start and the Cues, which for each text subtitle line give its time, its duration and
 * where its block is (mkvmerge writes them for every subtitle line). Owner 2026-11-12: a film's subtitles must not
 * cost the server the film's traffic or disk; both owner files (1.7 GB and 13.7 GB) are read in about 2 MB this way.
 * Everything here works on bytes already fetched and is bounded; nothing is trusted beyond what it checks.
 */

export const ID = {
  EBML: 0x1A45DFA3, DocType: 0x4282, Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
  Info: 0x1549A966, TimestampScale: 0x2AD7B1, Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackType: 0x83, CodecID: 0x86,
  CodecPrivate: 0x63A2, Language: 0x22B59C, LanguageBCP47: 0x22B59D, Name: 0x536E, FlagForced: 0x55AA, FlagHearingImpaired: 0x55AB,
  ContentEncodings: 0x6D80, ContentEncoding: 0x6240, ContentEncodingScope: 0x5032, ContentEncodingType: 0x5033, ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254, ContentCompSettings: 0x4255, ContentEncryption: 0x5035,
  Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7, CueClusterPosition: 0xF1,
  CueRelativePosition: 0xF0, CueDuration: 0xB2, Cluster: 0x1F43B675, BlockGroup: 0xA0, Block: 0xA1, BlockDuration: 0x9B, SimpleBlock: 0xA3,
} as const

export type Element = { id: number; at: number; start: number; size: number; header: number }

/** An EBML variable-length number at `at`: an element ID keeps its marker bit, a size does not. */
export function vint(buf: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = buf[at]
  if (first === undefined || first === 0) return null
  let length = 1, mask = 0x80
  while (!(first & mask)) { length++; mask >>= 1 }
  if (length > 8 || at + length > buf.length) return null
  let value = keepMarker ? first : first & (mask - 1)
  for (let i = 1; i < length; i++) value = value * 256 + buf[at + i]
  return { value, length, unknown: !keepMarker && value === 2 ** (7 * length) - 1 }
}

/** The elements between `from` and `to`. One of unknown size (a live stream's Segment) is the last given, with size Infinity. */
export function* elements(buf: Uint8Array, from = 0, to = buf.length): Generator<Element> {
  let at = from
  while (at < to) {
    const id = vint(buf, at, true)
    const size = id && vint(buf, at + id.length, false)
    if (!id || !size) return
    const start = at + id.length + size.length
    yield { id: id.value, at, start, size: size.unknown ? Infinity : size.value, header: id.length + size.length }
    if (size.unknown) return
    at = start + size.value
  }
}

const end = (buf: Uint8Array, el: Element) => Math.min(buf.length, el.start + el.size)
const uint = (buf: Uint8Array, el: Element) => { let v = 0; for (let i = 0; i < Math.min(el.size, 8); i++) v = v * 256 + buf[el.start + i]; return v }
const text = (buf: Uint8Array, el: Element) => Buffer.from(buf.subarray(el.start, end(buf, el))).toString('utf8').replace(/\u0000+$/, '')
const children = (buf: Uint8Array, el: Element) => elements(buf, el.start, end(buf, el))

export type TextCodec = 'srt' | 'ass' | 'vtt'
export type Track = {
  number: number; type: number; codec: string; language: string; name: string; forced: boolean; hearing: boolean
  /** ASS header (styles) for ASS tracks. */
  header: string
  /** How each block's bytes were stored: null = as they are; zlib or a stripped header to put back; 'unsupported' = encrypted or unknown. */
  encoding: null | { kind: 'zlib' } | { kind: 'prefix'; bytes: Uint8Array } | 'unsupported'
}

/** Which subtitle format a track's codec is as text, or 'image' for picture subtitles a browser cannot show. */
export function textCodec(codec: string): TextCodec | 'image' | '' {
  if (codec === 'S_TEXT/UTF8' || codec === 'S_TEXT/ASCII') return 'srt'
  if (codec === 'S_TEXT/ASS' || codec === 'S_TEXT/SSA' || codec === 'S_ASS' || codec === 'S_SSA') return 'ass'
  if (codec === 'S_TEXT/WEBVTT') return 'vtt'
  if (codec === 'S_HDMV/PGS' || codec === 'S_VOBSUB' || codec === 'S_DVBSUB' || codec === 'S_HDMV/TEXTST') return 'image'
  return ''
}

function readTrack(buf: Uint8Array, entry: Element): Track {
  const track: Track = { number: 0, type: 0, codec: '', language: '', name: '', forced: false, hearing: false, header: '', encoding: null }
  let bcp47 = ''
  for (const f of children(buf, entry)) {
    if (f.id === ID.TrackNumber) track.number = uint(buf, f)
    else if (f.id === ID.TrackType) track.type = uint(buf, f)
    else if (f.id === ID.CodecID) track.codec = text(buf, f)
    else if (f.id === ID.Language) track.language = text(buf, f)
    else if (f.id === ID.LanguageBCP47) bcp47 = text(buf, f)
    else if (f.id === ID.Name) track.name = text(buf, f).slice(0, 120)
    else if (f.id === ID.FlagForced) track.forced = uint(buf, f) === 1
    else if (f.id === ID.FlagHearingImpaired) track.hearing = uint(buf, f) === 1
    else if (f.id === ID.CodecPrivate) track.header = text(buf, f).slice(0, 256 * 1024)
    else if (f.id === ID.ContentEncodings) {
      for (const encoding of children(buf, f)) {
        if (encoding.id !== ID.ContentEncoding) continue
        let scope = 1, type = 0, algo = 0, settings: Uint8Array = new Uint8Array(0), compressed = false
        for (const g of children(buf, encoding)) {
          if (g.id === ID.ContentEncodingScope) scope = uint(buf, g)
          if (g.id === ID.ContentEncodingType) type = uint(buf, g)
          if (g.id === ID.ContentEncryption) type = 1
          if (g.id === ID.ContentCompression) {
            compressed = true
            for (const h of children(buf, g)) { if (h.id === ID.ContentCompAlgo) algo = uint(buf, h); if (h.id === ID.ContentCompSettings) settings = buf.slice(h.start, end(buf, h)) }
          }
        }
        // Only the blocks' own content matters here; encryption, or more than one layer, is not read.
        if (!(scope & 1)) continue
        if (type !== 0 || !compressed || track.encoding) { track.encoding = 'unsupported'; continue }
        track.encoding = algo === 0 ? { kind: 'zlib' } : algo === 3 ? { kind: 'prefix', bytes: settings } : 'unsupported'
      }
    }
  }
  if (bcp47) track.language = bcp47
  return track
}

export type Head = { docType: string; segmentStart: number; seek: Map<number, number>; timestampScale: number; tracks: Track[] | null }

/**
 * The start of a file: its kind, where its Segment begins, the SeekHead (where Cues, Tracks and Info are) and, when they
 * lie within these bytes, its timestamp scale and tracks. null when this is not Matroska.
 */
export function readHead(buf: Uint8Array): Head | null {
  let docType = '', head: Head | null = null
  for (const top of elements(buf)) {
    if (top.id === ID.EBML) { for (const f of children(buf, top)) if (f.id === ID.DocType) docType = text(buf, f); continue }
    if (top.id !== ID.Segment) continue
    if (docType !== 'matroska' && docType !== 'webm') return null
    head = { docType, segmentStart: top.start, seek: new Map(), timestampScale: 1_000_000, tracks: null }
    for (const el of elements(buf, top.start, end(buf, top))) {
      if (el.id === ID.SeekHead) for (const seek of children(buf, el)) {
        if (seek.id !== ID.Seek) continue
        let id = 0, position = -1
        for (const f of children(buf, seek)) { if (f.id === ID.SeekID) id = uint(buf, f); if (f.id === ID.SeekPosition) position = uint(buf, f) }
        if (id && position >= 0 && !head.seek.has(id)) head.seek.set(id, position)
      }
      if (el.id === ID.Info && el.start + el.size <= buf.length) for (const f of children(buf, el)) if (f.id === ID.TimestampScale) head.timestampScale = uint(buf, f) || 1_000_000
      if (el.id === ID.Tracks && el.start + el.size <= buf.length) head.tracks = readTracks(buf, el)
      if (el.id === ID.Cluster || el.id === ID.Cues) break
    }
    break
  }
  return head
}

export function readTracks(buf: Uint8Array, tracks: Element = elements(buf).next().value as Element): Track[] {
  if (!tracks || tracks.id !== ID.Tracks) return []
  return [...children(buf, tracks)].filter(el => el.id === ID.TrackEntry).map(el => readTrack(buf, el)).slice(0, 128)
}

export type Line = { track: number; time: number; duration: number | null; cluster: number; relative: number }

/** The index's entries for these tracks, in time order: when and where each block is. Entries without a block position are left out. */
export function readCues(buf: Uint8Array, tracks: Set<number>, limit = 50_000): Line[] {
  const cues = elements(buf).next().value as Element | undefined
  if (!cues || cues.id !== ID.Cues) return []
  const lines: Line[] = []
  for (const point of children(buf, cues)) {
    if (point.id !== ID.CuePoint) continue
    let time = -1
    for (const f of children(buf, point)) {
      if (f.id === ID.CueTime) time = uint(buf, f)
      if (f.id !== ID.CueTrackPositions) continue
      let track = 0, cluster = -1, relative = -1, duration: number | null = null
      for (const g of children(buf, f)) {
        if (g.id === ID.CueTrack) track = uint(buf, g)
        if (g.id === ID.CueClusterPosition) cluster = uint(buf, g)
        if (g.id === ID.CueRelativePosition) relative = uint(buf, g)
        if (g.id === ID.CueDuration) duration = uint(buf, g)
      }
      if (tracks.has(track) && time >= 0 && cluster >= 0 && relative >= 0) lines.push({ track, time, duration, cluster, relative })
      if (lines.length >= limit) return lines
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

/**
 * The text of one subtitle block read at its position: the BlockGroup (or SimpleBlock) must start exactly there and be
 * of this track. Its duration from BlockDuration when the index had none. null when these bytes are not that block.
 */
export function readBlock(buf: Uint8Array, track: Track): { payload: Uint8Array; duration: number | null; complete: boolean; size: number } | null {
  const first = elements(buf).next().value as Element | undefined
  if (!first || (first.id !== ID.BlockGroup && first.id !== ID.SimpleBlock) || !Number.isFinite(first.size)) return null
  const size = first.header + first.size
  if (size > buf.length) return { payload: new Uint8Array(0), duration: null, complete: false, size }
  let block: Element | null = first.id === ID.SimpleBlock ? first : null, duration: number | null = null
  if (first.id === ID.BlockGroup) for (const f of children(buf, first)) { if (f.id === ID.Block) block = f; if (f.id === ID.BlockDuration) duration = uint(buf, f) }
  if (!block) return null
  const number = vint(buf, block.start, false)
  if (!number || number.value !== track.number) return null
  const flags = buf[block.start + number.length + 2]
  // Lacing puts several frames in one block; subtitles are not laced, and a laced block is not guessed at.
  if (flags === undefined || flags & 0x06) return null
  return { payload: buf.subarray(block.start + number.length + 3, end(buf, block)), duration, complete: true, size }
}

/** A block's bytes as they were before muxing (zlib or a stripped header), or null when they cannot be. */
export function blockText(payload: Uint8Array, track: Track): string | null {
  let bytes: Uint8Array = payload
  if (track.encoding === 'unsupported') return null
  if (track.encoding?.kind === 'zlib') { try { bytes = inflateSync(payload, { maxOutputLength: 64 * 1024 }) } catch { return null } }
  if (track.encoding?.kind === 'prefix') bytes = Buffer.concat([track.encoding.bytes, payload])
  return new TextDecoder('utf-8').decode(bytes).replace(/\u0000+$/, '')
}

const clock = (ms: number, separator: ',' | '.') => {
  const t = Math.max(0, Math.round(ms)), h = Math.floor(t / 3_600_000), m = Math.floor(t / 60_000) % 60, s = Math.floor(t / 1000) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${separator}${String(t % 1000).padStart(3, '0')}`
}
const assClock = (ms: number) => { const t = Math.max(0, Math.round(ms / 10)); return `${Math.floor(t / 360_000)}:${String(Math.floor(t / 6000) % 60).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}` }

export type TimedText = { start: number; end: number; text: string }
/**
 * The lines of one track as a subtitle file of its own format: SubRip for S_TEXT/UTF8, WebVTT for S_TEXT/WEBVTT, and
 * for ASS the track's own header with each block turned back into a Dialogue line (blocks hold
 * "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text").
 */
export function subtitleFile(format: TextCodec, lines: TimedText[], header = ''): string {
  const timed = lines.filter(line => line.text.trim() && line.end > line.start)
  if (format === 'srt') return timed.map((line, i) => `${i + 1}\n${clock(line.start, ',')} --> ${clock(line.end, ',')}\n${line.text.replace(/\r\n?/g, '\n').trim()}\n`).join('\n')
  if (format === 'vtt') return `WEBVTT\n\n${timed.map(line => `${clock(line.start, '.')} --> ${clock(line.end, '.')}\n${line.text.replace(/\r\n?/g, '\n').trim()}\n`).join('\n')}`
  const ordered = timed.map(line => { const parts = line.text.split(','); return { order: Number(parts[0]) || 0, line, parts } }).sort((a, b) => a.line.start - b.line.start || a.order - b.order)
  const dialogue = ordered.filter(({ parts }) => parts.length >= 9).map(({ line, parts }) => `Dialogue: ${parts[1]},${assClock(line.start)},${assClock(line.end)},${parts.slice(2).join(',')}`)
  let top = header.replace(/\r\n?/g, '\n').trimEnd()
  if (!/^\[Events\]/im.test(top)) top += '\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  return `${top}\n${dialogue.join('\n')}\n`
}
