import { rangeAgents, readRemoteRange } from '@/modules/downloads/server/remote'
import { MAX_FOUND_PER_ORIGIN, cueCount, foundLabel, subtitleLanguage, trulyForced } from '@/modules/media/domain/found-subtitles'
import { ID, blockText, elements, readBlock, readCues, readHead, readTracks, subtitleFile, textCodec, type Line, type TextCodec, type Track } from '@/modules/media/domain/matroska'
import { subtitleText, type Found } from './sidecar'
import type { VideoSource } from './source'

/**
 * The subtitles inside a remote MKV read through its own index (Cues): the track list from its start, the index from
 * where the SeekHead says, then each subtitle line's block by itself — about 2 MB for a whole film instead of the film
 * (owner 2026-11-12: no film-sized traffic and no disk for subtitles). null when the file gives no such way (not
 * Matroska, no index, or text tracks the index does not point at); the caller then decides whether a whole read is allowed.
 */
const HEAD_BYTES = 256 * 1024
const MAX_INDEX_BYTES = 16 * 1024 * 1024
const MAX_LINES = 20_000
const FIRST_READ = 1024
const MAX_BLOCK = 64 * 1024
/** Lines whose blocks lie this close together are read in one request (a Persian and an English line of the same moment). */
const GROUP_GAP = 16 * 1024
const GROUP_SPAN = 64 * 1024
/**
 * Requests at once to the file's host. Kept low on purpose: storage hosts block an address that asks too much at once
 * (owner's Arvan host refused connections after a burst on 2026-11-12), and a film's lines are a few thousand requests.
 */
const CONNECTIONS = 4
const pause = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => { const t = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true }) })
/** The bytes this may read in all: index and lines, far below any film. */
const BUDGET_BYTES = 48 * 1024 * 1024

type Plan = { track: Track; format: TextCodec; lines: Line[] }
type Timed = { start: number; end: number; text: string }
type Item = { plan: Plan; line: Line; at: number; done: boolean; result: Timed | null }
/** Lines already read by earlier jobs of the same look, by line (track:time:cluster:relative). */
export type LineProgress = { load: () => Promise<Record<string, Timed | null> | null>; save: (lines: Record<string, Timed | null>) => Promise<void> }
export type IndexedResult = Found[] | null | { pending: { done: number; total: number } }
/** Time kept at the end of a job: no new request starts after it, so what was read is saved and handed on. */
const STOP_BEFORE_MS = 45_000
const itemKey = (line: Line) => `${line.track}:${line.time}:${line.cluster}:${line.relative}`

/**
 * With `progress`, a read the job's time cannot finish is saved and answered `pending`, and the next job continues from
 * the lines already read (each a few dozen bytes; nothing of the film is kept). `final` (the last job allowed) gives
 * what is whole instead.
 */
export async function indexedSubtitles(source: Extract<VideoSource, { kind: 'remote' }>, options: { deadline: number; progress?: LineProgress; final?: boolean; onTracks?: (tracks: Track[]) => void }, notes: string[]): Promise<IndexedResult> {
  const agents = rangeAgents(), controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, options.deadline - Date.now()))
  let spent = 0
  try {
    let url = source.sign(source.url)
    const read = async (from: number, to: number) => {
      if (spent + (to - from + 1) > BUDGET_BYTES) throw new Error('budget')
      // A host that is slow for a moment is asked again (twice); a host that does not serve ranges is the answer.
      for (let attempt = 0; ; attempt++) {
        try {
          const got = await readRemoteRange(url, from, to, { signal: controller.signal, agents, timeoutMs: 30_000 })
          spent += got.bytes.length
          return got
        } catch (error) {
          const message = String((error as Error)?.message)
          if (attempt >= 2 || controller.signal.aborted || /جدا نمی‌دهد/.test(message)) throw error
          // "Too many" or "busy": wait before asking again, longer each time.
          if (/\((429|503)\)/.test(message)) await pause(3000 * (attempt + 1), controller.signal)
        }
      }
    }
    const start = await read(0, HEAD_BYTES - 1)
    // The host's final address (after its redirects) serves every later range; a signed redirect is followed once.
    url = start.url
    const head = readHead(start.bytes)
    if (!head) return null
    const cuesAt = head.seek.get(ID.Cues)
    if (cuesAt === undefined) return null
    let tracks = head.tracks
    if (!tracks) {
      const at = head.seek.get(ID.Tracks)
      if (at === undefined) return null
      const top = await read(head.segmentStart + at, head.segmentStart + at + 15)
      const el = elements(top.bytes).next().value
      if (!el || el.id !== ID.Tracks || el.size > 4 * 1024 * 1024) return null
      tracks = readTracks((await read(head.segmentStart + at, head.segmentStart + at + el.header + el.size - 1)).bytes)
    }
    options.onTracks?.(tracks)
    const subtitles = tracks.filter(track => track.type === 0x11 || track.codec.startsWith('S_'))
    const text = subtitles.filter(track => { const format = textCodec(track.codec); return format && format !== 'image' && track.encoding !== 'unsupported' })
    const pictures = subtitles.filter(track => textCodec(track.codec) === 'image').length
    if (pictures) notes.push(`${pictures.toLocaleString('fa-IR')} زیرنویس تصویری (PGS/VobSub) داخل فایل است که مرورگر نمی‌تواند نشان دهد`)
    if (!text.length) return []
    const cuesTop = await read(head.segmentStart + cuesAt, head.segmentStart + cuesAt + 15)
    const cuesEl = elements(cuesTop.bytes).next().value
    if (!cuesEl || cuesEl.id !== ID.Cues || cuesEl.size > MAX_INDEX_BYTES) return null
    const index = (await read(head.segmentStart + cuesAt, head.segmentStart + cuesAt + cuesEl.header + cuesEl.size - 1)).bytes
    const lines = readCues(index, new Set(text.slice(0, MAX_FOUND_PER_ORIGIN).map(track => track.number)), MAX_LINES)
    // Persian first: when time or the host runs out part-way, what was read is the subtitle most viewers want.
    const persianFirst = (track: Track) => subtitleLanguage(track.language) === 'fa' ? 0 : 1
    const plans: Plan[] = text.slice(0, MAX_FOUND_PER_ORIGIN).map(track => ({ track, format: textCodec(track.codec) as TextCodec, lines: lines.filter(line => line.track === track.number) })).sort((a, b) => persianFirst(a.track) - persianFirst(b.track))
    // A text track the index does not point at would need the whole file; that is the caller's choice, not this one's.
    if (plans.some(plan => !plan.lines.length)) return null

    const ms = (value: number) => value * head.timestampScale / 1_000_000
    const clusterHeaders = new Map<number, number>()
    const headerOf = async (cluster: number) => {
      const known = clusterHeaders.get(cluster)
      if (known !== undefined) return known
      const top = await read(head.segmentStart + cluster, head.segmentStart + cluster + 15)
      const el = elements(top.bytes).next().value
      if (!el || el.id !== ID.Cluster) throw new Error('index')
      clusterHeaders.set(cluster, el.header)
      return el.header
    }
    // A cluster's header is almost always 12 bytes (mkvmerge); it is read only when that guess does not land on the block.
    const timed = (item: Item, block: NonNullable<ReturnType<typeof readBlock>>): Timed | null => {
      const words = blockText(block.payload, item.plan.track)
      const duration = item.line.duration ?? block.duration
      return words !== null && duration ? { start: ms(item.line.time), end: ms(item.line.time + duration), text: words } : null
    }
    const fetchLine = async (item: Item) => {
      for (const header of [clusterHeaders.get(item.line.cluster) ?? 12, null]) {
        const at = head.segmentStart + item.line.cluster + (header ?? await headerOf(item.line.cluster)) + item.line.relative
        let bytes = (await read(at, at + FIRST_READ - 1)).bytes
        let block = readBlock(bytes, item.plan.track)
        if (block && !block.complete && block.size <= MAX_BLOCK) { bytes = (await read(at, at + block.size - 1)).bytes; block = readBlock(bytes, item.plan.track) }
        if (block?.complete) {
          if (header !== null) clusterHeaders.set(item.line.cluster, header)
          return timed(item, block)
        }
      }
      throw new Error('index')
    }

    // Every line of every track, by where its block is (the usual 12-byte cluster header assumed); close ones together.
    const items: Item[] = plans.flatMap(plan => plan.lines.map(line => ({ plan, line, at: head.segmentStart + line.cluster + 12 + line.relative, done: false, result: null })))
    const earlier = options.progress ? await options.progress.load().catch(() => null) : null
    if (earlier) for (const item of items) { const key = itemKey(item.line); if (key in earlier) { item.done = true; item.result = earlier[key] } }
    const groups: Item[][] = []
    for (const item of items.filter(item => !item.done).sort((a, b) => a.at - b.at)) {
      const group = groups.at(-1)
      if (group && item.at - group[group.length - 1].at < GROUP_GAP && item.at - group[0].at < GROUP_SPAN) group.push(item)
      else groups.push([item])
    }
    // Persian lines first, so that a read the time or the host cuts short still gives the whole Persian subtitle.
    const rank = (group: Item[]) => group.some(item => persianFirst(item.plan.track) === 0) ? 0 : 1
    groups.sort((a, b) => rank(a) - rank(b) || a[0].at - b[0].at)
    const readGroup = async (group: Item[]) => {
      const from = group[0].at, bytes = (await read(from, group[group.length - 1].at + FIRST_READ - 1)).bytes
      for (const item of group) {
        const block = readBlock(bytes.subarray(item.at - from), item.plan.track)
        // Not there as a whole block (another cluster header size, a long line): asked for by itself.
        item.result = block?.complete ? timed(item, block) : await fetchLine(item)
        item.done = true
      }
    }
    const stopAt = options.deadline - STOP_BEFORE_MS
    let next = 0, failure: unknown = null
    const worker = async () => { while (!failure && next < groups.length && (!options.progress || Date.now() < stopAt)) { const group = groups[next++]; try { await readGroup(group) } catch (error) { failure = failure || error } } }
    await Promise.all(Array.from({ length: Math.min(CONNECTIONS, groups.length) }, worker))
    // Not finished in this job (its time, or a host that stopped answering for now): kept for the next one.
    const finalReason = String((failure as Error | null)?.message || '')
    const lasting = finalReason === 'index' || finalReason === 'budget' || /جدا نمی‌دهد/.test(finalReason)
    if (options.progress && !options.final && !lasting && items.some(item => !item.done)) {
      const kept: Record<string, Timed | null> = {}
      for (const item of items) if (item.done) kept[itemKey(item.line)] = item.result
      await options.progress.save(kept)
      return { pending: { done: items.filter(item => item.done).length, total: items.length } }
    }

    const found: Found[] = []
    const taken: { plan: Plan; content: string; cues: number }[] = []
    for (const plan of plans) {
      const mine = items.filter(item => item.plan === plan)
      // A track with a line not read is left out whole: a subtitle that stops part-way is not offered.
      if (mine.some(item => !item.done)) continue
      const file = subtitleFile(plan.format, mine.map(item => item.result).filter((line): line is Timed => !!line), plan.track.header)
      const content = subtitleText(Buffer.from(file), plan.format)
      if (content) taken.push({ plan, content, cues: cueCount(content, plan.format === 'ass' ? 'ass' : 'vtt') })
    }
    if (failure) {
      if (!taken.length) throw failure
      notes.push(`همهٔ زیرنویس‌های داخل فایل خوانده نشد (${taken.length.toLocaleString('fa-IR')} از ${plans.length.toLocaleString('fa-IR')})؛ با «بررسی دوباره» تکمیل می‌شود`)
    }
    const forced = trulyForced(taken.map(({ plan, cues }) => ({ forced: plan.track.forced, cues })))
    taken.forEach(({ plan, content }, at) => {
      const language = subtitleLanguage(plan.track.language)
      found.push({ origin: 'EMBEDDED', source: `stream:${plan.track.number}`, language, label: foundLabel({ language, title: plan.track.name, forced: forced[at], hearing: plan.track.hearing }), format: plan.format, content })
    })
    return found
  } catch (error) {
    const message = String((error as Error)?.message || '')
    if (message === 'index') { notes.push('فهرست داخل فایل با محتوای آن جور نبود؛ زیرنویس داخل فایل از این راه خوانده نشد'); return null }
    if (message === 'budget') { notes.push('خواندن زیرنویس‌ها از روی فهرست فایل بیش از حد مجاز داده می‌خواست'); return null }
    if (controller.signal.aborted) { notes.push('خواندن زیرنویس‌ها از روی فهرست فایل در زمان مجاز تمام نشد'); return null }
    notes.push(/جدا نمی‌دهد/.test(message) ? 'سرور فایل خواندن بخشی از فایل را پشتیبانی نمی‌کند؛ زیرنویس داخل فایل بدون دریافت کل فایل خوانده نمی‌شود' : 'فهرست زیرنویس‌های داخل فایل خوانده نشد')
    return null
  } finally { clearTimeout(timer); agents.destroy() }
}
