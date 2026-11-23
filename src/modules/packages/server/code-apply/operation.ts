import { createHash, randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { readFileSync, readlinkSync } from 'node:fs'
import { PackageError } from '@/modules/packages/domain/format'
import type { CodeApplyOperation } from '@/modules/packages/domain/apply-operation'
import type { StoredPackage, PackageCommandContext } from '../store'
import { fileBuffer } from '../store/files'
import { packageTransaction, loadPackageFrom, mustLoad, savePackage } from '../store/persistence'
import { packageCommandActor, auditPackageCommand } from '../store/authority'
import { assertStoredPackageCompatibility } from '../compatibility'

const LOCK_KEY = 'packages.code-apply.v1'
interface ApplyLock { packageId: string; operationId: string; runner?: string; until?: number; host?: string; pid?: number; namespace?: string }
function processNamespace() {
  if (process.platform !== 'linux') return undefined
  try { return createHash('sha256').update(readFileSync('/proc/sys/kernel/random/boot_id', 'utf8') + readlinkSync('/proc/self/ns/pid')).digest('hex') }
  catch { return undefined }
}
const namespace = processNamespace()
function parseLock(value: string | undefined): ApplyLock | null {
  if (!value) return null
  try {
    const lock = JSON.parse(value)
    if (lock === null) return null
    if (typeof lock.packageId === 'string' && typeof lock.operationId === 'string'
      && (lock.runner === undefined || typeof lock.runner === 'string' && Number.isFinite(lock.until)
        && (lock.host === undefined || typeof lock.host === 'string') && (lock.pid === undefined || Number.isSafeInteger(lock.pid) && lock.pid > 0))) return lock
  } catch { /* Never overwrite an unreadable operational claim. */ }
  throw new PackageError('code apply lock has invalid stored data; repair it before applying code')
}
const readLock = async (tx: Parameters<Parameters<typeof packageTransaction>[0]>[0]) => parseLock((await tx.setting.findUnique({ where: { key: LOCK_KEY } }))?.value)
async function writeLock(tx: Parameters<Parameters<typeof packageTransaction>[0]>[0], lock: ApplyLock | null) {
  const value = JSON.stringify(lock)
  await tx.setting.upsert({ where: { key: LOCK_KEY }, create: { key: LOCK_KEY, value }, update: { value } })
}

export function fileFingerprint(files: Map<string, Buffer>) {
  const hash = createHash('sha256')
  for (const [name, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    hash.update(JSON.stringify([name, bytes.length])); hash.update(bytes)
  }
  return hash.digest('hex')
}
export function packageFiles(pkg: StoredPackage) {
  return new Map(Object.keys(pkg.files).map(file => [file, fileBuffer(pkg, file)!]))
}

/** Claim before effects. The same bytes/target resume one durable operation. */
export async function beginApply(id: string, target: string, mode: CodeApplyOperation['mode'], actor: string, context?: PackageCommandContext) {
  return packageTransaction(async tx => {
    const current = await packageCommandActor(context, tx, 'extensions.code')
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id)
    if (pkg.manifest.runtime !== 'code') throw new PackageError('only code packages are applied through a build')
    await assertStoredPackageCompatibility(pkg, tx)
    const fingerprint = fileFingerprint(packageFiles(pkg))
    if (pkg.codeApply && pkg.codeApply.phase !== 'cancelled' && (pkg.codeApply.phase !== 'applied' || pkg.codeApply.fingerprint === fingerprint && pkg.codeApply.target === target)) {
      if (pkg.codeApply.fingerprint !== fingerprint || pkg.codeApply.target !== target || pkg.codeApply.mode !== mode) {
        throw new PackageError('فایل یا مقصد عملیات قبلی تغییر کرده است؛ برای بازیابی، همان مقصد و فایل‌ها لازم است')
      }
      return pkg
    }
    pkg.codeApply = { id: randomUUID(), fingerprint, target, mode, phase: 'prepared', startedAt: new Date().toISOString() }
    const lock = await readLock(tx)
    if (lock) throw new PackageError(`ابتدا عملیات ناتمام بستهٔ «${lock.packageId}» را ادامه دهید`)
    await writeLock(tx, { packageId: id, operationId: pkg.codeApply.id })
    await savePackage(tx, pkg)
    await auditPackageCommand(tx, context, current, 'code.prepare', id, { operationId: pkg.codeApply.id, mode, fingerprint, actor: current?.email ?? actor })
    return pkg
  })
}

/** One source/registry writer across packages and app instances. A crashed runner
 * expires; the operation itself remains pinned until reconciled. No effects in tx. */
export async function withApplyRunner<T>(id: string, operation: CodeApplyOperation, context: PackageCommandContext | undefined,
  work: (fence: () => Promise<void>, runner: string) => Promise<T>) {
  const runner = randomUUID()
  const claim = async (acquire: boolean) => packageTransaction(async tx => {
    await packageCommandActor(context, tx, 'extensions.code')
    const lock = await readLock(tx)
    if (!lock || lock.packageId !== id || lock.operationId !== operation.id) throw new PackageError('code apply operation claim changed')
    let previousAlive = false
    if (acquire && lock.runner && operation.mode === 'local') {
      // A lease cannot revoke an already-issued rename. Local takeover requires
      // proof the former process is dead; another host/namespace is unverified.
      previousAlive = true
      if (namespace && lock.namespace === namespace && lock.host === hostname() && lock.pid) {
        try { process.kill(lock.pid, 0) }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') previousAlive = false }
      }
    }
    if (acquire ? lock.runner && (lock.until! > Date.now() || previousAlive) : lock.runner !== runner || lock.until! <= Date.now()) {
      throw new PackageError('عملیات هنوز در حال اجراست؛ پس از پایان یا بازیابی اجرا دوباره تلاش کنید')
    }
    await writeLock(tx, { ...lock, runner, until: Date.now() + 300_000, host: hostname(), pid: process.pid, namespace })
  })
  await claim(true)
  try { return await work(() => claim(false), runner) }
  finally {
    await packageTransaction(async tx => {
      const lock = await readLock(tx)
      if (lock?.runner !== runner || lock.operationId !== operation.id) return
      const pkg = await loadPackageFrom(id, tx, true)
      await writeLock(tx, pkg?.codeApply?.id === operation.id && ['applied', 'cancelled'].includes(pkg.codeApply.phase)
        ? null : { packageId: id, operationId: operation.id })
    })
  }
}

/** Every step reads current authority/state. Retried callbacks are database-only. */
export async function applyStep(id: string, operation: CodeApplyOperation, context: PackageCommandContext | undefined,
  runner: string, work: (pkg: StoredPackage, current: CodeApplyOperation) => boolean, action?: string) {
  return packageTransaction(async tx => {
    const actor = await packageCommandActor(context, tx, 'extensions.code')
    const lock = await readLock(tx)
    if (!lock || lock.operationId !== operation.id || lock.packageId !== id || lock.runner !== runner || lock.until! <= Date.now()) {
      throw new PackageError('code apply runner claim expired or changed')
    }
    const pkg = mustLoad(await loadPackageFrom(id, tx, true), id), current = pkg.codeApply
    if (!current || current.id !== operation.id || current.target !== operation.target
      || current.fingerprint !== operation.fingerprint || fileFingerprint(packageFiles(pkg)) !== operation.fingerprint) {
      throw new PackageError('عملیات یا فایل‌های بسته تغییر کرده است؛ هیچ اثر تازه‌ای اعمال نشد')
    }
    if (work(pkg, current)) {
      await savePackage(tx, pkg)
      if (action) await auditPackageCommand(tx, context, actor, action, id, { operationId: current.id, mode: current.mode, commit: current.git?.commit })
      if (current.phase === 'applied' || current.phase === 'cancelled') await writeLock(tx, null)
    }
    return pkg
  })
}

export async function finishApply(id: string, operation: CodeApplyOperation, actor: string, context: PackageCommandContext | undefined, runner: string) {
  return applyStep(id, operation, context, runner, (pkg, current) => {
    if (current.phase === 'applied') return false
    if (current.phase !== 'effect') throw new PackageError('apply effect has not been verified')
    current.phase = 'applied'; pkg.codeStatus = 'applied'; pkg.updatedAt = new Date().toISOString()
    pkg.revisions = [{ at: pkg.updatedAt, path: '*', content: null, actor: context?.actor.email ?? actor,
      note: `code apply ${current.id} · ${current.mode}${current.git ? ` · ${current.git.commit}` : ''}` }, ...pkg.revisions]
    return true
  }, 'code.apply')
}
