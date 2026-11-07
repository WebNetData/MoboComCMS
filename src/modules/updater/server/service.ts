import { execFile } from 'node:child_process'
import { assertNativeUpdateTarget } from './managed-runtime'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@/platform/database/prisma'
import { applyMigrations, buildProvider } from '@/platform/database/migrate'
import { logEvent } from '@/platform/observability/logger'
import { readJsonSetting, writeJsonSetting } from '@/modules/settings/server'
import { createInboxEvent } from '@/modules/notifications/server/inbox'
import {
  UpdateError, chooseMethod, compareVersions, effectiveStatus, isSafeRef, isValidRepo, normalizeRelease, parseRunState, pendingMigrations, pickUpdate, safeHookUrl,
  type Environment, type Release,
} from '@/modules/updater/domain/updater'

const CHECK_KEY = 'updates.check.v1'
const CHECK_TTL_MS = 6 * 3_600_000
const DEFAULT_REPO = 'WebNetData/MoboComCMS'

export const updateDirectory = () => join(process.env.UPDATE_STATE_DIR || join(process.cwd(), 'storage', 'update'))
export const helperPath = () => process.env.UPDATE_HELPER || '/usr/local/sbin/mobocom-update'
export const packageTool = () => process.env.UPDATE_PACKAGE_TOOL || '/usr/local/lib/mobocom/release-package.cjs'
export const packageKey = () => process.env.UPDATE_PUBLIC_KEY_FILE || '/etc/mobocom/release-public.pem'

export function currentVersion(): string {
  try { return String(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version || '0.0.0') } catch { return '0.0.0' }
}

function git(args: string[]): Promise<string> {
  return new Promise((resolve) => execFile('git', args, { cwd: process.cwd(), timeout: 5000 }, (error, stdout) => resolve(error ? '' : stdout.trim())))
}

export function environment(): Environment & { method: ReturnType<typeof chooseMethod>; repo: string; feed: string } {
  let hookUrl = ''
  try { hookUrl = safeHookUrl(process.env.UPDATE_DEPLOY_HOOK_URL) } catch { /* an unusable hook is ignored */ }
  const base: Environment = { dockerenv: existsSync('/.dockerenv'), hasGit: existsSync(join(process.cwd(), '.git')), helper: existsSync(helperPath()), hookUrl, packageReady: existsSync(packageTool()) && existsSync(packageKey()) }
  const repo = isValidRepo(process.env.UPDATE_REPO) ? process.env.UPDATE_REPO : DEFAULT_REPO
  return { ...base, hookUrl: hookUrl ? new URL(hookUrl).origin : '', method: chooseMethod(base), repo, feed: base.packageReady ? 'package' : process.env.UPDATE_FEED_URL ? 'custom' : 'github' }
}

// ------------------------------------------------------------------ release feed

interface CheckCache { checkedAt: string; releases: Release[]; error: string; notified: string }

async function fetchReleases(): Promise<Release[]> {
  // Package installs are self-contained; status must not implicitly contact GitHub.
  if (environment().packageReady) return []
  const custom = String(process.env.UPDATE_FEED_URL || '').trim()
  const repo = isValidRepo(process.env.UPDATE_REPO) ? process.env.UPDATE_REPO : DEFAULT_REPO
  const url = custom || `https://api.github.com/repos/${repo}/releases?per_page=15`
  if (custom && !/^https:\/\//i.test(custom)) throw new UpdateError('نشانی خوراک به‌روزرسانی باید https باشد')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MoboComCMS-updater' }, cache: 'no-store' })
    if (!response.ok) throw new UpdateError(response.status === 404 ? 'مخزن یا انتشاری پیدا نشد (مخزن خصوصی است یا هنوز نسخه‌ای منتشر نشده)' : `سرور نسخه‌ها پاسخ ${response.status} داد`, 502)
    const data: unknown = await response.json()
    const list = Array.isArray(data) ? data : [data]
    return list.map(normalizeRelease).filter((r): r is Release => !!r)
  } catch (error) {
    if (error instanceof UpdateError) throw error
    throw new UpdateError('اتصال به سرور نسخه‌ها برقرار نشد (دسترسی اینترنت سرور را بررسی کنید)', 502)
  } finally { clearTimeout(timer) }
}

async function readCache(): Promise<CheckCache | null> {
  const raw = await readJsonSetting(CHECK_KEY)
  if (!raw || !Array.isArray(raw.releases)) return null
  return { checkedAt: String(raw.checkedAt || ''), releases: (raw.releases as unknown[]).map(normalizeRelease).filter((r): r is Release => !!r), error: String(raw.error || ''), notified: String(raw.notified || '') }
}

/** Asks the release feed (at most every few hours unless `force`); a failure keeps the last known answer and says why. */
export async function checkForUpdate(force = false): Promise<CheckCache> {
  if (environment().packageReady) return { checkedAt: '', releases: [], error: '', notified: '' }
  const cached = await readCache()
  if (cached && !force && !cached.error && Date.now() - Date.parse(cached.checkedAt) < CHECK_TTL_MS) return cached
  let next: CheckCache
  try { next = { checkedAt: new Date().toISOString(), releases: await fetchReleases(), error: '', notified: cached?.notified || '' } } catch (error) {
    next = { checkedAt: new Date().toISOString(), releases: cached?.releases || [], error: error instanceof Error ? error.message : 'بررسی نسخه انجام نشد', notified: cached?.notified || '' }
  }
  await writeJsonSetting(CHECK_KEY, next)
  return next
}

// ------------------------------------------------------------------ progress and migrations

function readTail(file: string, lines = 60): string {
  try { return readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n').slice(-8000).trim() } catch { return '' }
}

export function runProgress() {
  let text = ''
  try { text = readFileSync(join(updateDirectory(), 'state.json'), 'utf8') } catch { /* no run yet */ }
  const state = parseRunState(text)
  return { ...state, status: effectiveStatus(state), log: readTail(join(updateDirectory(), 'update.log')) }
}

export async function migrationStatus() {
  const dir = join(process.cwd(), 'prisma', 'migrations')
  let available: string[] = []
  try { available = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { /* not shipped */ }
  if (buildProvider() !== 'postgresql') return { supported: false, available: available.length, applied: 0, pending: [] as string[] }
  try {
    const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL')
    const applied = rows.map((r) => r.migration_name)
    return { supported: true, available: available.length, applied: applied.length, pending: pendingMigrations(available, applied) }
  } catch { return { supported: true, available: available.length, applied: 0, pending: [] as string[], error: 'جدول تاریخچهٔ مهاجرت‌ها خوانده نشد' } }
}

export async function status(force = false) {
  const [check, migrations] = await Promise.all([checkForUpdate(force), migrationStatus()])
  const current = currentVersion()
  const latest = pickUpdate(current, check.releases)
  const host = environment()
  let packageSha = ''
  if (host.packageReady) { try { packageSha = String(JSON.parse(readFileSync(join(process.cwd(), '.release.json'), 'utf8')).sha256 || '').slice(0, 12) } catch { /* first package adoption */ } }
  return {
    current: { version: current, sha: host.packageReady ? packageSha : (await git(['rev-parse', '--short', 'HEAD'])) || '' },
    latest, releases: check.releases.slice(0, 8), checkedAt: check.checkedAt, checkError: check.error,
    environment: host, run: runProgress(), migrations,
  }
}

// ------------------------------------------------------------------ applying

/** Starts the root helper, which runs deploy/ubuntu/self-update.sh outside this process (the process is restarted during the update). */
export async function startUpdate(ref: unknown, options: { backupConfirmed: boolean }) {
  assertNativeUpdateTarget()
  const env = environment()
  if (env.method !== 'systemd') throw new UpdateError('به‌روزرسانی یک‌کلیکی روی این نصب فعال نیست؛ راهنمای همین صفحه را دنبال کنید', 409)
  if (!options.backupConfirmed) throw new UpdateError('ابتدا پشتیبان بگیرید و تأیید کنید', 400)
  if (!isSafeRef(ref)) throw new UpdateError('نسخهٔ انتخابی معتبر نیست')
  if (runProgress().status === 'running') throw new UpdateError('یک به‌روزرسانی در حال انجام است', 409)
  // Only versions the release feed announced can be installed.
  const known = (await readCache())?.releases.some((r) => r.tag === ref || r.version === String(ref).replace(/^v/, ''))
  if (!known) throw new UpdateError('این نسخه در فهرست انتشارها نیست؛ ابتدا «بررسی نسخه» را بزنید', 400)
  if (compareVersions(String(ref), currentVersion()) <= 0) throw new UpdateError('فقط نسخهٔ جدیدتر نصب می‌شود؛ بازگشت نسخه باید با بررسی سازگاری و از مسیر بازیابی انجام شود.', 409)
  mkdirSync(updateDirectory(), { recursive: true })
  writeFileSync(join(updateDirectory(), 'state.json'), JSON.stringify({ status: 'running', step: 'در صف اجرا', target: ref, previous: '', at: new Date().toISOString() }))
  await new Promise<void>((resolve, reject) => {
    execFile('sudo', ['-n', helperPath(), ref], { timeout: 20_000 }, (error, _out, stderr) => (error ? reject(new UpdateError(`اجرای به‌روزرسانی ممکن نشد: ${String(stderr || error.message).slice(0, 300)}`, 500)) : resolve()))
  }).catch((error) => { writeFileSync(join(updateDirectory(), 'state.json'), JSON.stringify({ status: 'failed', step: 'شروع نشد', target: ref, previous: '', at: new Date().toISOString() })); throw error })
  return { started: true }
}

/** A deploy webhook (Coolify and similar) starts the host's own rebuild. */
export async function triggerHook() {
  let hook = ''
  try { hook = safeHookUrl(process.env.UPDATE_DEPLOY_HOOK_URL) } catch (error) { throw new UpdateError(error instanceof Error ? error.message : 'وب‌هوک معتبر نیست') }
  if (!hook) throw new UpdateError('وب‌هوک استقرار تنظیم نشده است (UPDATE_DEPLOY_HOOK_URL)', 409)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(hook, { method: 'GET', signal: controller.signal, redirect: 'manual' })
    if (response.status >= 400) throw new UpdateError(`وب‌هوک پاسخ ${response.status} داد`, 502)
    return { started: true }
  } catch (error) {
    if (error instanceof UpdateError) throw error
    throw new UpdateError('اتصال به وب‌هوک برقرار نشد', 502)
  } finally { clearTimeout(timer) }
}

export async function migrateNow() {
  try { return { log: await applyMigrations() } } catch (error) { throw new UpdateError(`اجرای مهاجرت‌ها ناموفق بود:\n${error instanceof Error ? error.message.slice(0, 1500) : ''}`, 500) }
}

/** Daily job: when a newer stable version appears, every administrator gets one notice for it. */
export async function notifyNewVersion() {
  const check = await checkForUpdate(false)
  const latest = pickUpdate(currentVersion(), check.releases)
  if (!latest || check.notified === latest.version) return false
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true }, take: 20 })
  await Promise.all(admins.map((admin) => createInboxEvent({
    userId: admin.id, kind: 'SYSTEM', dedupeKey: `update:${latest.version}:${admin.id}`, titleFa: `نسخهٔ ${latest.version} منتشر شد`, titleEn: `Version ${latest.version} is available`,
    bodyFa: 'برای مشاهدهٔ تغییرات و به‌روزرسانی، صفحهٔ «به‌روزرسانی سایت» را باز کنید.', bodyEn: '', href: '/admin/updates',
  }).catch(() => undefined)))
  await writeJsonSetting(CHECK_KEY, { ...check, notified: latest.version })
  logEvent('info', 'updates.available', { version: latest.version })
  return true
}
