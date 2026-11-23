import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { PACKAGE_LIMITS, PackageError, validPackagePath } from '@/modules/packages/domain/format'
import { prepareDirectoryCommit, publishDirectoryCommit, assertGitPlanCancellable, listDirectory, readBlob, validGitTarget, GitApplyError, type FetchLike, type GitTarget } from '@/modules/packages/domain/github'
import { builtinKind, installEntries, installSourceEntries, loadSourcePackage, loadPackage, type StoredPackage, type PackageCommandContext } from './store'
import { beginApply, applyStep, finishApply, packageFiles, withApplyRunner } from './code-apply/operation'
import { applyLocal, cancelLocal, localBefore, readLocalTree } from './code-apply/local'
import { assertPackageCompatibility } from './compatibility'
import type { CodeApplyOperation } from '@/modules/packages/domain/apply-operation'

// Code packages are trusted TypeScript. They never run from the database: they
// are written into the source tree and go live only through a normal build,
// which runs the release checks first. Two ways to get them there:
//
//   PACKAGE_APPLY_MODE=git    one commit to PACKAGE_GIT_REPO@PACKAGE_GIT_BRANCH
//                             using PACKAGE_GIT_TOKEN (contents: write). The
//                             deploy platform (e.g. Coolify) builds on push;
//                             PACKAGE_DEPLOY_WEBHOOK (+ PACKAGE_DEPLOY_TOKEN)
//                             can trigger the deployment explicitly.
//   PACKAGE_APPLY_MODE=local  write into ./src of this checkout (development or
//                             a self-built server; rebuild/restart afterwards).

export type ApplyMode = 'git' | 'local' | 'off'
export interface ApplyStatus { mode: ApplyMode; ready: boolean; detail: string; repo?: string; branch?: string; deployHook: boolean }
interface ApplyResult { pkg: StoredPackage; mode: 'git' | 'local'; changed: boolean; commit?: string; url?: string; deploy: CodeApplyOperation['deploy'] | null }

function gitTarget(): Partial<GitTarget> {
  return { token: process.env.PACKAGE_GIT_TOKEN || '', repo: process.env.PACKAGE_GIT_REPO || '', branch: process.env.PACKAGE_GIT_BRANCH || 'main', apiBase: process.env.PACKAGE_GIT_API || undefined }
}
const sourceRoot = () => path.join(process.cwd(), 'src')
function applyTarget(status: ApplyStatus) {
  return createHash('sha256').update(JSON.stringify({ mode: status.mode,
    destination: status.mode === 'git' ? { repo: status.repo, branch: status.branch, api: gitTarget().apiBase || 'https://api.github.com' } : process.cwd(),
    webhook: process.env.PACKAGE_DEPLOY_WEBHOOK || '' })).digest('hex')
}

export async function applyStatus(): Promise<ApplyStatus> {
  const mode = (process.env.PACKAGE_APPLY_MODE || 'off') as ApplyMode
  const deployHook = !!process.env.PACKAGE_DEPLOY_WEBHOOK
  if (mode === 'git') {
    const target = gitTarget()
    return validGitTarget(target)
      ? { mode, ready: true, detail: `${target.repo}@${target.branch}`, repo: target.repo, branch: target.branch, deployHook }
      : { mode, ready: false, detail: 'PACKAGE_GIT_TOKEN, PACKAGE_GIT_REPO (owner/repo) and PACKAGE_GIT_BRANCH are required', deployHook }
  }
  if (mode === 'local') {
    const exists = await fs.stat(path.join(sourceRoot(), 'plugins')).then(stat => stat.isDirectory(), () => false)
    return { mode, ready: exists, detail: exists ? sourceRoot() : 'this deployment has no source tree (use git mode)', deployHook }
  }
  return { mode: 'off', ready: false, detail: 'set PACKAGE_APPLY_MODE=git or local to apply code packages', deployHook }
}

/** Where a package's files live in the source tree. */
export function sourceDirectory(kind: 'plugin' | 'theme', id: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) throw new PackageError('invalid package id')
  return kind === 'theme' ? `src/themes/code/${id}` : `src/plugins/${id}`
}

async function triggerDeploy(fetcher: FetchLike) {
  const url = process.env.PACKAGE_DEPLOY_WEBHOOK
  if (!url) return null
  const response = await fetcher(url, { method: 'GET', headers: process.env.PACKAGE_DEPLOY_TOKEN ? { Authorization: `Bearer ${process.env.PACKAGE_DEPLOY_TOKEN}` } : {}, signal: AbortSignal.timeout(15000) }).catch(() => null)
  return !response ? 'unknown' as const : response.ok ? 'accepted' as const : 'failed' as const
}

/** Put a staged code package into the source tree (git commit or local write). */
export async function applyCodePackage(id: string, actor: string, fetcher: FetchLike = fetch as unknown as FetchLike, context?: PackageCommandContext): Promise<ApplyResult> {
  const status = await applyStatus()
  if (!status.ready) throw new PackageError(`code packages cannot be applied yet: ${status.detail}`)
  const target = applyTarget(status)
  const pkg = await beginApply(id, target, status.mode as 'git' | 'local', actor, context)
  const operation = pkg.codeApply!
  if (operation.intent === 'cancel' && operation.phase !== 'cancelled') return cancelCodeApply(id, actor, fetcher, context)
  const result = (current: StoredPackage, replay = false) => ({ pkg: current, mode: operation.mode,
    changed: !replay && (current.codeApply?.git?.changed ?? true), commit: current.codeApply?.git?.commit,
    url: current.codeApply?.git?.url, deploy: current.codeApply?.deploy ?? null })
  if (operation.phase === 'applied') return result(pkg, true)
  const directory = sourceDirectory(pkg.manifest.kind, id), files = packageFiles(pkg)
  return withApplyRunner(id, operation, context, async (fence, runner) => {
    let current = await applyStep(id, operation, context, runner, () => false)
    const selected = current.codeApply!
    if (selected.intent === 'cancel') return compensateApply(current, actor, fetcher, context, fence, runner)
    await assertPackageCompatibility(current.manifest)
    await fence()
    try {
      if (operation.mode === 'git') {
        if (!selected.git) {
          const plan = await prepareDirectoryCommit(gitTarget() as GitTarget, directory, [...files].map(([file, data]) => ({ path: file, data })),
            `${pkg.manifest.name} ${pkg.manifest.version}: code apply ${operation.id} (${actor})`, fetcher)
          current = await applyStep(id, operation, context, runner, (_pkg, op) => {
            if (op.git) return false
            op.git = plan; op.phase = 'planned'; return true
          })
        }
        await fence()
        await assertPackageCompatibility(pkg.manifest)
        await publishDirectoryCommit(gitTarget() as GitTarget, current.codeApply!.git!, fetcher)
      } else {
        if (!selected.local) {
          const before = await localBefore(directory)
          current = await applyStep(id, operation, context, runner, (_pkg, op) => {
            if (op.local) return false
            op.local = { before }; op.phase = 'planned'; return true
          })
        }
        await applyLocal(directory, operation.id, current.codeApply!.local!.before, files, fence)
      }
      current = await applyStep(id, operation, context, runner, (_pkg, op) => { if (op.phase === 'applied') return false; op.phase = 'effect'; return true })
      if (operation.mode === 'git' && current.codeApply!.git!.changed && process.env.PACKAGE_DEPLOY_WEBHOOK && !current.codeApply!.deploy) {
        await fence()
        current = await applyStep(id, operation, context, runner, (_pkg, op) => { if (op.deploy) return false; op.deploy = 'claimed'; return true }, 'code.deploy.request')
        const deploy = await triggerDeploy(fetcher)
        current = await applyStep(id, operation, context, runner, (_pkg, op) => { op.deploy = deploy || 'failed'; return true })
      }
      current = await finishApply(id, operation, actor, context, runner)
      return result(current)
    } catch (error) {
      if (error instanceof GitApplyError) throw new PackageError(error.message)
      throw error
    }
  })
}

/** Explicit compensation; it never reverts a published Git commit or overwrites
 * source edited after this operation. Cancellation itself is durable/replayable. */
export async function cancelCodeApply(id: string, actor: string, fetcher: FetchLike = fetch as unknown as FetchLike, context?: PackageCommandContext): Promise<ApplyResult> {
  const pkg = await loadPackage(id), operation = pkg?.codeApply
  if (!pkg || !operation) throw new PackageError('هیچ عملیات اعمالی برای بازیابی وجود ندارد')
  const status = await applyStatus()
  if (operation.target !== applyTarget(status)) throw new PackageError('برای بازیابی باید مقصد همان عملیات برقرار باشد')
  if (operation.phase === 'applied') throw new PackageError('اعمال کامل شده است؛ لغو، سورس منتشرشده را برنمی‌گرداند')
  if (operation.phase === 'cancelled') return { pkg, mode: operation.mode, changed: false, deploy: null }
  return withApplyRunner(id, operation, context, async (fence, runner) => {
    const fresh = await applyStep(id, operation, context, runner, () => false)
    return compensateApply(fresh, actor, fetcher, context, fence, runner)
  })
}

async function compensateApply(pkg: StoredPackage, actor: string, fetcher: FetchLike, context: PackageCommandContext | undefined,
  fence: () => Promise<void>, runner: string): Promise<ApplyResult> {
  const operation = pkg.codeApply!, id = pkg.manifest.id
    try {
      await fence()
      if (operation.mode === 'git') await assertGitPlanCancellable(gitTarget() as GitTarget, operation.git, fetcher)
      await applyStep(id, operation, context, runner, (_pkg, op) => {
        if (op.intent === 'cancel') return false
        op.intent = 'cancel'; return true
      }, 'code.cancel.prepare')
      if (operation.mode === 'local' && operation.local) await cancelLocal(sourceDirectory(pkg.manifest.kind, id), operation.id, operation.local.before, packageFiles(pkg), fence)
      const cancelled = await applyStep(id, operation, context, runner, (current, op) => {
        op.phase = 'cancelled'; current.codeStatus = 'staged'; current.updatedAt = new Date().toISOString()
        current.revisions = [{ at: current.updatedAt, path: '*', content: null, actor,
          note: `code apply cancelled ${op.id}; source/plan reconciled, data retained` }, ...current.revisions]
        return true
      }, 'code.cancel')
      return { pkg: cancelled, mode: operation.mode, changed: false, deploy: null }
    } catch (error) { if (error instanceof GitApplyError) throw new PackageError(error.message); throw error }
}

/**
 * Turn the source of a built-in plugin or code theme into an editable code
 * package (the WordPress "theme/plugin file editor" workflow). Reads the
 * repository in git mode, the local source tree otherwise.
 */
export async function importBuiltinSource(id: string, actor: string, fetcher: FetchLike = fetch as unknown as FetchLike, context?: PackageCommandContext): Promise<StoredPackage> {
  const kind = builtinKind(id)
  if (kind !== 'plugin' && kind !== 'theme') throw new PackageError('only built-in plugins and code themes can be edited as code')
  const existing = context ? await loadSourcePackage(id, context) : await loadPackage(id)
  if (existing) return existing
  const directory = sourceDirectory(kind, id)
  const status = await applyStatus()
  const files = new Map<string, Buffer>()
  if (status.mode === 'git' && status.ready) {
    const listing = await listDirectory(gitTarget() as GitTarget, directory, fetcher).catch(error => { throw new PackageError(error instanceof Error ? error.message : String(error)) })
    for (const file of listing.files) files.set(file.path.slice(directory.length + 1), await readBlob(gitTarget() as GitTarget, file.sha, fetcher))
  } else {
    const root = path.join(process.cwd(), directory)
    for (const [file, bytes] of await readLocalTree(root)) files.set(file, bytes)
  }
  if (!files.has('manifest.json')) throw new PackageError(`the source of "${id}" is not available on this server; configure PACKAGE_APPLY_MODE=git`)
  const skipped = [...files.keys()].filter(file => !validPackagePath(file, 'code'))
  if (skipped.length) throw new PackageError(`these files cannot be edited as a package: ${skipped.join(', ')}`)
  if ([...files.values()].some(data => data.length > PACKAGE_LIMITS.maxEntryBytes)) throw new PackageError('a source file is too large for the editor')
  // The marker keeps the package in code mode; the build-time registry ignores it.
  const manifest = JSON.parse(files.get('manifest.json')!.toString('utf8'))
  files.set('manifest.json', Buffer.from(JSON.stringify({ ...manifest, runtime: 'code' }, null, 2) + '\n'))
  const note = `imported source of built-in ${kind}`
  const { pkg } = context ? await installSourceEntries(id, files, actor, note, context) : await installEntries(files, actor, note)
  return pkg
}
