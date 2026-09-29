import { db } from '@/platform/database/prisma'
import { logEvent } from '@/platform/observability/logger'
import { getSettings, readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { getDownloadSettings } from '@/modules/downloads/server/guard'
import { importImage, logImportFailure } from '@/modules/downloads/server/files'
import { findAssets, rewriteAssets } from '@/modules/downloads/domain/localize'
import { scrubHtml, type ScrubOptions } from '@/modules/downloads/domain/scrub'
import type { DownloadSettings } from '@/modules/downloads/domain/downloads'

/**
 * Removes the traces of the sites content was copied from, in saved content:
 * images on other hosts are copied to this server (covers, screenshots and
 * images inside text), source names are removed from text and titles, and
 * links to the sources are unwrapped. An admin runs it over everything; a
 * background job applies it to new and edited items every few minutes.
 */

type Row = Record<string, unknown> & { id: number }
type Delegate = {
  findMany(args: object): Promise<Row[]>
  count(args?: object): Promise<number>
  update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<unknown>
}
type Target = { model: string; label: string; text: string[]; images?: string[]; lists?: string[]; edited: boolean }

const TARGETS: Target[] = [
  { model: 'post', label: 'مجله', text: ['title', 'excerpt', 'excerptEn', 'content', 'contentEn'], images: ['cover'], edited: true },
  { model: 'musicArtist', label: 'هنرمندان', text: ['bio'], images: ['image', 'cover'], edited: true },
  { model: 'musicAlbum', label: 'آلبوم‌ها', text: ['title', 'description'], images: ['cover'], edited: true },
  { model: 'musicTrack', label: 'آهنگ‌ها', text: ['title', 'lyrics'], images: ['cover'], edited: true },
  { model: 'musicPlaylist', label: 'پلی‌لیست‌ها', text: ['description'], images: ['cover'], edited: true },
  { model: 'cinemaTitle', label: 'فیلم و سریال', text: ['summary', 'summaryEn'], images: ['poster', 'backdrop'], edited: true },
  { model: 'cinemaSeason', label: 'فصل‌ها', text: [], images: ['poster'], edited: false },
  { model: 'cinemaEpisode', label: 'قسمت‌ها', text: ['title', 'summary'], edited: false },
  { model: 'gameTitle', label: 'بازی‌ها', text: ['summary', 'content', 'seoDescription'], images: ['cover', 'backdrop'], lists: ['screenshots'], edited: true },
  { model: 'gameFranchise', label: 'مجموعه‌های بازی', text: ['description'], images: ['image'], edited: true },
  { model: 'gameUpdate', label: 'آپدیت بازی‌ها', text: ['title', 'notes'], edited: false },
  { model: 'softwareTitle', label: 'نرم‌افزارها', text: ['summary', 'content', 'changelog'], images: ['cover'], lists: ['screenshots'], edited: true },
  { model: 'mediaLink', label: 'عنوان لینک‌های دانلود', text: ['label'], edited: false },
]

const delegate = (model: string) => (db as unknown as Record<string, Delegate>)[model]
const select = (target: Target) => Object.fromEntries(['id', ...target.text, ...(target.images || []), ...(target.lists || [])].map((field) => [field, true]))

const STATE_KEY = 'downloads.scrub.state.v1'
type State = { since: string; lastIds: Record<string, number>; failed: Record<string, number> }
const RETRY_MS = 24 * 3600_000

async function readState(): Promise<State> {
  const raw = (await readJsonSetting(STATE_KEY)) || {}
  return {
    // First run starts now: older content is cleaned from the admin page ("clean all").
    since: typeof raw.since === 'string' ? raw.since : new Date().toISOString(),
    lastIds: raw.lastIds && typeof raw.lastIds === 'object' ? raw.lastIds as Record<string, number> : {},
    failed: raw.failed && typeof raw.failed === 'object' ? raw.failed as Record<string, number> : {},
  }
}

async function siteHost() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  for (const candidate of [settings.siteUrl, process.env.NEXTAUTH_URL]) {
    try { if (candidate) return new URL(candidate).hostname } catch { /* next */ }
  }
  return ''
}

const isRemote = (value: string, host: string) => {
  try {
    const url = new URL(value)
    const site = host.toLowerCase().replace(/^www\./, '')
    const h = url.hostname.toLowerCase()
    return (url.protocol === 'https:' || url.protocol === 'http:') && !(site && (h === site || h.endsWith(`.${site}`)))
  } catch { return false }
}

/** One run's image copier: each address is fetched once, failures are remembered for a day. */
function copier(state: State) {
  const done = new Map<string, string>()
  let copied = 0, failed = 0
  const copy = async (url: string): Promise<string | null> => {
    if (done.has(url)) return done.get(url) as string
    if (Date.now() - (state.failed[url] || 0) < RETRY_MS) return null
    try {
      const local = await importImage(url)
      done.set(url, local); copied++
      return local
    } catch (error) {
      state.failed[url] = Date.now(); failed++
      logImportFailure(url, error)
      return null
    }
  }
  return { copy, copied: () => copied, failed: () => failed }
}

type Plan = { options: ScrubOptions; settings: DownloadSettings; host: string }

async function plan(): Promise<Plan> {
  const settings = await getDownloadSettings()
  const host = await siteHost()
  return { settings, host, options: { words: settings.scrubWords, links: settings.scrubLinks, siteHost: host } }
}

const parseList = (value: unknown): unknown[] => { try { const list = JSON.parse(String(value || '[]')); return Array.isArray(list) ? list : [] } catch { return [] } }

/** Whether a row still needs work (no network: used for the preview count). */
function needsWork(row: Row, target: Target, p: Plan): boolean {
  for (const field of target.text) {
    const value = String(row[field] ?? '')
    if (!value) continue
    if (scrubHtml(value, p.options) !== value) return true
    if (p.settings.autoLocalize && findAssets(value, p.host).some((asset) => asset.kind === 'image' && !asset.url.startsWith('data:'))) return true
  }
  if (!p.settings.autoLocalize) return false
  if ((target.images || []).some((field) => isRemote(String(row[field] ?? ''), p.host))) return true
  return (target.lists || []).some((field) => parseList(row[field]).some((shot) => isRemote(typeof shot === 'string' ? shot : String((shot as { src?: unknown })?.src ?? ''), p.host)))
}

/** The cleaned field values for a row (only the changed ones). */
async function cleanRow(row: Row, target: Target, p: Plan, copy: (url: string) => Promise<string | null>): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {}
  for (const field of target.text) {
    const value = String(row[field] ?? '')
    if (!value) continue
    let next = value
    if (p.settings.autoLocalize) {
      const replacements = new Map<string, string>()
      for (const asset of findAssets(next, p.host)) {
        if (asset.kind !== 'image' || asset.url.startsWith('data:')) continue
        const local = await copy(asset.url)
        if (local) replacements.set(asset.url, local)
      }
      if (replacements.size) next = rewriteAssets(next, replacements)
    }
    next = scrubHtml(next, p.options)
    if (next !== value && (next.trim() || !['title', 'label'].includes(field))) data[field] = next
  }
  if (p.settings.autoLocalize) {
    for (const field of target.images || []) {
      const value = String(row[field] ?? '')
      if (!isRemote(value, p.host)) continue
      const local = await copy(value)
      if (local) data[field] = local
    }
    for (const field of target.lists || []) {
      const list = parseList(row[field])
      let changed = false
      const next = []
      for (const shot of list) {
        const src = typeof shot === 'string' ? shot : String((shot as { src?: unknown })?.src ?? '')
        const local = isRemote(src, p.host) ? await copy(src) : null
        if (local) changed = true
        next.push(local ? (typeof shot === 'string' ? local : { ...(shot as object), src: local }) : shot)
      }
      if (changed) data[field] = JSON.stringify(next)
    }
  }
  return data
}

export type ScrubReport = { sections: { label: string; pending: number; total: number }[]; pending: number; words: number }

/** How many items in each section still carry traces. */
export async function scrubPreview(): Promise<ScrubReport> {
  const p = await plan()
  const sections: ScrubReport['sections'] = []
  for (const target of TARGETS) {
    const table = delegate(target.model)
    if (!table) continue
    let pending = 0, total = 0, cursor = 0
    for (;;) {
      const rows = await table.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 500, select: select(target) }).catch(() => [])
      if (!rows.length) break
      total += rows.length
      pending += rows.filter((row) => needsWork(row, target, p)).length
      cursor = rows[rows.length - 1].id
    }
    sections.push({ label: target.label, pending, total })
  }
  return { sections, pending: sections.reduce((sum, row) => sum + row.pending, 0), words: p.options.words.length }
}

export type ScrubRun = { changed: number; imagesCopied: number; imagesFailed: number; scanned: number; done: boolean; cursor: string }

/**
 * Cleans everything, a slice at a time: `cursor` ("model:id") resumes where
 * the previous call stopped, so the admin page calls it until `done`.
 */
export async function scrubAll(cursorInput: unknown, budgetMs = 40_000): Promise<ScrubRun> {
  const started = Date.now()
  const p = await plan()
  const state = await readState()
  const { copy, copied, failed } = copier(state)
  const [startModel, startId] = String(cursorInput || '').split(':')
  let index = Math.max(0, TARGETS.findIndex((target) => target.model === startModel))
  let cursor = startModel && TARGETS[index]?.model === startModel ? Number(startId) || 0 : 0
  let changed = 0, scanned = 0
  while (index < TARGETS.length) {
    const target = TARGETS[index]
    const table = delegate(target.model)
    const rows = table ? await table.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 50, select: select(target) }).catch(() => []) : []
    if (!rows.length) { index++; cursor = 0; continue }
    for (const row of rows) {
      scanned++
      cursor = row.id
      if (!needsWork(row, target, p)) continue
      const data = await cleanRow(row, target, p, copy)
      if (Object.keys(data).length) { await table.update({ where: { id: row.id }, data }); changed++ }
      if (Date.now() - started > budgetMs) break
    }
    if (Date.now() - started > budgetMs) break
  }
  await writeJsonSetting(STATE_KEY, state)
  const done = index >= TARGETS.length
  return { changed, imagesCopied: copied(), imagesFailed: failed(), scanned, done, cursor: done ? '' : `${TARGETS[index].model}:${cursor}` }
}

/** Background job: new items (by id) and recently edited ones (by updatedAt) since the last run. */
export async function scrubRecent(): Promise<{ changed: number }> {
  const p = await plan()
  if (!p.options.words.length && !p.settings.autoLocalize && p.options.links === 'off') return { changed: 0 }
  const state = await readState()
  const since = new Date(state.since)
  const now = new Date()
  const { copy } = copier(state)
  let changed = 0
  for (const target of TARGETS) {
    const table = delegate(target.model)
    if (!table) continue
    // First run: start from the newest row, the admin page handles the backlog.
    if (state.lastIds[target.model] === undefined) {
      const last = await table.findMany({ orderBy: { id: 'desc' }, take: 1, select: { id: true } }).catch(() => [])
      state.lastIds[target.model] = last[0]?.id ?? 0
      if (!target.edited) continue
    }
    const where = target.edited
      ? { OR: [{ id: { gt: state.lastIds[target.model] } }, { updatedAt: { gt: since } }] }
      : { id: { gt: state.lastIds[target.model] } }
    const rows = await table.findMany({ where, orderBy: { id: 'asc' }, take: 100, select: select(target) }).catch(() => [])
    for (const row of rows) {
      state.lastIds[target.model] = Math.max(state.lastIds[target.model], row.id)
      if (!needsWork(row, target, p)) continue
      try {
        const data = await cleanRow(row, target, p, copy)
        if (Object.keys(data).length) { await table.update({ where: { id: row.id }, data }); changed++ }
      } catch (error) { logEvent('warn', 'downloads.scrub_failed', { model: target.model, id: row.id, error: String(error).slice(0, 200) }) }
    }
  }
  // Only remember failures for a day, so the list stays small.
  for (const [url, at] of Object.entries(state.failed)) if (Date.now() - at > RETRY_MS) delete state.failed[url]
  state.since = now.toISOString()
  await writeJsonSetting(STATE_KEY, state)
  return { changed }
}

