import { execFile } from 'node:child_process'
import { assertNativeUpdateTarget } from './managed-runtime'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { UpdateError, compareVersions } from '../domain/updater'
import { currentVersion, environment, helperPath, packageKey, packageTool, runProgress, updateDirectory } from './service'

export const MAX_PACKAGE_BYTES = 512 * 1024 * 1024
export type PackageInfo = { id: string; version: string; bytes: number; sha256: string; keyFingerprint: string }
const directory = () => join(updateDirectory(), 'packages')
const packageId = (value: unknown) => {
  if (typeof value !== 'string' || value.length !== 64 || !/^[a-f0-9]{64}$/.test(value)) throw new UpdateError('شناسهٔ بسته معتبر نیست')
  return value
}
async function inspect(file: string): Promise<Omit<PackageInfo, 'id'>> {
  return new Promise((resolve, reject) => execFile(process.execPath, [packageTool(), 'verify', file, packageKey()], { timeout: 60_000, maxBuffer: 16_384 }, (error, stdout) => {
    if (error) return reject(new UpdateError('امضا یا محتوای بسته معتبر نیست؛ فقط بستهٔ ناشر مورد اعتماد این سرور پذیرفته می‌شود'))
    try { resolve(JSON.parse(stdout)) } catch { reject(new UpdateError('پاسخ بررسی بسته معتبر نیست')) }
  }))
}
function ready() {
  if (environment().method !== 'package') throw new UpdateError('نصب بسته روی این میزبان فعال نیست؛ بستهٔ راه‌انداز مورد اعتماد را یک بار روی سرور اجرا کنید', 409)
  if (runProgress().status === 'running') throw new UpdateError('یک به‌روزرسانی در حال اجراست', 409)
  if (existsSync(join(updateDirectory(), 'lock'))) throw new UpdateError('به‌روزرسانی یا بازیابی در حال اجراست', 409)
}

/** Private code-package admission, not the public content Media library. */
export async function uploadPackage(request: Request, expectedVersion?: string): Promise<PackageInfo> {
  ready()
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/octet-stream') throw new UpdateError('نوع فایل ارسالی معتبر نیست')
  if (Number(request.headers.get('content-length')) > MAX_PACKAGE_BYTES) throw new UpdateError('حداکثر حجم بسته ۵۱۲ مگابایت است', 413)
  if (!request.body) throw new UpdateError('فایل دریافت نشد')
  await fs.mkdir(directory(), { recursive: true, mode: 0o700 })
  let lock = false, staging = ''
  const lockPath = join(directory(), '.upload.lock')
  try {
    try { await fs.mkdir(lockPath, { mode: 0o700 }); lock = true } catch { throw new UpdateError('یک بسته در حال بارگذاری است', 409) }
    if ((await fs.readdir(directory())).filter(name => name.endsWith('.mbrelease')).length >= 2) throw new UpdateError('دو بستهٔ آماده دارید؛ بستهٔ قبلی را حذف کنید', 409)
    const disk = await fs.statfs(directory())
    if (disk.bavail * disk.bsize < MAX_PACKAGE_BYTES * 2) throw new UpdateError('فضای آزاد کافی برای دریافت بسته وجود ندارد', 409)
    staging = await fs.mkdtemp(join(directory(), '.incoming-'))
    const file = join(staging, 'release.mbrelease'), handle = await fs.open(file, 'wx', 0o600)
    const reader = request.body.getReader(), hash = createHash('sha256')
    let bytes = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > MAX_PACKAGE_BYTES) throw new UpdateError('حداکثر حجم بسته ۵۱۲ مگابایت است', 413)
        hash.update(part.value)
        await handle.writeFile(part.value)
      }
    } finally { await reader.cancel().catch(() => undefined); await handle.close() }
    const manifest = await inspect(file)
    if (expectedVersion && manifest.version !== expectedVersion) throw new UpdateError('نسخهٔ بستهٔ امضاشده با انتشار انتخابی یکی نیست', 409)
    if (compareVersions(manifest.version, currentVersion()) <= 0) throw new UpdateError('بسته باید نسخه‌ای جدیدتر از نسخهٔ نصب‌شده باشد', 409)
    const id = hash.digest('hex'), target = join(directory(), `${id}.mbrelease`)
    try { await fs.link(file, target) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    await fs.writeFile(join(directory(), `${id}.json`), JSON.stringify({ ...manifest, id }), { mode: 0o600 })
    return { ...manifest, id }
  } finally {
    if (staging) await fs.rm(staging, { recursive: true, force: true })
    if (lock) await fs.rmdir(lockPath)
  }
}

export async function startPackage(value: unknown, backupConfirmed: boolean) {
  assertNativeUpdateTarget()
  ready()
  if (!backupConfirmed) throw new UpdateError('پشتیبان‌گیری و شروع نصب را تأیید کنید')
  const requestLock = join(updateDirectory(), 'request.lock')
  try { await fs.mkdir(requestLock, { mode: 0o700 }) } catch { throw new UpdateError('یک درخواست نصب در حال ثبت است', 409) }
  try {
  ready()
  const id = packageId(value), manifest = await inspect(join(directory(), `${id}.mbrelease`))
  if (compareVersions(manifest.version, currentVersion()) <= 0) throw new UpdateError('فقط نسخهٔ جدیدتر نصب می‌شود', 409)
  const state = (status: string, step: string) => fs.writeFile(join(updateDirectory(), 'state.json'), JSON.stringify({ status, step, target: manifest.version, previous: currentVersion(), at: new Date().toISOString() }), { mode: 0o600 })
  await state('running', 'بسته تأیید شد؛ در صف اجرا')
  try {
    await new Promise<void>((resolve, reject) => execFile('sudo', ['-n', helperPath(), 'package', id], { timeout: 20_000 }, error => error ? reject(new UpdateError('شروع نصب ممکن نشد؛ تنظیم ابزار میزبان را بررسی کنید', 500)) : resolve()))
  } catch (error) { await state('failed', 'شروع نصب ممکن نشد'); throw error }
  return { started: true, version: manifest.version }
  } finally { await fs.rmdir(requestLock) }
}

export async function deletePackage(value: unknown) {
  ready()
  await fs.unlink(join(directory(), `${packageId(value)}.mbrelease`)).catch(error => { if (error.code !== 'ENOENT') throw error })
  await fs.unlink(join(directory(), `${packageId(value)}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error })
  return { deleted: true }
}

export async function listPackages(): Promise<PackageInfo[]> {
  const names = await fs.readdir(directory()).catch(() => [] as string[])
  const result: PackageInfo[] = []
  for (const name of names.filter(name => /^[a-f0-9]{64}\.mbrelease$/.test(name)).slice(0, 2)) {
    const id = name.slice(0, 64)
    try { const item = JSON.parse(await fs.readFile(join(directory(), `${id}.json`), 'utf8')); result.push({ id, version: String(item.version || '').slice(0, 32), sha256: String(item.sha256 || '').slice(0, 64), bytes: Number(item.bytes) || 0, keyFingerprint: String(item.keyFingerprint || '').slice(0, 64) }) }
    catch { result.push({ id, version: '', sha256: '', bytes: 0, keyFingerprint: '' }) }
  }
  return result
}
