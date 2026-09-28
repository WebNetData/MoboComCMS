import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { env } from '@/platform/config/env'
import { serverGate } from '@/modules/server-panel/server/gate'
import { FileError, archive, changeMode, createEntry, extract, findByName, listDir, openDownload, readText, removeEntries, renameEntry, saveUpload, transfer, writeText } from '@/modules/server-panel/server/files'

function failure(error: unknown) {
  if (error instanceof FileError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/files?path=/etc  |  ?read=/etc/hosts  |  ?find=nginx&path=/etc */
export async function GET_files(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const params = req.nextUrl.searchParams
  try {
    if (params.has('read')) {
      const file = await readText(params.get('read'), gate.config.root)
      await auditAdmin({ req, actor: gate.user, action: 'server.file_read', targetType: 'file', targetId: file.path })
      return ok(file)
    }
    if (params.has('find')) return ok(await findByName(params.get('path') || gate.config.root, params.get('find'), gate.config.root))
    return ok(await listDir(params.get('path') || gate.config.root, gate.config.root))
  } catch (error) { return failure(error) }
}

type Body = { op?: string; path?: unknown; dir?: unknown; name?: unknown; content?: unknown; etag?: unknown; paths?: unknown; dest?: unknown; names?: unknown; format?: unknown; mode?: unknown }

/** POST /api/admin/server/files {op, …} — every change is audited. */
export async function POST_files(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = (await req.json().catch(() => null) || {}) as Body
  const root = gate.config.root
  const audit = (action: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: gate.user, action: `server.file_${action}`, targetType: 'file', targetId: String(target ?? ''), metadata })
  try {
    switch (body.op) {
      case 'write': { const result = await writeText(body.path, body.content, body.etag, root); await audit('write', result.path, { size: result.size }); return ok(result) }
      case 'mkdir': { const result = await createEntry(body.dir, body.name, 'dir', root); await audit('mkdir', result.path); return ok(result) }
      case 'touch': { const result = await createEntry(body.dir, body.name, 'file', root); await audit('create', result.path); return ok(result) }
      case 'rename': { const result = await renameEntry(body.path, body.name, root); await audit('rename', body.path, { to: result.path }); return ok(result) }
      case 'move':
      case 'copy': { const result = await transfer(body.paths, body.dest, body.op, root); await audit(body.op, body.dest, { paths: body.paths }); return ok(result) }
      case 'delete': { const result = await removeEntries(body.paths, root); await audit('delete', '', { paths: body.paths }); return ok(result) }
      case 'chmod': { const result = await changeMode(body.path, body.mode, root); await audit('chmod', result.path, { mode: result.octal }); return ok(result) }
      case 'archive': { const result = await archive(body.dir, body.names, body.format === 'zip' ? 'zip' : 'tar.gz', body.name, root); await audit('archive', result.path, { names: body.names }); return ok(result) }
      case 'extract': { const result = await extract(body.path, body.dest, root); await audit('extract', body.path, { to: result.path }); return ok(result) }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}

const uploadLimit = () => Math.max(1, Math.min(4096, Number(env('SERVER_PANEL_MAX_UPLOAD_MB') || 512))) * 1024 * 1024

/** POST /api/admin/server/files/upload (multipart: dir, overwrite, files[]) */
export async function POST_upload(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const limit = uploadLimit()
  const length = Number(req.headers.get('content-length') || 0)
  if (length > limit) return err(`حجم ارسال بیش از ${Math.round(limit / 1024 / 1024).toLocaleString('fa-IR')} مگابایت است`, 413)
  const form = await req.formData().catch(() => null)
  if (!form) return err('فرم ارسال نامعتبر است')
  const dir = form.get('dir')
  const overwrite = form.get('overwrite') === '1'
  const files = form.getAll('files').filter((item): item is File => typeof item === 'object' && 'arrayBuffer' in item).slice(0, 100)
  if (!files.length) return err('فایلی انتخاب نشده است')
  const saved: string[] = []
  try {
    for (const file of files) saved.push(await saveUpload(dir, file.name, new Uint8Array(await file.arrayBuffer()), overwrite, gate.config.root))
  } catch (error) {
    if (saved.length) await auditAdmin({ req, actor: gate.user, action: 'server.file_upload', targetType: 'file', targetId: String(dir), metadata: { files: saved, partial: true } })
    return failure(error)
  }
  await auditAdmin({ req, actor: gate.user, action: 'server.file_upload', targetType: 'file', targetId: String(dir), metadata: { files: saved, overwrite } })
  return ok({ saved })
}

/** GET /api/admin/server/files/download?path=…&inline=1 (images only inline) */
export async function GET_download(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  try {
    const inline = req.nextUrl.searchParams.get('inline') === '1'
    const file = await openDownload(req.nextUrl.searchParams.get('path'), gate.config.root, inline)
    if (!file.inline) await auditAdmin({ req, actor: gate.user, action: 'server.file_download', targetType: 'file', targetId: req.nextUrl.searchParams.get('path') || '' })
    const headers = new Headers({
      'Content-Type': file.type,
      'Content-Disposition': `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    })
    if (file.size !== undefined) headers.set('Content-Length', String(file.size))
    return new Response(file.stream, { headers })
  } catch (error) { return failure(error) }
}
