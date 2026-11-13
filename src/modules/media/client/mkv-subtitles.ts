import { ID, blockText, cueText, elements, readBlock, readCues, readHead, readTracks, textCodec, type Line, type TextCodec, type Track } from '@/modules/media/domain/matroska'
import { foundLabel, languageCode, sortFound, trulyForced } from '@/modules/media/domain/found-subtitles'

/**
 * The text subtitles inside an MKV, read by the viewer's browser straight from the file's host (owner 2026-11-13: the
 * site's server spends no traffic on them; HexDL plays the same Arvan files with their subtitles this way). The host
 * must allow it (CORS and byte ranges, as Arvan storage does). The start of the file and its index (Cues) are read
 * once; then only the lines near where the film is playing, each as a small byte range (mkvmerge indexes every
 * subtitle line). A host that answers with the whole file is cut off at once: a film is never downloaded here.
 */

const HEAD_BYTES = 64 * 1024
const MAX_INDEX_BYTES = 16 * 1024 * 1024
const MAX_TRACKS_BYTES = 4 * 1024 * 1024
const FIRST_READ = 1024
const MAX_BLOCK = 64 * 1024
/** Lines whose blocks lie this close together are read in one request. */
const GROUP_GAP = 16 * 1024
const GROUP_SPAN = 64 * 1024
/** Requests at once to the file's host, beside the film itself. */
const CONNECTIONS = 3
/** Lines read ahead of the playing time, and behind it after a seek. */
const AHEAD_MS = 90_000
const BEHIND_MS = 3_000
/** A line whose index and block give no duration stays this long (or until the next line). */
const FALLBACK_MS = 3_000
/** After this many failed requests in a row the host is left alone. */
const MAX_FAILURES = 6

export type MkvCue = { start: number; end: number; text: string }
export type MkvSubtitleTrack = { number: number; language: string; label: string; format: TextCodec }

/** The host did not answer with the asked part (no ranges, a whole-file answer, refused). */
class HostRefused extends Error {}

/** Bytes `from`–`to` of the file; only a 206 answer of at most that size is taken. */
async function range(url: string, from: number, to: number, signal: AbortSignal): Promise<{ bytes: Uint8Array; url: string }> {
  const response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal, cache: 'no-store' })
  if (response.status !== 206) { void response.body?.cancel().catch(() => undefined); throw new HostRefused(String(response.status)) }
  const length = Number(response.headers.get('content-length') || 0)
  if (length > to - from + 1) { void response.body?.cancel().catch(() => undefined); throw new HostRefused('size') }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { bytes: bytes.length > to - from + 1 ? bytes.subarray(0, to - from + 1) : bytes, url: response.url || url }
}

/** zlib (ContentCompAlgo 0) undone with the browser's own DecompressionStream. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    const out = new Uint8Array(await new Response(stream).arrayBuffer())
    return out.length <= 64 * 1024 ? out : null
  } catch { return null }
}

type Plan = { track: Track; format: TextCodec; lines: Line[]; requested: Set<Line> }

export type MkvSubtitles = {
  tracks: MkvSubtitleTrack[]
  /** Reads (once) the lines of `track` between `ms` − 3 s and `ms` + 90 s and hands each to `add`. */
  ensure: (track: number, ms: number, add: (cue: MkvCue) => void) => Promise<void>
}

/** The text subtitle tracks of an MKV at `src` and a way to read their lines; null when it has none this way. */
export async function openMkvSubtitles(src: string, signal: AbortSignal): Promise<MkvSubtitles | null> {
  const start = await range(src, 0, HEAD_BYTES - 1, signal)
  // The host's final address (after its redirects) serves every later range; the site is not asked again.
  let url = start.url
  const head = readHead(start.bytes)
  if (!head) return null
  const cuesAt = head.seek.get(ID.Cues)
  if (cuesAt === undefined) return null
  const element = async (at: number, limit: number, id: number) => {
    const top = elements((await range(url, at, at + 15, signal)).bytes).next().value
    if (!top || top.id !== id || top.size > limit) return null
    return (await range(url, at, at + top.header + top.size - 1, signal)).bytes
  }
  let tracks = head.tracks
  if (!tracks) {
    const at = head.seek.get(ID.Tracks)
    const bytes = at === undefined ? null : await element(head.segmentStart + at, MAX_TRACKS_BYTES, ID.Tracks)
    if (!bytes) return null
    tracks = readTracks(bytes)
  }
  const text = tracks.filter(track => { const format = textCodec(track.codec); return format && format !== 'image' && track.encoding !== 'unsupported' })
  if (!text.length) return null
  const index = await element(head.segmentStart + cuesAt, MAX_INDEX_BYTES, ID.Cues)
  if (!index) return null
  const lines = readCues(index, new Set(text.map(track => track.number)))
  // A track the index does not point at would need the whole file: it is not offered.
  const plans = new Map<number, Plan>()
  for (const track of text) {
    const mine = lines.filter(line => line.track === track.number)
    if (mine.length) plans.set(track.number, { track, format: textCodec(track.codec) as TextCodec, lines: mine, requested: new Set() })
  }
  if (!plans.size) return null
  const ms = (value: number) => value * head.timestampScale / 1_000_000
  const forced = trulyForced([...plans.values()].map(plan => ({ forced: plan.track.forced, cues: plan.lines.length })))
  const offered = sortFound([...plans.values()].map((plan, at) => {
    // Any language the track names, not only the site's list (owner 2026-11-13).
    const language = languageCode(plan.track.language)
    return { id: plan.track.number, number: plan.track.number, language, label: foundLabel({ language, tag: plan.track.language, title: plan.track.name, forced: forced[at], hearing: plan.track.hearing }), format: plan.format }
  })).map(({ number, language, label, format }) => ({ number, language, label, format }))

  // Where a line's block is depends on its cluster's header size: 12 bytes from mkvmerge, other sizes from other
  // muxers. The first subtitle cluster's header is read once and taken for all; a cluster that differs is read itself.
  const clusterHeaders = new Map<number, number>()
  let usual = 12, failures = 0
  const read = async (from: number, to: number) => {
    try {
      const got = await range(url, from, to, signal)
      failures = 0
      return got.bytes
    } catch (error) {
      if (signal.aborted) throw error
      // An expired signed address: the film's own address is followed again once.
      if (!(error instanceof HostRefused) || error.message === '403') { const again = await range(src, from, to, signal); url = again.url; failures = 0; return again.bytes }
      throw error
    }
  }
  const cue = async (plan: Plan, line: Line, block: NonNullable<ReturnType<typeof readBlock>>): Promise<MkvCue | null> => {
    const unpacked = typeof plan.track.encoding === 'object' && plan.track.encoding?.kind === 'zlib' ? await inflate(block.payload) : null
    const raw = blockText(block.payload, plan.track, unpacked ? () => unpacked : undefined)
    if (raw === null) return null
    const words = cueText(plan.format, raw)
    if (!words) return null
    const next = plan.lines.find(other => other.time > line.time)
    const duration = line.duration ?? block.duration
    const end = duration ? ms(line.time + duration) : Math.min(ms(line.time) + FALLBACK_MS, next ? ms(next.time) : Infinity)
    return { start: ms(line.time) / 1000, end: end / 1000, text: words }
  }
  const lineAt = (line: Line, header: number) => head.segmentStart + line.cluster + header + line.relative
  const clusterHeader = async (cluster: number) => {
    const top = elements(await read(head.segmentStart + cluster, head.segmentStart + cluster + 15)).next().value
    return top && top.id === ID.Cluster ? top.header : null
  }
  /** A line read by itself at `at`, after its block was not whole there (a long line) or not there (another header). */
  const alone = async (plan: Plan, line: Line, at: number, partial: ReturnType<typeof readBlock>) => {
    if (!partial) {
      if (clusterHeaders.has(line.cluster)) return null
      const header = await clusterHeader(line.cluster)
      if (header === null) return null
      clusterHeaders.set(line.cluster, header)
      at = lineAt(line, header)
      partial = readBlock(await read(at, at + FIRST_READ - 1), plan.track)
    }
    if (partial && !partial.complete && partial.size <= MAX_BLOCK) partial = readBlock(await read(at, at + partial.size - 1), plan.track)
    return partial?.complete ? cue(plan, line, partial) : null
  }
  const first = [...plans.values()].map(plan => plan.lines[0]).sort((a, b) => a.cluster - b.cluster)[0]
  usual = await clusterHeader(first.cluster) ?? 12

  return {
    tracks: offered,
    async ensure(number, now, add) {
      const plan = plans.get(number)
      if (!plan || failures >= MAX_FAILURES || signal.aborted) return
      const wanted = plan.lines.filter(line => ms(line.time) >= now - BEHIND_MS && ms(line.time) <= now + AHEAD_MS && !plan.requested.has(line))
      if (!wanted.length) return
      for (const line of wanted) plan.requested.add(line)
      const placed = wanted.map(line => ({ line, at: lineAt(line, clusterHeaders.get(line.cluster) ?? usual) })).sort((a, b) => a.at - b.at)
      const groups: typeof placed[] = []
      for (const item of placed) {
        const group = groups.at(-1)
        if (group && item.at - group[group.length - 1].at < GROUP_GAP && item.at - group[0].at < GROUP_SPAN) group.push(item)
        else groups.push([item])
      }
      // The nearest lines first: what is about to be said is read before what comes in a minute.
      groups.sort((a, b) => a[0].line.time - b[0].line.time)
      let next = 0
      const worker = async () => {
        while (next < groups.length && failures < MAX_FAILURES && !signal.aborted) {
          const group = groups[next++]
          try {
            const from = group[0].at, bytes = await read(from, group[group.length - 1].at + FIRST_READ - 1)
            for (const { line, at } of group) {
              const block = readBlock(bytes.subarray(at - from), plan.track)
              const made = block?.complete ? await cue(plan, line, block) : await alone(plan, line, at, block)
              if (made) add(made)
            }
          } catch {
            if (signal.aborted) return
            failures++
            // Asked again when the film comes back to these lines.
            for (const { line } of group) plan.requested.delete(line)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONNECTIONS, groups.length) }, worker))
    },
  }
}
