import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import { db } from '@/platform/database/prisma'
import { probeDatabase } from '@/platform/database/probe'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { saveExtensionState } from '@/extensions/server/state'
import { setSetting } from '@/modules/settings/server'
import roles from '../../../../prisma/system-roles.json'
import {
  InstallError, buildPostgresUrl, describeDatabaseUrl, moduleOrder, normalizePostgres, normalizeSiteInput, normalizeSiteUrl, scrubMessage, serializeRuntimeEnv, toHex, weakSecret, worst,
  type Check, type InstallMode,
} from '@/modules/installer/domain/installer'
import { configDirectory, installMode, isSetupMode, lastErrorFile, markInstalled, runtimeEnvFile } from './state'

const production = () => process.env.NODE_ENV === 'production'

/** The database engine this build was generated for (the schema variant decides it, not the address). */
export function buildProvider(): 'postgresql' | 'sqlite' | 'unknown' {
  try {
    const schema = readFileSync(join(process.cwd(), 'node_modules', '.prisma', 'client', 'schema.prisma'), 'utf8')
    const match = /datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/.exec(schema)
    return match?.[1] === 'postgresql' ? 'postgresql' : match?.[1] === 'sqlite' ? 'sqlite' : 'unknown'
  } catch { return 'unknown' }
}

// ------------------------------------------------------------------ checks

function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, 'x')
    unlinkSync(probe)
    return true
  } catch { return false }
}

export function environmentChecks(context: { https: boolean }, mode: InstallMode): Check[] {
  const checks: Check[] = []
  const major = Number(process.versions.node.split('.')[0])
  checks.push({ id: 'node', label: 'نسخهٔ Node.js', status: major >= 20 ? 'ok' : 'fail', detail: `Node ${process.versions.node}${major >= 20 ? '' : ' — نسخهٔ ۲۰ یا بالاتر لازم است'}` })
  const provider = buildProvider()
  checks.push({
    id: 'engine', label: 'موتور پایگاه داده',
    status: provider === 'postgresql' || !production() ? (provider === 'unknown' ? 'warn' : 'ok') : 'fail',
    detail: provider === 'postgresql' ? 'PostgreSQL' : provider === 'sqlite' ? (production() ? 'این نسخه با SQLite ساخته شده؛ برای سرور واقعی نسخهٔ PostgreSQL را بسازید (npm run build:postgres)' : 'SQLite (مناسب توسعه و آزمایش)') : 'تشخیص داده نشد',
  })
  const dir = configDirectory()
  checks.push({ id: 'storage', label: 'پوشهٔ ذخیره‌سازی', status: writable(dir) ? 'ok' : 'fail', detail: writable(dir) ? `${dir} قابل نوشتن است` : `${dir} قابل نوشتن نیست؛ دسترسی پوشهٔ storage را برای کاربر برنامه باز کنید` })
  const setup = isSetupMode()
  checks.push({
    id: 'database', label: 'اتصال پایگاه داده',
    status: mode === 'unknown' ? 'fail' : setup ? 'warn' : 'ok',
    detail: mode === 'unknown' ? 'پایگاه داده تنظیم شده اما پاسخ نمی‌دهد؛ آدرس و اجرای سرویس پایگاه داده را بررسی کنید' : setup ? 'هنوز تنظیم نشده؛ در مرحلهٔ بعد وارد می‌کنید' : `متصل${describeDatabaseUrl(process.env.DATABASE_URL || '').where ? ` (${describeDatabaseUrl(process.env.DATABASE_URL || '').where})` : ''}`,
  })
  if (production() && !setup) {
    const weak = ['NEXTAUTH_SECRET', 'INTERNAL_JOBS_SECRET'].filter((key) => weakSecret(process.env[key]))
    if (!/^[0-9a-f]{64}$/i.test(process.env.PANEL_CREDENTIAL_KEY || '')) weak.push('PANEL_CREDENTIAL_KEY')
    checks.push({ id: 'secrets', label: 'کلیدهای امنیتی', status: weak.length ? 'fail' : 'ok', detail: weak.length ? `تنظیم قوی نیست: ${weak.join('، ')}` : 'قوی و تنظیم‌شده' })
  } else if (setup) {
    checks.push({ id: 'secrets', label: 'کلیدهای امنیتی', status: 'ok', detail: 'به‌صورت خودکار و تصادفی ساخته می‌شوند' })
  }
  checks.push({ id: 'https', label: 'اتصال امن (HTTPS)', status: context.https || !production() ? 'ok' : 'warn', detail: context.https ? 'صفحه با HTTPS باز شده است' : production() ? 'برای سرور واقعی باید سایت با HTTPS (گواهی SSL) در دسترس باشد؛ بدون آن ورود کاربران کار نمی‌کند' : 'در حالت توسعه لازم نیست' })
  if (existsSync(lastErrorFile())) {
    let text = ''
    try { text = readFileSync(lastErrorFile(), 'utf8').trim().slice(0, 400) } catch { /* ignore */ }
    if (text) checks.push({ id: 'last-error', label: 'خطای راه‌اندازی قبلی', status: 'warn', detail: text })
  }
  return checks
}

export const checksVerdict = worst

// ------------------------------------------------------------------ database step

let busy = false
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new InstallError('عملیات دیگری در حال انجام است؛ چند لحظه صبر کنید', 409)
  busy = true
  try { return await work() } finally { busy = false }
}

export async function testDatabase(input: Record<string, unknown>) {
  if (buildProvider() === 'sqlite' && production()) throw new InstallError('این نسخه با SQLite ساخته شده است؛ برای PostgreSQL نسخهٔ تولید را بسازید')
  const pg = normalizePostgres(input)
  const url = buildPostgresUrl(pg)
  const result = await probeDatabase(url)
  if (!result.ok) throw new InstallError(`اتصال برقرار نشد: ${scrubMessage(result.message, [pg.password, url])}`)
  return { url, pg }
}

function runPreflight(env: Record<string, string>): Promise<string> {
  return new Promise((resolveMessage) => {
    execFile(process.execPath, [join(process.cwd(), 'scripts', 'production-preflight.cjs')], { env: { ...process.env, ...env, NODE_ENV: 'production' }, timeout: 15_000 }, (error, stdout, stderr) => {
      resolveMessage(error ? `${stderr || stdout || 'بررسی تنظیمات ناموفق بود'}`.split('\n').filter((line) => line.includes('[preflight]')).map((line) => line.replace('[preflight]', '').trim()).join('؛ ') || 'بررسی تنظیمات ناموفق بود' : '')
    })
  })
}

/** Saves the connection and generated secrets, then restarts the service so it boots normally (migrations run on start). */
export async function saveDatabase(input: Record<string, unknown>, origin: string) {
  return exclusive(async () => {
    if (!isSetupMode()) throw new InstallError('پایگاه داده از محیط سرور تنظیم شده است و از اینجا تغییر نمی‌کند', 409)
    const { url, pg } = await testDatabase(input)
    const siteUrl = normalizeSiteUrl(input.siteUrl || origin, production())
    if (production() && !siteUrl) throw new InstallError('نشانی عمومی سایت را وارد کنید (با https)')
    const values = {
      DATABASE_URL: url,
      NEXTAUTH_SECRET: toHex(randomBytes(32)),
      INTERNAL_JOBS_SECRET: toHex(randomBytes(32)),
      PANEL_CREDENTIAL_KEY: toHex(randomBytes(32)),
      ...(siteUrl ? { NEXTAUTH_URL: siteUrl } : {}),
    }
    const text = serializeRuntimeEnv(values)
    if (production()) {
      const problem = await runPreflight(values)
      if (problem) throw new InstallError(`تنظیمات برای راه‌اندازی تولید کافی نیست: ${scrubMessage(problem, [pg.password, url])}`)
    }
    mkdirSync(configDirectory(), { recursive: true })
    const temp = `${runtimeEnvFile()}.${process.pid}.tmp`
    writeFileSync(temp, text, { mode: 0o600 })
    renameSync(temp, runtimeEnvFile())
    try { chmodSync(runtimeEnvFile(), 0o600) } catch { /* best effort */ }
    try { unlinkSync(lastErrorFile()) } catch { /* none */ }
    const restart = production() ? 'auto' : 'manual'
    // The response is sent first; the supervisor (Docker or systemd) starts the process again with the saved settings.
    if (restart === 'auto') setTimeout(() => process.exit(0), 1500).unref()
    return { restart, siteUrl }
  })
}

// ------------------------------------------------------------------ schema step

function tail(text: string, lines = 30) {
  return text.split('\n').slice(-lines).join('\n').trim()
}

export async function applySchema() {
  return exclusive(async () => {
    if ((await installMode(true)) !== 'needs-schema') throw new InstallError('جدول‌ها از قبل ساخته شده‌اند یا پایگاه داده در دسترس نیست', 409)
    const provider = buildProvider()
    const cli = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
    if (!existsSync(cli)) throw new InstallError('ابزار Prisma در این بسته نیست؛ جدول‌ها را با «npm run deploy:migrate» بسازید')
    const args = provider === 'postgresql'
      ? [cli, 'migrate', 'deploy', '--schema', 'prisma/schema.postgresql.prisma']
      : [cli, 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma']
    const output = await new Promise<string>((resolveOutput, reject) => {
      execFile(process.execPath, args, { cwd: process.cwd(), env: process.env, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        const text = `${stdout}\n${stderr}`
        if (error) reject(new InstallError(`ساخت جدول‌ها ناموفق بود:\n${scrubMessage(tail(text), [process.env.DATABASE_URL || ''])}`, 500))
        else resolveOutput(text)
      })
    })
    const mode = await installMode(true)
    return { log: scrubMessage(tail(output), [process.env.DATABASE_URL || '']), mode }
  })
}

// ------------------------------------------------------------------ site and administrator

export function moduleCatalog() {
  return extensionCatalog.filter((m) => m.kind === 'module').map((m) => ({ id: m.id, name: m.name, description: m.description, defaultEnabled: m.defaultEnabled !== false, requires: [...(m.requires || [])] }))
}

export async function installSite(input: Record<string, unknown>) {
  return exclusive(async () => {
    if ((await installMode(true)) !== 'needs-admin') throw new InstallError('نصب قبلاً انجام شده یا هنوز جدول‌ها ساخته نشده‌اند', 409)
    const modules = moduleCatalog()
    const site = normalizeSiteInput(input, { production: production(), knownModules: modules.map((m) => m.id) })
    const warnings: string[] = []

    // Site identity first: these are harmless to repeat if a later step fails and the person retries.
    await setSetting('brandName', site.siteName)
    if (site.tagline) await setSetting('brandTagline', site.tagline)
    if (site.siteUrl) await setSetting('siteUrl', site.siteUrl)
    const requires = Object.fromEntries(modules.map((m) => [m.id, m.requires]))
    for (const id of moduleOrder(site.modules, requires)) {
      try { await saveExtensionState(id, { enabled: site.modules[id] }) } catch (error) { warnings.push(`${id}: ${error instanceof Error ? error.message : 'تغییر نکرد'}`) }
    }

    // Roles and the administrator last: the first administrator closes the installer for good.
    for (const role of roles) await db.role.upsert({ where: { name: role.name }, update: { permissions: role.permissions }, create: role })
    const adminRole = await db.role.findUnique({ where: { name: 'admin' } })
    const passwordHash = await bcrypt.hash(site.adminPassword, 12)
    const existing = await db.user.findUnique({ where: { email: site.adminEmail } })
    const data = { passwordHash, name: site.adminName, role: 'ADMIN', roleId: adminRole?.id ?? null, status: 'ACTIVE', profileCompletedAt: new Date() }
    if (existing) await db.user.update({ where: { id: existing.id }, data })
    else await db.user.create({ data: { email: site.adminEmail, ...data } })
    markInstalled()
    return { ok: true, warnings, loginUrl: '/login?next=/admin' }
  })
}
