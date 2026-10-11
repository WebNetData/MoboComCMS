import { NextRequest, NextResponse } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm, type AuthedUser } from '@/modules/identity/server/access'
import { getSiteConfig } from '@/modules/site/config/store'
import { PACKAGE_LIMITS, PackageError, isEditable } from '@/modules/packages/domain/format'
import {
  deletePackage, deletePackageFile, exportPackage, fileText, installPackage, listPackages, loadPackage,
  restoreRevision, patchPackage, PackageAuthorityError, summarize, writePackageFile,
} from '@/modules/packages/server/store'
import { applyCodePackage, applyStatus, importBuiltinSource } from '@/modules/packages/server/code-apply'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { codeThemeCatalog } from '@/themes/generated/catalog'

// Admin API for uploaded packages. Every route needs settings.manage (the
// same permission as the Extension Manager) and every change is audited.

type Ctx = { params: Promise<{ id: string }> }
const PERMISSION = 'settings.manage'

async function guard(req: NextRequest) {
  return requirePerm(req, PERMISSION)
}
function failure(error: unknown) {
  if (error instanceof PackageAuthorityError) return err('forbidden', 403)
  if (error instanceof PackageError) return err(error.message, 400)
  console.error('[packages]', error)
  return err('package operation failed', 500)
}
const audit = (req: NextRequest, actor: AuthedUser, action: string, id: string, metadata: Record<string, unknown> = {}) =>
  auditAdmin({ req, actor, action: `package.${action}`, targetType: 'package', targetId: id, metadata })

async function readUpload(req: NextRequest): Promise<Buffer> {
  const limit = PACKAGE_LIMITS.uploadBytes + 64 * 1024
  if (Number(req.headers.get('content-length')) > limit) throw new PackageError(`the file is larger than ${PACKAGE_LIMITS.uploadBytes / 1024 / 1024} MB`)
  const reader = req.body?.getReader()
  if (!reader) throw new PackageError('no file was sent')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > limit) { await reader.cancel(); throw new PackageError(`the file is larger than ${PACKAGE_LIMITS.uploadBytes / 1024 / 1024} MB`) }
    chunks.push(part.value)
  }
  const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers.get('content-type') || '' } }).formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string' || !file.size) throw new PackageError('choose a .zip package to upload')
  return Buffer.from(await file.arrayBuffer())
}

/** Writing server code needs its own permission (Super Admin has it; grant it to other roles deliberately). */
const CODE_PERMISSION = 'extensions.code'

export async function listRoute(req: NextRequest) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const builtins = [
    ...codeThemeCatalog.map(theme => ({ id: theme.id, kind: 'theme' as const, name: theme.name })),
    ...extensionCatalog.filter(item => item.kind === 'plugin').map(item => ({ id: item.id, kind: 'plugin' as const, name: item.name })),
  ]
  const owner = !!await requirePerm(req, CODE_PERMISSION)
  return ok({ packages: await listPackages(), limits: { uploadBytes: PACKAGE_LIMITS.uploadBytes }, code: { ...await applyStatus(), owner }, builtins })
}

export async function uploadRoute(req: NextRequest) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  try {
    const { pkg, upgraded } = await installPackage(await readUpload(req), actor.email)
    await audit(req, actor, upgraded ? 'upgrade' : 'install', pkg.manifest.id, { version: pkg.manifest.version, kind: pkg.manifest.kind, runtime: pkg.manifest.runtime })
    return ok({ package: summarize(pkg), upgraded })
  } catch (error) { return failure(error) }
}

/** GET one package; `?file=path` also returns that file's text, `?revisions=1` the history. */
export async function getRoute(req: NextRequest, { params }: Ctx) {
  if (!await guard(req)) return err('forbidden', 403)
  const { id } = await params
  const pkg = await loadPackage(id)
  if (!pkg) return err('not found', 404)
  const path = req.nextUrl.searchParams.get('file')
  const site = await getSiteConfig()
  return ok({
    package: summarize(pkg, site.themeId),
    ...(path ? { file: { path, content: isEditable(path) ? fileText(pkg, path) : null } } : {}),
    ...(req.nextUrl.searchParams.get('revisions') ? { revisions: pkg.revisions.map(({ content, ...rest }) => ({ ...rest, restorable: rest.path !== '*', bytes: content?.length ?? 0 })) } : {}),
  })
}

/** PATCH { enabled } | { settings } | { activate: true } */
export async function patchRoute(req: NextRequest, { params }: Ctx) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const { id } = await params
  const body = await req.json().catch(() => null)
  try {
    const changes = {
      ...(typeof body?.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(body?.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? { settings: body.settings as Record<string, unknown> } : {}),
      ...(body?.activate === true ? { activate: true as const } : {}),
    }
    const pkg = Object.keys(changes).length ? await patchPackage(id, changes, { req, actor }) : await loadPackage(id)
    if (!pkg) return err('not found', 404)
    // The site document is request-cached, so a fresh activation is reported directly.
    return ok({ package: summarize(pkg, body?.activate === true ? id : (await getSiteConfig()).themeId) })
  } catch (error) { return failure(error) }
}

export async function deleteRoute(req: NextRequest, { params }: Ctx) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const { id } = await params
  try {
    await deletePackage(id)
    await audit(req, actor, 'delete', id)
    return ok({ deleted: true })
  } catch (error) { return failure(error) }
}

export async function exportRoute(req: NextRequest, { params }: Ctx) {
  if (!await guard(req)) return err('forbidden', 403)
  const { id } = await params
  try {
    const { filename, data } = await exportPackage(id)
    return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

/** PUT { path, content } writes a text file; DELETE ?path= removes one. */
export async function putFileRoute(req: NextRequest, { params }: Ctx) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (typeof body?.path !== 'string' || typeof body?.content !== 'string') return err('path and content are required')
  try {
    const pkg = await writePackageFile(id, body.path, body.content, actor.email)
    await audit(req, actor, 'file.write', id, { path: body.path, bytes: body.content.length })
    return ok({ package: summarize(pkg, (await getSiteConfig()).themeId) })
  } catch (error) { return failure(error) }
}

export async function deleteFileRoute(req: NextRequest, { params }: Ctx) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const { id } = await params
  const path = req.nextUrl.searchParams.get('path') || ''
  try {
    const pkg = await deletePackageFile(id, path, actor.email)
    await audit(req, actor, 'file.delete', id, { path })
    return ok({ package: summarize(pkg, (await getSiteConfig()).themeId) })
  } catch (error) { return failure(error) }
}

/** POST { index } restores the file changed by that revision. */
export async function restoreRoute(req: NextRequest, { params }: Ctx) {
  const actor = await guard(req)
  if (!actor) return err('forbidden', 403)
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!Number.isInteger(body?.index) || body.index < 0) return err('revision index is required')
  try {
    const pkg = await restoreRevision(id, body.index, actor.email)
    await audit(req, actor, 'file.restore', id, { index: body.index })
    return ok({ package: summarize(pkg, (await getSiteConfig()).themeId) })
  } catch (error) { return failure(error) }
}

/** POST: commit/write a staged code package into the source tree and trigger the rebuild. */
export async function applyRoute(req: NextRequest, { params }: Ctx) {
  const actor = await requirePerm(req, CODE_PERMISSION)
  if (!actor) return err('the extensions.code permission is required to apply code packages', 403)
  const { id } = await params
  try {
    const result = await applyCodePackage(id, actor.email)
    await audit(req, actor, 'code.apply', id, { mode: result.mode, commit: 'commit' in result ? result.commit : undefined, changed: result.changed })
    return ok({ package: summarize(result.pkg), mode: result.mode, changed: result.changed, commit: 'commit' in result ? result.commit : undefined, url: 'url' in result ? result.url : undefined, deploy: result.deploy })
  } catch (error) { return failure(error) }
}

/** POST { id }: open a built-in plugin/theme's source as an editable code package. */
export async function importSourceRoute(req: NextRequest) {
  const actor = await requirePerm(req, CODE_PERMISSION)
  if (!actor) return err('the extensions.code permission is required to edit source code', 403)
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  try {
    const pkg = await importBuiltinSource(id, actor.email)
    await audit(req, actor, 'code.import', id)
    return ok({ package: summarize(pkg) })
  } catch (error) { return failure(error) }
}
