import dns from 'node:dns/promises'
import fs from 'node:fs/promises'
import { constants, createWriteStream } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { db } from '@/platform/database/prisma'
import { archiveEdits, type ArchiveEdit } from '@/modules/server-panel/domain/archive-edits'
import { archiveStamp, materializeArchive, applyArchiveEdits, readArchivedText } from './downloads/archive-content'
import { assertArchiveAuthority, type ArchiveAuthority } from './downloads/archive-authority'
import { changeDownloadSettings, type DownloadSettingsContext } from './downloads/settings'
import { env } from '@/platform/config/env'
import { logEvent } from '@/platform/observability/logger'
import { decryptPanelCredential, encryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { looksText } from '@/modules/server-panel/domain/policy'
import {
  DownloadError, JOB_LABEL, LOCAL_ID, archiveFormat, baseName, cleanName, downloadName, isPrivateAddress, joinRel, normalizeBaseUrl, normalizeRelPath,
  numberedName, parentRel, parse7zList, parseFetchList, parseUnrarList, publicUrl, validArchivePassword, validateFetchUrl, validateStorage, withFormat, wrongPassword,
  type ArchiveEntry, type ArchiveFormat, type JobKind, type Storage,
} from '@/modules/server-panel/domain/downloads'
import { ftpDriver, localDriver, sftpDriver, type Driver } from '@/modules/server-panel/server/storage-drivers'

// Download center: this server's download folder plus SFTP/FTP download hosts,
// a background downloader for remote URLs and archive tools (7z / rar).

const KEY = 'server-panel.downloads.v1'
type Settings = { localBaseUrl: string; storages: Storage[] }

async function loadSettings(): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: KEY } }).catch(() => null)
  try {
    const raw = row ? JSON.parse(row.value) : {}
    const storages = (Array.isArray(raw.storages) ? raw.storages : []).map((item: Record<string, unknown>) => {
      try { return { ...validateStorage(item, [String(item.id)]), secret: String(item.secret || '') } } catch { return null }
    }).filter(Boolean) as Storage[]
    return { localBaseUrl: normalizeBaseUrl(raw.localBaseUrl), storages }
  } catch { return { localBaseUrl: '', storages: [] } }
}

/** This server's download folder (DOWNLOADS_ROOT; storage/downloads in development). */
export function localRoot() {
  return path.resolve(env('DOWNLOADS_ROOT') || path.join(process.cwd(), 'storage', 'downloads'))
}
const incoming = () => path.join(localRoot(), '.incoming')

function localStorage(settings: Settings): Storage {
  return { id: LOCAL_ID, kind: 'local', name: 'پوشهٔ دانلود همین سرور', baseUrl: settings.localBaseUrl, host: '', port: 0, username: '', secret: '', auth: 'password', secure: false, root: localRoot() }
}

async function storageById(id: unknown): Promise<{ storage: Storage; settings: Settings }> {
  const settings = await loadSettings()
  const key = String(id || LOCAL_ID)
  const storage = key === LOCAL_ID ? localStorage(settings) : settings.storages.find((item) => item.id === key)
  if (!storage) throw new DownloadError('فضای ذخیره پیدا نشد', 404)
  return { storage, settings }
}

async function connect(storage: Storage): Promise<Driver> {
  if (storage.kind === 'local') { await fs.mkdir(storage.root, { recursive: true }).catch(() => undefined); return localDriver(storage.root) }
  let secret = ''
  try { secret = storage.secret ? decryptPanelCredential(storage.secret) : '' } catch { throw new DownloadError('رمز این فضا خوانده نشد؛ دوباره ذخیره‌اش کنید', 409) }
  return storage.kind === 'sftp' ? sftpDriver(storage, secret) : ftpDriver(storage, secret)
}

async function withDriver<T>(storageId: unknown, fn: (driver: Driver, storage: Storage) => Promise<T>): Promise<T> {
  const { storage } = await storageById(storageId)
  const driver = await connect(storage)
  try { return await fn(driver, storage) } finally { await driver.close() }
}

const rel = (input: unknown) => { const value = normalizeRelPath(input); if (value === null) throw new DownloadError('مسیر نامعتبر است'); return value }

// ------------------------------------------------------------------ tools

let toolCache: { at: number; tools: Record<'sevenZip' | 'rar' | 'unrar', string> } | null = null
async function findTool(names: string[]) {
  for (const dir of (process.env.PATH || '/usr/bin:/bin').split(path.delimiter)) {
    for (const name of names.flatMap(n => process.platform === 'win32' ? [n + '.exe', n] : [n])) if (await fs.access(path.join(dir, name), constants.X_OK).then(() => true, () => false)) return path.join(dir, name)
  }
  return ''
}
export async function archiveTools() {
  if (toolCache && Date.now() - toolCache.at < 60_000) return toolCache.tools
  const tools = { sevenZip: await findTool(['7zz', '7z', '7za']), rar: await findTool(['rar']), unrar: await findTool(['unrar']) }
  toolCache = { at: Date.now(), tools }
  return tools
}

type RunResult = { ok: boolean; out: string; code: number | null; truncated?: boolean }
/** Runs a tool without a shell; progress gets the last "NN%" the tool printed. */
function run(file: string, args: string[], options: { cwd?: string; timeout?: number; signal?: AbortSignal; progress?: (percent: number) => void } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' }, signal: options.signal })
    let out = '', truncated = false
    const collect = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      if (out.length + text.length > 4 * 1024 * 1024) { truncated = true; child.kill('SIGKILL'); return }
      out += text
      const match = text.match(/(\d{1,3})%/g)
      if (match && options.progress) options.progress(Math.min(100, Number(match[match.length - 1].replace('%', ''))))
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeout ?? 6 * 60 * 60_000)
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, out: `${out}\n${error.message}`, code: null }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0 && !truncated, out, code, truncated }) })
  })
}

// ------------------------------------------------------------------ overview + storages

const publicStorage = (storage: Storage) => ({ id: storage.id, kind: storage.kind, name: storage.name, baseUrl: storage.baseUrl, host: storage.host, port: storage.port, username: storage.username, auth: storage.auth, secure: storage.secure, root: storage.kind === 'local' ? storage.root : storage.root, hasSecret: !!storage.secret })

export async function downloadsOverview() {
  const settings = await loadSettings()
  const root = localRoot()
  await fs.mkdir(root, { recursive: true }).catch(() => undefined)
  const disk = await fs.statfs(root).catch(() => null)
  return {
    storages: [localStorage(settings), ...settings.storages].map(publicStorage),
    local: { root, baseUrl: settings.localBaseUrl, free: disk ? disk.bavail * disk.bsize : null, size: disk ? disk.blocks * disk.bsize : null, writable: await fs.access(root, constants.W_OK).then(() => true, () => false) },
    tools: await archiveTools(),
  }
}

export async function saveStorage(input: Record<string, unknown>, context?: DownloadSettingsContext) {
  const settings = await loadSettings()
  const storage = validateStorage(input, settings.storages.map((item) => item.id))
  const previous = settings.storages.find((item) => item.id === storage.id)
  const secretInput = String(input.secret ?? '')
  if (secretInput.length > 20_000) throw new DownloadError('رمز یا کلید بیش از حد طولانی است')
  const secret = secretInput ? encryptPanelCredential(secretInput) : previous?.secret || ''
  if (!secret) throw new DownloadError(storage.auth === 'key' ? 'کلید خصوصی SSH را وارد کنید' : 'رمز عبور را وارد کنید')
  const next: Storage = { ...storage, secret }
  if (input.test !== false) { const driver = await connect(next); try { await driver.list('/') } finally { await driver.close() } }
  await changeDownloadSettings(current => { const rows = current.storages || []; const fresh = rows.find((item: Storage) => item.id === next.id); return { ...current, storages: [...rows.filter((item: Storage) => item.id !== next.id), { ...next, secret: secretInput ? secret : fresh?.secret || secret }] } }, context ? { ...context, action: 'server.downloads_storage_save', targetType: 'download-storage', targetId: next.id, metadata: { kind: next.kind, host: next.host, secretChanged: !!secretInput } } : undefined)
  return publicStorage(next)
}

export async function removeStorage(id: unknown, context?: DownloadSettingsContext) {
  const settings = await loadSettings()
  if (!settings.storages.some((item) => item.id === id)) throw new DownloadError('فضای ذخیره پیدا نشد', 404)
  await changeDownloadSettings(current => ({ ...current, storages: (current.storages || []).filter((item: Storage) => item.id !== id) }), context ? { ...context, action: 'server.downloads_storage_delete', targetType: 'download-storage', targetId: String(id) } : undefined)
}

export async function testStorage(id: unknown) {
  return withDriver(id, async (driver) => ({ entries: (await driver.list('/')).length }))
}

export async function setLocalBaseUrl(input: unknown, context?: DownloadSettingsContext) {
  const url = normalizeBaseUrl(input)
  if (String(input ?? '').trim() && !url) throw new DownloadError('نشانی عمومی معتبر نیست (مثل https://dl.mobocom.net)')
  await changeDownloadSettings(current => ({ ...current, localBaseUrl: url }), context ? { ...context, action: 'server.downloads_base_url', targetType: 'download-storage', targetId: 'local' } : undefined)
  return { baseUrl: url }
}

// ------------------------------------------------------------------ files

export async function listFiles(storageId: unknown, dirInput: unknown) {
  const dir = rel(dirInput || '/')
  return withDriver(storageId, async (driver, storage) => {
    const entries = (await driver.list(dir)).map((entry) => ({ ...entry, url: entry.type === 'file' ? publicUrl(storage.baseUrl, entry.path) : '', archive: entry.type === 'file' ? archiveFormat(entry.name) : null }))
    entries.sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, 'en', { numeric: true }))
    return { storage: storage.id, dir, parent: dir === '/' ? null : parentRel(dir), entries }
  })
}

export async function makeDir(storageId: unknown, dirInput: unknown, nameInput: unknown) {
  const name = cleanName(nameInput)
  if (!name) throw new DownloadError('نام پوشه معتبر نیست')
  const target = joinRel(rel(dirInput), name)
  await withDriver(storageId, (driver) => driver.mkdir(target))
  return { path: target }
}

export async function renamePath(storageId: unknown, pathInput: unknown, nameInput: unknown) {
  const from = rel(pathInput)
  const name = cleanName(nameInput)
  if (from === '/' || !name) throw new DownloadError('نام تازه معتبر نیست')
  const to = joinRel(parentRel(from), name)
  if (to !== from) await withDriver(storageId, (driver) => driver.rename(from, to))
  return { path: to }
}

export async function movePaths(storageId: unknown, pathsInput: unknown, destInput: unknown) {
  const dest = rel(destInput)
  const paths = (Array.isArray(pathsInput) ? pathsInput : []).slice(0, 200).map(rel)
  if (!paths.length) throw new DownloadError('چیزی انتخاب نشده است')
  return withDriver(storageId, async (driver) => {
    await driver.mkdir(dest).catch(() => undefined)
    for (const from of paths) {
      if (from === '/' || dest === from || dest.startsWith(`${from}/`)) throw new DownloadError('نمی‌توان پوشه را به داخل خودش برد')
      await driver.rename(from, joinRel(dest, baseName(from)))
    }
    return { moved: paths.length }
  })
}

export async function deletePaths(storageId: unknown, pathsInput: unknown) {
  const paths = (Array.isArray(pathsInput) ? pathsInput : []).slice(0, 200).map(rel)
  if (!paths.length || paths.includes('/')) throw new DownloadError('چیزی برای حذف انتخاب نشده است')
  return withDriver(storageId, async (driver) => {
    for (const target of paths) { const info = await driver.stat(target); await driver.remove(target, info?.type === 'dir') }
    return { removed: paths.length }
  })
}

const EDIT_LIMIT = 2 * 1024 * 1024
const tempFile = async (label: string) => { await fs.mkdir(incoming(), { recursive: true }); return path.join(incoming(), `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) }

export async function readTextFile(storageId: unknown, pathInput: unknown) {
  const target = rel(pathInput)
  return withDriver(storageId, async (driver) => {
    const info = await driver.stat(target)
    if (!info || info.type === 'dir') throw new DownloadError('فایل پیدا نشد', 404)
    if (info.size > EDIT_LIMIT) throw new DownloadError('این فایل برای ویرایشگر بزرگ است (بیش از ۲ مگابایت)', 413)
    const temp = await tempFile('edit')
    try {
      await driver.download(target, temp)
      const buffer = await fs.readFile(temp)
      if (!looksText(baseName(target), new Uint8Array(buffer.subarray(0, 8192)))) throw new DownloadError('فایل متنی نیست و در ویرایشگر باز نمی‌شود', 415)
      return { path: target, content: buffer.toString('utf8'), etag: `${info.size}-${info.mtime}` }
    } finally { await fs.rm(temp, { force: true }) }
  })
}

export async function writeTextFile(storageId: unknown, pathInput: unknown, content: unknown, etag: unknown) {
  const target = rel(pathInput)
  if (typeof content !== 'string' || Buffer.byteLength(content) > EDIT_LIMIT) throw new DownloadError('محتوا نامعتبر یا بیش از ۲ مگابایت است', 413)
  return withDriver(storageId, async (driver) => {
    const info = await driver.stat(target)
    if (etag && info && `${info.size}-${info.mtime}` !== etag) throw new DownloadError('این فایل در این فاصله تغییر کرده است؛ دوباره باز کنید', 409)
    const temp = await tempFile('edit')
    try { await fs.writeFile(temp, content, 'utf8'); await driver.upload(temp, target) } finally { await fs.rm(temp, { force: true }) }
    const next = await driver.stat(target)
    return { path: target, etag: next ? `${next.size}-${next.mtime}` : '' }
  })
}

/** Browser upload: the multipart body is already on disk (temp files). */
export async function storeUploads(storageId: unknown, dirInput: unknown, files: { temp: string; name: string }[]) {
  const dir = rel(dirInput)
  return withDriver(storageId, async (driver) => {
    const saved: string[] = []
    for (const file of files) {
      const name = cleanName(file.name)
      if (!name) throw new DownloadError(`نام فایل «${file.name}» معتبر نیست`)
      const target = await freeName(driver, dir, name)
      await driver.upload(file.temp, target)
      saved.push(target)
    }
    return { saved }
  })
}

export async function openStoredFile(storageId: unknown, pathInput: unknown) {
  const target = rel(pathInput)
  const { storage } = await storageById(storageId)
  const driver = await connect(storage)
  const info = await driver.stat(target)
  if (!info || info.type === 'dir') { await driver.close(); throw new DownloadError('فایل پیدا نشد', 404) }
  const stream = await driver.read(target)
  if (storage.kind === 'local') stream.on('close', () => void driver.close())
  return { stream: Readable.toWeb(stream) as ReadableStream, name: info.name, size: info.size }
}

async function freeName(driver: Driver, dir: string, name: string) {
  let candidate = joinRel(dir, name)
  for (let n = 2; await driver.stat(candidate); n++) {
    if (n > 500) throw new DownloadError('نام آزاد برای فایل پیدا نشد', 409)
    candidate = joinRel(dir, numberedName(name, n))
  }
  return candidate
}

// ------------------------------------------------------------------ jobs

type Secrets = { password?: string; newPassword?: string }
type RunnerState = { running: Map<number, AbortController>; secrets: Map<number, Secrets>; booted: boolean; pumping: boolean }
const state: RunnerState = ((globalThis as { __mobocomDownloads?: RunnerState }).__mobocomDownloads ??= { running: new Map(), secrets: new Map(), booted: false, pumping: false })
const MAX_PARALLEL = () => Math.max(1, Math.min(6, Number(env('DOWNLOADS_PARALLEL') || 2)))

async function boot() {
  if (state.booted) return
  state.booted = true
  await db.downloadJob.updateMany({ where: { status: 'running' }, data: { status: 'failed', error: 'با راه‌اندازی دوبارهٔ سایت متوقف شد؛ «تلاش دوباره» را بزنید.', finishedAt: new Date() } }).catch(() => undefined)
}

export async function listJobs() {
  await boot()
  const jobs = await db.downloadJob.findMany({ orderBy: { id: 'desc' }, take: 100 })
  return jobs.map((job) => ({ ...job, params: undefined, label: JOB_LABEL[job.kind as JobKind] || job.kind, phase: (() => { try { return String(JSON.parse(job.params).phase || '') } catch { return '' } })() }))
}

async function createJob(data: { kind: JobKind; title: string; url?: string; storageId: string; dir: string; name?: string; params: Record<string, unknown>; createdBy: number | null }, secrets?: Secrets) {
  await boot()
  const job = await db.downloadJob.create({ data: { kind: data.kind, title: data.title.slice(0, 300), url: data.url || '', storageId: data.storageId, dir: data.dir, name: data.name || '', params: JSON.stringify(data.params), createdBy: data.createdBy } })
  if (secrets && (secrets.password || secrets.newPassword)) state.secrets.set(job.id, secrets)
  void pump()
  return job
}

export async function cancelJob(id: unknown) {
  const jobId = Number(id)
  const controller = state.running.get(jobId)
  if (controller) controller.abort()
  await db.downloadJob.updateMany({ where: { id: jobId, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled', finishedAt: new Date(), speed: 0 } })
  state.secrets.delete(jobId)
}

export async function retryJob(id: unknown) {
  const job = await db.downloadJob.findUnique({ where: { id: Number(id) } })
  if (!job || !['failed', 'cancelled'].includes(job.status)) throw new DownloadError('این کار قابل تکرار نیست', 409)
  const params = JSON.parse(job.params || '{}')
  if ((params.needsPassword || params.needsSecrets) && !state.secrets.has(job.id)) throw new DownloadError('رمز آرشیو نگه داشته نمی‌شود؛ این کار را دوباره از فهرست فایل‌ها بسازید', 409)
  await db.downloadJob.update({ where: { id: job.id }, data: { status: 'queued', error: '', received: 0, speed: 0, startedAt: null, finishedAt: null, params: JSON.stringify({ ...params, phase: '' }) } })
  void pump()
}

export async function clearJobs() {
  const result = await db.downloadJob.deleteMany({ where: { status: { in: ['done', 'failed', 'cancelled'] } } })
  return { removed: result.count }
}

async function pump() {
  if (state.pumping) return
  state.pumping = true
  try {
    while (state.running.size < MAX_PARALLEL()) {
      const next = await db.downloadJob.findFirst({ where: { status: 'queued', id: { notIn: [...state.running.keys()] } }, orderBy: { id: 'asc' } })
      if (!next) break
      const controller = new AbortController()
      state.running.set(next.id, controller)
      await db.downloadJob.update({ where: { id: next.id }, data: { status: 'running', startedAt: new Date() } })
      void execute(next.id, controller).finally(() => { state.running.delete(next.id); state.secrets.delete(next.id); void pump() })
    }
  } finally { state.pumping = false }
}

type JobRow = NonNullable<Awaited<ReturnType<typeof db.downloadJob.findUnique>>>

/** Throttled progress writer (one DB write per second at most). */
function progressWriter(id: number) {
  let last = 0, lastBytes = 0, lastAt = Date.now(), speed = 0
  return async (received: number, extra: Record<string, unknown> = {}, force = false) => {
    const now = Date.now()
    if (!force && now - last < 1000) return
    const elapsed = (now - lastAt) / 1000
    if (elapsed > 0 && received >= lastBytes) speed = Math.round((received - lastBytes) / elapsed)
    lastBytes = received; lastAt = now; last = now
    await db.downloadJob.update({ where: { id }, data: { received, speed, ...extra } }).catch(() => undefined)
  }
}

async function setPhase(job: JobRow, phase: string, extra: Record<string, unknown> = {}) {
  const params = JSON.parse(job.params || '{}')
  await db.downloadJob.update({ where: { id: job.id }, data: { params: JSON.stringify({ ...params, phase }), ...extra } }).catch(() => undefined)
}

async function execute(id: number, controller: AbortController) {
  const job = await db.downloadJob.findUnique({ where: { id } })
  if (!job) return
  try {
    const params = JSON.parse(job.params || '{}') as Record<string, unknown>
    if (params.authority) await assertArchiveAuthority(params.authority as ArchiveAuthority, id)
    if ((params.needsSecrets || params.needsPassword) && !state.secrets.has(id)) throw new DownloadError('رمز آرشیو پس از راه‌اندازی مجدد نگه داشته نمی‌شود؛ کار را با رمز دوباره بسازید', 409)
    const secrets = state.secrets.get(id) || {}
    let result = ''
    if (job.kind === 'fetch') result = await runFetch(job, controller.signal)
    else if (job.kind === 'transfer') result = await runTransfer(job, params, controller.signal)
    else result = await runArchive(job, params as ArchiveParams, secrets, controller.signal)
    await db.$transaction(async tx => {
      if (params.authority) await assertArchiveAuthority(params.authority as ArchiveAuthority, id, tx)
      const adopted = await tx.downloadJob.updateMany({ where: { id, status: 'running' }, data: { status: 'done', result, speed: 0, finishedAt: new Date() } })
      if (!adopted.count) return
      if ((['repack', 'pack'].includes(job.kind) || (job.kind === 'transfer' && job.storageId === LOCAL_ID)) && /^\/uploads\/(music|cinema|software|games|posts|products|general)\//.test(result)) await (await import('@/modules/media/server/library')).registerLocalAsset(`/files${result.split('/').map(encodeURIComponent).join('/')}`, job.createdBy, null, undefined, tx)
    }, { isolationLevel: 'Serializable' })
    logEvent('info', 'server.downloads.job_done', { id, kind: job.kind })
  } catch (error) {
    const cancelled = controller.signal.aborted
    const message = error instanceof DownloadError ? error.message : 'کار فایل انجام نشد؛ دسترسی، فضای دیسک و سلامت فایل را بررسی کنید'
    await db.downloadJob.updateMany({ where: { id, status: 'running' }, data: { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? '' : message.slice(0, 1000), speed: 0, finishedAt: new Date() } }).catch(() => undefined)
    if (!cancelled) logEvent('warn', 'server.downloads.job_failed', { id, kind: job.kind, error: message.slice(0, 300) })
  } finally { state.secrets.delete(id) }
}

// ------------------------------------------------------------------ remote URL downloader

async function assertPublicHost(url: URL) {
  if (env('DOWNLOADS_ALLOW_PRIVATE') === '1') return
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = /^[\d.]+$|:/.test(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => { throw new DownloadError(`نام ${host} پیدا نشد`) })).map((item) => item.address)
  if (addresses.some(isPrivateAddress)) throw new DownloadError('دانلود از نشانی‌های داخلی شبکه مجاز نیست (DOWNLOADS_ALLOW_PRIVATE=1 برای اجازه)')
}

/** Follows redirects by hand so every hop is checked. */
async function openRemote(input: URL, signal: AbortSignal): Promise<{ response: Response; url: URL }> {
  let url = input
  for (let hop = 0; hop < 8; hop++) {
    await assertPublicHost(url)
    const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) MoboComDownloader/1.0', Accept: '*/*' }
    if (url.username || url.password) headers.Authorization = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
    const clean = new URL(url.toString()); clean.username = ''; clean.password = ''
    const response = await fetch(clean, { headers, redirect: 'manual', signal }).catch((error) => { throw new DownloadError(signal.aborted ? 'لغو شد' : `ارتباط با ${url.hostname} برقرار نشد: ${error instanceof Error ? error.cause instanceof Error ? error.cause.message : error.message : ''}`.trim(), 502) })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel().catch(() => undefined)
      const next = new URL(response.headers.get('location') as string, clean)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new DownloadError('انتقال به نشانی غیر http')
      if (next.host === url.host && !next.username) { next.username = url.username; next.password = url.password }
      url = next
      continue
    }
    if (!response.ok || !response.body) throw new DownloadError(`سرور مبدأ پاسخ ${response.status} داد${response.status === 403 || response.status === 401 ? ' (نیاز به ورود یا لینک منقضی)' : response.status === 404 ? ' (فایل پیدا نشد)' : ''}`, 502)
    return { response, url }
  }
  throw new DownloadError('تعداد انتقال‌ها (redirect) بیش از حد است')
}

const maxBytes = () => Math.max(1, Number(env('DOWNLOADS_MAX_GB') || 100)) * 1024 ** 3

async function runFetch(job: JobRow, signal: AbortSignal) {
  const { response, url } = await openRemote(validateFetchUrl(job.url), signal)
  const total = Number(response.headers.get('content-length')) || null
  if (total && total > maxBytes()) throw new DownloadError(`حجم فایل از سقف ${env('DOWNLOADS_MAX_GB') || 100} گیگابایت بیشتر است`, 413)
  const disk = await fs.statfs(localRoot()).catch(() => null)
  if (total && disk && total > disk.bavail * disk.bsize) throw new DownloadError('فضای خالی دیسک سرور برای این فایل کافی نیست', 507)
  const name = downloadName(job.name, response.headers.get('content-disposition'), url)
  await db.downloadJob.update({ where: { id: job.id }, data: { total, name } })
  const write = progressWriter(job.id)
  const temp = await tempFile(`job${job.id}`)
  let received = 0
  // Abort when the source stops sending for 90 seconds.
  let idle: NodeJS.Timeout | null = null
  const idleAbort = new AbortController()
  const kick = () => { if (idle) clearTimeout(idle); idle = setTimeout(() => idleAbort.abort(), 90_000) }
  try {
    kick()
    const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
    source.on('data', (chunk: Buffer) => {
      received += chunk.length
      kick()
      if (received > maxBytes()) source.destroy(new DownloadError('حجم فایل از سقف مجاز بیشتر شد', 413))
      void write(received)
    })
    await pipeline(source, createWriteStream(temp), { signal: AbortSignal.any([signal, idleAbort.signal]) }).catch((error) => {
      if (idleAbort.signal.aborted && !signal.aborted) throw new DownloadError('سرور مبدأ ۹۰ ثانیه چیزی نفرستاد؛ دانلود متوقف شد', 504)
      throw error
    })
    if (total && received < total) throw new DownloadError('دانلود ناقص ماند (اتصال قطع شد)', 502)
    await write(received, { total: total || received }, true)
    return await placeFile(job, temp, name, signal)
  } finally {
    if (idle) clearTimeout(idle)
    await fs.rm(temp, { force: true })
  }
}

/** Moves a finished local temp file into the job's storage/folder; returns the stored path. */
async function placeFile(job: JobRow, temp: string, name: string, signal: AbortSignal) {
  const { storage } = await storageById(job.storageId)
  const driver = await connect(storage)
  try {
    const dir = rel(job.dir)
    await driver.mkdir(dir).catch(() => undefined)
    const target = await freeName(driver, dir, name)
    if (storage.kind !== 'local') {
      await setPhase(job, 'upload', { received: 0 })
      const write = progressWriter(job.id)
      const size = (await fs.stat(temp)).size
      await db.downloadJob.update({ where: { id: job.id }, data: { total: size } })
      if (signal.aborted) throw new DownloadError('لغو شد')
      await driver.upload(temp, target, (bytes) => void write(bytes))
      await write(size, {}, true)
    } else await driver.upload(temp, target)
    return target
  } finally { await driver.close() }
}

export async function queueFetch(input: { storage: unknown; dir: unknown; list: unknown }, userId: number | null) {
  const { storage } = await storageById(input.storage)
  const dir = rel(input.dir || '/')
  const requests = parseFetchList(input.list)
  if (!requests.length) throw new DownloadError('دست‌کم یک نشانی دانلود وارد کنید')
  const jobs = []
  for (const request of requests) {
    const url = validateFetchUrl(request.url)
    jobs.push(await createJob({ kind: 'fetch', title: request.name || url.hostname + url.pathname.slice(0, 120), url: request.url, storageId: storage.id, dir, name: request.name, params: {}, createdBy: userId }))
  }
  return { queued: jobs.length }
}

// ------------------------------------------------------------------ transfers between storages

export async function queueTransfer(input: { from: unknown; paths: unknown; to: unknown; dir: unknown; move?: unknown }, userId: number | null, authority?: ArchiveAuthority) {
  const from = await storageById(input.from)
  const to = await storageById(input.to)
  const paths = (Array.isArray(input.paths) ? input.paths : []).slice(0, 100).map(rel)
  if (!paths.length) throw new DownloadError('فایلی انتخاب نشده است')
  if (from.storage.id === to.storage.id) throw new DownloadError('مبدأ و مقصد یکی است؛ از «انتقال» استفاده کنید')
  const dir = rel(input.dir || '/')
  const jobs = []
  for (const source of paths) jobs.push(await createJob({ kind: 'transfer', title: `${baseName(source)} → ${to.storage.name}`, storageId: to.storage.id, dir, name: baseName(source), params: { from: from.storage.id, path: source, move: input.move === true, authority }, createdBy: userId }))
  return { queued: jobs.length }
}

async function runTransfer(job: JobRow, params: Record<string, unknown>, signal: AbortSignal) {
  const source = rel(params.path)
  const { storage } = await storageById(params.from)
  const driver = await connect(storage)
  const temp = await tempFile(`job${job.id}`)
  try {
    const info = await driver.stat(source)
    if (!info || info.type === 'dir') throw new DownloadError('فقط فایل‌ها منتقل می‌شوند (پوشه را اول فشرده کنید)')
    await db.downloadJob.update({ where: { id: job.id }, data: { total: info.size } })
    await setPhase(job, 'download')
    const write = progressWriter(job.id)
    await driver.download(source, temp, (bytes) => void write(bytes))
    await write(info.size, {}, true)
    if (signal.aborted) throw new DownloadError('لغو شد')
    const stored = await placeFile(job, temp, cleanName(job.name) || baseName(source), signal)
    if (params.move === true) await driver.remove(source, false)
    return stored
  } finally { await driver.close(); await fs.rm(temp, { force: true }) }
}

// ------------------------------------------------------------------ archives (this server only)

const localAbs = (relPath: string) => path.join(localRoot(), relPath)

async function requireLocalFile(storageId: unknown, pathInput: unknown) {
  if (String(storageId || LOCAL_ID) !== LOCAL_ID) throw new DownloadError('ابتدا فایل دوردست را به پوشهٔ دانلود همین سرور کپی کنید', 409)
  const target = rel(pathInput), file = localAbs(target)
  const real = await fs.realpath(file).catch(() => '')
  if (!real.startsWith(await fs.realpath(localRoot()) + path.sep) || (await fs.lstat(file)).isSymbolicLink()) throw new DownloadError('آرشیو خارج از فضای دانلود است', 403)
  const info = await fs.stat(real)
  if (!info.isFile()) throw new DownloadError('فایل پیدا نشد', 404)
  const format = archiveFormat(target)
  if (!format) throw new DownloadError('این فایل آرشیو شناخته‌شده‌ای نیست')
  return { target, format, size: info.size }
}

async function toolFor(format: ArchiveFormat, action: 'read' | 'write') {
  const tools = await archiveTools()
  if (format === 'rar') {
    const tool = action === 'read' ? tools.unrar || tools.rar : tools.rar
    if (!tool) throw new DownloadError(action === 'read' ? 'ابزار unrar روی سرور نصب نیست (sudo apt install unrar)' : 'ساخت RAR به ابزار rar نیاز دارد (sudo apt install rar)؛ یا خروجی را zip یا 7z بگیرید', 501)
    return tool
  }
  if (format === 'tar') return 'tar'
  if (!tools.sevenZip) throw new DownloadError('ابزار 7z روی سرور نصب نیست (sudo apt install p7zip-full)', 501)
  return tools.sevenZip
}

export type ArchiveListing = { format: ArchiveFormat; encrypted: boolean; needsPassword: boolean; entries: ArchiveEntry[]; files: number; unpacked: number; stamp?: string }

export async function listArchive(storageId: unknown, pathInput: unknown, passwordInput: unknown): Promise<ArchiveListing> {
  const { target, format } = await requireLocalFile(storageId, pathInput)
  const password = validArchivePassword(passwordInput, false)
  const file = localAbs(target)
  const stamp = await archiveStamp(file)
  let entries: ArchiveEntry[]
  if (format === 'tar') {
    const result = await run('tar', ['-tvf', file], { timeout: 120_000 })
    if (!result.ok) throw new DownloadError('خواندن آرشیو انجام نشد')
    entries = result.out.split('\n').filter(Boolean).map((line) => { const parts = line.trim().split(/\s+/); return { path: parts.slice(5).join(' '), size: Number(parts[2]) || 0, packed: null, dir: line.startsWith('d'), encrypted: false, modified: `${parts[3]} ${parts[4]}` } })
  } else {
    const tool = await toolFor(format, 'read')
    const unrar = format === 'rar'
    const result = await run(tool, unrar ? ['lt', `-p${password || '-'}`, '--', file] : ['l', '-slt', `-p${password}`, '--', file], { timeout: 120_000 })
    if (!result.ok && wrongPassword(result.out)) return { format, encrypted: true, needsPassword: true, entries: [], files: 0, unpacked: 0 }
    if (!result.ok && !unrar) throw new DownloadError(`خواندن آرشیو انجام نشد: ${result.out.split('\n').filter((line) => /ERROR|error/.test(line)).slice(0, 2).join(' ').slice(0, 200)}`)
    entries = unrar ? parseUnrarList(result.out) : parse7zList(result.out)
    if (!result.ok && !entries.length) throw new DownloadError('خواندن آرشیو انجام نشد (فایل خراب یا ناقص است)')
  }
  const encrypted = entries.some((entry) => entry.encrypted)
  let needsPassword = false
  if (encrypted) {
    const tool = await toolFor(format, 'read')
    const check = await run(tool, format === 'rar' ? ['t', `-p${password || '-'}`, '--', file] : ['t', `-p${password}`, '--', file], { timeout: 10 * 60_000 })
    needsPassword = !check.ok && (wrongPassword(check.out) || !password)
  }
  const files = entries.filter((entry) => !entry.dir)
  if (await archiveStamp(file) !== stamp) throw new DownloadError('آرشیو هنگام خواندن تغییر کرد', 409)
  return { format, encrypted, needsPassword, entries: entries.slice(0, 20000), files: files.length, unpacked: files.reduce((sum, entry) => sum + entry.size, 0), stamp }
}

export async function readArchiveText(storage: unknown, pathInput: unknown, entry: unknown, password: unknown) {
  const { target } = await requireLocalFile(storage, pathInput), file = localAbs(target), stamp = await archiveStamp(file), tool = (await archiveTools()).sevenZip
  if (!tool) throw new DownloadError('ابزار 7zz یا 7z نصب نیست', 501)
  const content = await readArchivedText(file, String(entry || ''), validArchivePassword(password, false), tool, run)
  if (await archiveStamp(file) !== stamp) throw new DownloadError('آرشیو هنگام خواندن تغییر کرد', 409)
  return { content, stamp }
}

type ArchiveParams = { action: 'extract' | 'repack' | 'pack'; path?: string; dest?: string; folder?: boolean; format?: Exclude<ArchiveFormat, 'tar'>; replace?: boolean; names?: string[]; needsPassword?: boolean; needsSecrets?: boolean; phase?: string; edits?: ArchiveEdit[]; sourceStamp?: string; authority?: ArchiveAuthority }

export async function queueArchive(body: Record<string, unknown>, userId: number | null) {
  const op = String(body.op)
  const authority = body.authority as ArchiveAuthority | undefined
  if (authority && authority.id !== userId) throw new DownloadError('سازندهٔ کار معتبر نیست', 403)
  if (op === 'pack') {
    if (String(body.storage || LOCAL_ID) !== LOCAL_ID) throw new DownloadError('ساخت آرشیو فقط برای فایل‌های همین سرور است', 409)
    const dir = rel(body.dir)
    const names = (Array.isArray(body.names) ? body.names : []).map(cleanName).filter((name): name is string => !!name).slice(0, 500)
    if (!names.length) throw new DownloadError('چیزی انتخاب نشده است')
    const format = (['zip', '7z', 'rar'].includes(String(body.format)) ? body.format : 'zip') as Exclude<ArchiveFormat, 'tar'>
    await toolFor(format, 'write')
    const newPassword = validArchivePassword(body.newPassword, false)
    const name = withFormat(cleanName(body.name) || (names.length === 1 ? names[0] : `archive-${new Date().toISOString().slice(0, 10)}`), format)
    return createJob({ kind: 'pack', title: `${name} (${names.length} مورد)`, storageId: LOCAL_ID, dir, name, params: { action: 'pack', names, format, needsSecrets: !!newPassword, authority }, createdBy: userId }, { newPassword })
  }
  const { target, format } = await requireLocalFile(body.storage, body.path)
  if (body.stamp && body.stamp !== await archiveStamp(localAbs(target))) throw new DownloadError('آرشیو پس از نمایش فهرست تغییر کرده؛ دوباره باز کنید', 409)
  const password = validArchivePassword(body.password, false)
  await toolFor(format, 'read')
  if (op === 'extract') {
    const dest = rel(body.dest || parentRel(target))
    return createJob({ kind: 'extract', title: baseName(target), storageId: LOCAL_ID, dir: dest, name: baseName(target), params: { action: 'extract', path: target, dest, folder: body.folder !== false, needsPassword: !!password, needsSecrets: !!password, sourceStamp: await archiveStamp(localAbs(target)), authority }, createdBy: userId }, { password })
  }
  if (op === 'repack') {
    const outFormat = (['zip', '7z', 'rar'].includes(String(body.format)) ? body.format : format === 'tar' ? 'zip' : format) as Exclude<ArchiveFormat, 'tar'>
    await toolFor(outFormat, 'write')
    const newPassword = validArchivePassword(body.newPassword, false)
    const edits = archiveEdits(body.edits)
    const title = `${baseName(target)} — ${edits.length ? 'ویرایش محتویات' : newPassword ? (password ? 'تغییر رمز' : 'رمزگذاری') : 'برداشتن رمز'}${outFormat !== format ? ` (${outFormat})` : ''}`
    return createJob({ kind: 'repack', title, storageId: LOCAL_ID, dir: parentRel(target), name: baseName(target), params: { action: 'repack', path: target, format: outFormat, replace: edits.length ? false : body.replace === true, needsPassword: !!password, needsSecrets: !!password || !!newPassword, edits, sourceStamp: await archiveStamp(localAbs(target)), authority }, createdBy: userId }, { password, newPassword })
  }
  throw new DownloadError('عملیات نامعتبر است')
}

async function extractTo(file: string, _format: ArchiveFormat, dest: string, password: string, signal: AbortSignal, progress: (p: number) => void, checkpoint: () => Promise<void> = async () => undefined) {
  const tool = (await archiveTools()).sevenZip
  if (!tool) throw new DownloadError('برای بررسی و باز کردن امن آرشیو، ابزار 7zz یا 7z را نصب کنید', 501)
  await materializeArchive(file, dest, password, tool, run, signal, checkpoint)
  progress(100)
}

async function packDir(srcDir: string, names: string[], out: string, format: Exclude<ArchiveFormat, 'tar'>, password: string, signal: AbortSignal, progress: (p: number) => void) {
  const items = names.map(name => `./${name}`)
  const result = format === 'rar'
    ? await run(await toolFor('rar', 'write'), ['a', '-r', '-idc', '-ma5', ...(password ? [`-hp${password}`] : []), '--', out, ...items], { cwd: srcDir, signal, progress })
    : await run(await toolFor(format, 'write'), ['a', '-bsp1', '-y', '-spd', format === 'zip' ? '-tzip' : '-t7z', ...(password ? [`-p${password}`, format === 'zip' ? '-mem=AES256' : '-mhe=on'] : []), '--', out, ...items], { cwd: srcDir, signal, progress })
  if (!result.ok) throw new DownloadError(signal.aborted ? 'لغو شد' : 'ساخت آرشیو انجام نشد؛ فضای دیسک و ابزار آرشیو را بررسی کنید')
}

async function moveInto(from: string, dir: string, name: string) {
  let target = path.join(dir, name)
  for (let n = 2; await fs.lstat(target).then(() => true, () => false); n++) target = path.join(dir, numberedName(name, n))
  await fs.rename(from, target)
  return target
}

const toRel = (abs: string) => `/${path.relative(localRoot(), abs).split(path.sep).join('/')}`

async function runArchive(job: JobRow, params: ArchiveParams, secrets: Secrets, signal: AbortSignal) {
  const checkpoint = async () => { signal.throwIfAborted(); if (params.authority) await assertArchiveAuthority(params.authority, job.id) }
  await checkpoint()
  const work = await tempFile(`job${job.id}`)
  await fs.mkdir(work, { recursive: true, mode: 0o700 })
  await db.downloadJob.updateMany({ where: { id: job.id, status: 'running' }, data: { total: 100, received: 0 } })
  const write = progressWriter(job.id)
  const progress = (share: number, offset: number) => (percent: number) => void write(Math.round(offset + percent * share / 100))
  try {
    if (params.action === 'pack') {
      const dir = localAbs(rel(job.dir)), out = path.join(work, cleanName(job.name) || 'archive.zip')
      await packDir(dir, params.names || [], out, params.format || 'zip', secrets.newPassword || '', signal, progress(100, 0))
      await checkpoint()
      return toRel(await moveInto(out, dir, path.basename(out)))
    }
    const { target: source, format } = await requireLocalFile(LOCAL_ID, params.path)
    const file = localAbs(source), stamp = await archiveStamp(file)
    if (params.sourceStamp && params.sourceStamp !== stamp) throw new DownloadError('آرشیو پس از ثبت کار تغییر کرده است', 409)
    const snapshot = path.join(work, `source${path.extname(source)}`)
    await fs.copyFile(file, snapshot)
    if (await archiveStamp(file) !== stamp) throw new DownloadError('آرشیو هنگام کپی تغییر کرد', 409)
    const extracted = path.join(work, 'x')
    await setPhase(job, 'extract')
    await extractTo(snapshot, format, extracted, secrets.password || '', signal, progress(params.action === 'extract' ? 100 : 50, 0), checkpoint)
    if (params.edits?.length) await applyArchiveEdits(extracted, params.edits, checkpoint)
    const names = await fs.readdir(extracted)
    if (!names.length) throw new DownloadError('آرشیو خروجی باید حداقل یک فایل داشته باشد')
    await checkpoint()
    if (await archiveStamp(file) !== stamp) throw new DownloadError('نسخهٔ اصلی تغییر کرده؛ خروجی ثبت نشد', 409)
    if (params.action === 'extract') {
      const dest = localAbs(rel(params.dest || parentRel(source)))
      await fs.mkdir(dest, { recursive: true })
      if (params.folder !== false) return toRel(await moveInto(extracted, dest, baseName(source).replace(/\.(zip|7z|rar|tar|gz)$/i, '') || 'extracted'))
      for (const name of names) await moveInto(path.join(extracted, name), dest, name)
      return toRel(dest)
    }
    await setPhase(job, 'pack')
    const outFormat = params.format || (format === 'tar' ? 'zip' : format), outName = withFormat(baseName(source), outFormat), out = path.join(work, outName)
    await packDir(extracted, names, out, outFormat, secrets.newPassword || '', signal, progress(50, 50))
    const tool = (await archiveTools()).sevenZip
    if (!tool || !(await run(tool, ['t', `-p${secrets.newPassword || ''}`, '--', out], { signal, timeout: 600000 })).ok) throw new DownloadError('آرشیو خروجی تأیید نشد؛ نسخهٔ اصلی حفظ شد')
    await checkpoint()
    if (await archiveStamp(file) !== stamp) throw new DownloadError('نسخهٔ اصلی تغییر کرده؛ خروجی ثبت نشد', 409)
    if (params.replace && !params.edits?.length && outFormat === format && !/\.part\d+\.rar$/i.test(source)) { await fs.rename(out, file); return source }
    return toRel(await moveInto(out, path.dirname(file), outName))
  } finally { await fs.rm(work, { recursive: true, force: true }) }
}
