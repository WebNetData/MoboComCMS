import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PACKAGE_LIMITS, PackageError, validPackagePath } from '@/modules/packages/domain/format'
import { commitDirectory, listDirectory, readBlob, validGitTarget, GitApplyError, type FetchLike, type GitTarget } from '@/modules/packages/domain/github'
import { builtinKind, fileBuffer, installEntries, installSourceEntries, loadSourcePackage, loadPackage, markCodeApplied, type StoredPackage, type PackageCommandContext } from './store'

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

function gitTarget(): Partial<GitTarget> {
  return { token: process.env.PACKAGE_GIT_TOKEN || '', repo: process.env.PACKAGE_GIT_REPO || '', branch: process.env.PACKAGE_GIT_BRANCH || 'main', apiBase: process.env.PACKAGE_GIT_API || undefined }
}
const sourceRoot = () => path.join(process.cwd(), 'src')

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

async function triggerDeploy() {
  const url = process.env.PACKAGE_DEPLOY_WEBHOOK
  if (!url) return null
  const response = await fetch(url, { method: 'GET', headers: process.env.PACKAGE_DEPLOY_TOKEN ? { Authorization: `Bearer ${process.env.PACKAGE_DEPLOY_TOKEN}` } : {}, signal: AbortSignal.timeout(15000) }).catch(() => null)
  return response?.ok ? 'deployment triggered' : `deploy webhook failed${response ? ` (${response.status})` : ''}`
}

async function writeLocal(directory: string, files: Map<string, Buffer>) {
  const root = path.join(process.cwd(), directory)
  if (!root.startsWith(sourceRoot() + path.sep)) throw new PackageError('invalid target directory')
  await fs.mkdir(root, { recursive: true })
  const existing = await walk(root)
  for (const file of existing) if (!files.has(file)) await fs.rm(path.join(root, file))
  for (const [file, data] of files) {
    const target = path.join(root, file)
    if (!target.startsWith(root + path.sep)) throw new PackageError(`invalid path ${file}`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  await promisify(execFile)(process.execPath, ['scripts/generate-extensions.mjs'], { cwd: process.cwd(), timeout: 60_000 })
}

async function walk(root: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true }).catch(() => [])
  const out: string[] = []
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...await walk(root, relative))
    else out.push(relative)
  }
  return out
}

/** Put a staged code package into the source tree (git commit or local write). */
export async function applyCodePackage(id: string, actor: string, fetcher: FetchLike = fetch as unknown as FetchLike) {
  const pkg = await loadPackage(id)
  if (!pkg) throw new PackageError(`package "${id}" is not installed`)
  if (pkg.manifest.runtime !== 'code') throw new PackageError('only code packages are applied through a build')
  const status = await applyStatus()
  if (!status.ready) throw new PackageError(`code packages cannot be applied yet: ${status.detail}`)
  const directory = sourceDirectory(pkg.manifest.kind, pkg.manifest.id)
  const files = new Map(Object.keys(pkg.files).sort().map(file => [file, fileBuffer(pkg, file)!]))
  if (status.mode === 'git') {
    try {
      const result = await commitDirectory(gitTarget() as GitTarget, directory, [...files].map(([file, data]) => ({ path: file, data })), `${pkg.manifest.name} ${pkg.manifest.version}: apply code package from admin (${actor})`, fetcher)
      const deploy = result.changed ? await triggerDeploy() : null
      const note = result.changed ? `applied as commit ${result.commit.slice(0, 7)}${deploy ? ` · ${deploy}` : ''}` : 'applied (no changes)'
      return { pkg: await markCodeApplied(id, actor, note, pkg), commit: result.commit, url: result.url, changed: result.changed, deploy, mode: status.mode }
    } catch (error) {
      if (error instanceof GitApplyError) throw new PackageError(error.message)
      throw error
    }
  }
  await writeLocal(directory, files)
  return { pkg: await markCodeApplied(id, actor, 'written to the local source tree', pkg), changed: true, mode: status.mode, deploy: null }
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
    for (const file of await walk(root)) files.set(file, await fs.readFile(path.join(root, file)))
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
