import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PackageError, validPackagePath } from '@/modules/packages/domain/format'
import { fileFingerprint } from './operation'

/** Refuse links/devices: a package can replace only ordinary files in its own tree. */
export async function readLocalTree(root: string, prefix = ''): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  const stat = await fs.lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (!stat) return out
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new PackageError('source directory is not an ordinary directory')
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) for (const [name, bytes] of await readLocalTree(file, relative)) out.set(name, bytes)
    else if (entry.isFile() && !entry.isSymbolicLink()) out.set(relative, await fs.readFile(file))
    else throw new PackageError('symbolic links and special files cannot be applied as package source')
  }
  return out
}

async function digest(root: string): Promise<string | null> {
  const exists = await fs.lstat(root).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  return exists ? fileFingerprint(await readLocalTree(root)) : null
}
async function ordinaryParents(directory: string) {
  const relative = path.relative(process.cwd(), directory)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new PackageError('invalid local apply path')
  let current = process.cwd()
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new PackageError('local apply parents must be ordinary directories')
  }
}
export async function localBefore(directory: string) {
  const root = path.resolve(directory)
  await ordinaryParents(path.dirname(root))
  return digest(root)
}

/** Full replacement and retained original; retries recognize both sides of the
 * two renames. Backups never enter generated registries and are never purged here. */
export async function applyLocal(directory: string, operationId: string, before: string | null,
  files: Map<string, Buffer>, fence: () => Promise<void>) {
  if (!/^[0-9a-f-]{36}$/.test(operationId)) throw new PackageError('invalid apply operation')
  const root = path.resolve(directory), parent = path.dirname(root)
  const workspace = path.resolve('var/package-code-apply', operationId)
  await ordinaryParents(parent); await ordinaryParents(workspace)
  await fs.mkdir(workspace, { recursive: true })
  if ((await fs.stat(workspace)).dev !== (await fs.stat(parent)).dev) throw new PackageError('local apply staging must be on the same filesystem as source')
  const stage = path.join(workspace, 'staged'), backup = path.join(workspace, 'previous')
  const wanted = fileFingerprint(files)
  let current = await digest(root), saved = await digest(backup)
  if (current !== wanted) {
    if (current !== before && !(current === null && before !== null && saved === before)) {
      throw new PackageError('سورس محلی پس از آماده‌سازی تغییر کرده است؛ تغییر دیگری بازنویسی نشد')
    }
    if (saved !== null && saved !== before) throw new PackageError('retained source backup differs from the operation receipt')
    await ordinaryParents(stage); await fs.mkdir(stage, { recursive: true })
    for (const [name, bytes] of files) {
      if (!validPackagePath(name, 'code')) throw new PackageError('invalid staged source path')
      const file = path.join(stage, name)
      await ordinaryParents(path.dirname(file)); await fs.mkdir(path.dirname(file), { recursive: true })
      const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new PackageError('invalid staged file')
      await fs.writeFile(file, bytes)
    }
    if (await digest(stage) !== wanted) throw new PackageError('staged source fingerprint mismatch')
    await fence()
    // Recheck immediately before the filesystem claim, including unrelated edits.
    current = await digest(root); saved = await digest(backup)
    if (current !== before && !(current === null && before !== null && saved === before)) throw new PackageError('source changed before local apply')
    if (current !== null) {
      if (saved !== null) throw new PackageError('source and retained backup both exist; reconcile before continuing')
      await fs.rename(root, backup)
    }
    await fs.rename(stage, root)
  }
  if (await digest(root) !== wanted) throw new PackageError('local apply source verification failed')
  await fence()
  await promisify(execFile)(process.execPath, ['scripts/generate-extensions.mjs'], { cwd: process.cwd(), timeout: 60_000 })
  if (await digest(root) !== wanted) throw new PackageError('source changed during registry generation')
}

/** Restore only the recorded original. Keep replacement bytes for review and
 * recognize an interruption between withdrawal and restoration. */
export async function cancelLocal(directory: string, operationId: string, before: string | null,
  files: Map<string, Buffer>, fence: () => Promise<void>) {
  if (!/^[0-9a-f-]{36}$/.test(operationId)) throw new PackageError('invalid apply operation')
  const root = path.resolve(directory), workspace = path.resolve('var/package-code-apply', operationId)
  await ordinaryParents(path.dirname(root)); await ordinaryParents(workspace)
  const backup = path.join(workspace, 'previous'), withdrawn = path.join(workspace, 'withdrawn')
  const wanted = fileFingerprint(files), current = await digest(root), saved = await digest(backup)
  await fence()
  if (current !== before) {
    if (current !== wanted && current !== null) throw new PackageError('سورس پس از اعمال تغییر کرده است؛ لغو آن را بازنویسی نمی‌کند')
    if (before !== null && saved !== before) throw new PackageError('نسخهٔ قبلی با رسید عملیات مطابقت ندارد؛ بازیابی خودکار متوقف شد')
    if (current === wanted) {
      if (await digest(withdrawn) !== null) throw new PackageError('withdrawn source already exists; reconcile it before retrying')
      await fs.rename(root, withdrawn)
    }
    if (before !== null) await fs.rename(backup, root)
  }
  if (await digest(root) !== before) throw new PackageError('original source verification failed')
  await fence()
  await promisify(execFile)(process.execPath, ['scripts/generate-extensions.mjs'], { cwd: process.cwd(), timeout: 60_000 })
  if (await digest(root) !== before) throw new PackageError('source changed during cancellation')
}
