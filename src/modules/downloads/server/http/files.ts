import { importDataImage } from '../image-input'
import { AUTHOR_PERMISSIONS } from '@/modules/identity/domain/sections'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { rateLimitStrict } from '@/platform/http/rate-limit'
import { readJsonObject, JsonBodyError } from '@/platform/http/read-json'
import { LibraryError } from '@/modules/media/domain/library'
import { originIsThisSite } from '@/platform/http/origin-policy'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { requirePerm } from '@/modules/identity/server/access'
import { getSettings } from '@/modules/settings/server'
import { findAssets, rewriteAssets } from '@/modules/downloads/domain/localize'
import { FileError, appendChunk, cancelUpload, finishUpload, logImportFailure, pruneUploads, serveLocalFile, startUpload } from '@/modules/downloads/server/files'

// Staff who edit content in any section may upload files and copy pasted assets.
// A section author uploads what their own items need, like the section's manager.
const CONTENT_PERMS = ['prompts.manage', 'cms.posts', 'cms.pages', 'cms.products', 'music.manage', 'cinema.manage', 'software.manage', 'games.manage', 'settings.manage', 'media.manage', ...AUTHOR_PERMISSIONS]

async function staff(req: NextRequest) {
  for (const perm of CONTENT_PERMS) {
    const admin = await requirePerm(req, perm).catch(() => null)
    if (admin) return admin
  }
  return null
}

function failure(error: unknown) {
  if (error instanceof FileError || error instanceof LibraryError || error instanceof JsonBodyError) return err(error.message, error.status)
  console.error('[files]', error instanceof Error ? error.name : 'UnknownError')
  return err('انجام نشد؛ دوباره تلاش کنید', 500)
}

/** POST /api/admin/uploads {op:'start', name, size, section} | {op:'finish', id} | {op:'cancel', id} */
export async function POST_upload(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await staff(req)
  if (!admin) return err('forbidden', 403)
  const body = (await req.json().catch(() => null)) || {}
  try {
    if (body.op === 'start') { void pruneUploads().catch(() => undefined); return ok(await startUpload({ ...body, ownerId: admin.id })) }
    if (body.op === 'finish') {
      const file = await finishUpload(body.id, admin.id)
      await auditAdmin({ req, actor: admin, action: 'files.upload', targetType: 'file', targetId: file.path, metadata: { size: file.size } })
      const asset = await (await import('@/modules/media/server/library')).registerLocalAsset(`/files/${file.path.split('/').map(encodeURIComponent).join('/')}`, admin.id)
      return ok({ ...file, assetId: asset.id, revision: asset.revision })
    }
    if (body.op === 'cancel') { await cancelUpload(body.id, admin.id); return ok({ cancelled: true }) }
    return err('عملیات نامعتبر است')
  } catch (error) { return failure(error) }
}

/** PUT /api/admin/uploads?id=&offset= — raw chunk body (up to 64 MB). */
export async function PUT_upload(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await staff(req)
  if (!admin) return err('forbidden', 403)
  try { return ok(await appendChunk(req.nextUrl.searchParams.get('id'), req.nextUrl.searchParams.get('offset'), req.body, admin.id)) } catch (error) { return failure(error) }
}

async function siteHost(req: NextRequest) {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  try { return new URL(settings.siteUrl || process.env.NEXTAUTH_URL || req.nextUrl.origin).hostname } catch { return req.nextUrl.hostname }
}


/**
 * POST /api/admin/content/localize
 *   {html, section?}  → copies external images/files of pasted content to this server and rewrites it
 *   {url, kind}       → one image (cover fields) or file
 */
export async function POST_localize(req: NextRequest) {
  if (!originIsThisSite(req.headers.get('origin'), req.headers.get('host') || req.nextUrl.host)) return err('forbidden', 403)
  const admin = await staff(req)
  if (!admin) return err('forbidden', 403)
  try {
    const limit = await rateLimitStrict(`content-localize:${admin.id}`, 20, 60000)
    if (!limit.ok) return err('کمی صبر کنید و دوباره تلاش کنید', 429)
    const body = await readJsonObject(req, 3_100_000)
    const section = typeof body.section === 'string' ? body.section : 'posts'
    const library = await import('@/modules/media/server/library')
    const actor = await library.libraryActor(req)
    const copyAsset = async (url: string, kind: 'image' | 'file') => url.startsWith('data:') ? importDataImage(url, admin.id) : (await library.requestTransfer(actor, { url, kind, section, organization:body.organization&&typeof body.organization==='object'?{...body.organization,video:kind==='file'&&/\.(mp4|webm|mkv|mov)(\?|$)/i.test(url)}:undefined, mode: body.mode || 'immediate', runAt: body.runAt }, req)).url
    if (typeof body.url === 'string') {
      const url = body.url.trim()
      const local = await copyAsset(url, body.kind === 'file' ? 'file' : 'image')
      await auditAdmin({ req, actor: admin, action: 'content.localize', targetType: 'file', targetId: local, metadata: { kind: body.kind === 'file' ? 'file' : 'image' } })
      return ok({ url: local })
    }
    const html = typeof body.html === 'string' ? body.html : ''
    if (html.length > 3_000_000) return err('محتوا بیش از حد بزرگ است', 413)
    const assets = findAssets(html, await siteHost(req)).filter(asset => body.inlineOnly !== true || asset.url.startsWith('data:'))
    const replacements = new Map<string, string>()
    const failed: string[] = []
    // Images a few at a time; files one by one (they can be large).
    const images = assets.filter((asset) => asset.kind === 'image')
    for (let i = 0; i < images.length; i += 4) {
      await Promise.all(images.slice(i, i + 4).map(async (asset) => {
        try { replacements.set(asset.url, await copyAsset(asset.url, 'image')) } catch (error) { failed.push(asset.url.slice(0, 200)); logImportFailure(asset.url, error) }
      }))
    }
    for (const asset of assets.filter((item) => item.kind === 'file')) {
      try { replacements.set(asset.url, await copyAsset(asset.url, 'file')) } catch (error) { failed.push(asset.url); logImportFailure(asset.url, error) }
    }
    if (replacements.size) await auditAdmin({ req, actor: admin, action: 'content.localize', targetType: 'content', targetId: section, metadata: { copied: replacements.size, failed: failed.length } })
    return ok({ html: rewriteAssets(html, replacements), replacements: [...replacements], copied: replacements.size, images: images.length, files: assets.length - images.length, failed })
  } catch (error) { return failure(error) }
}

/** GET/HEAD /files/<path> */
export async function GET_file(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return serveLocalFile(req, (await context.params).path)
}
