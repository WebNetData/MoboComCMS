import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { env } from '@/platform/config/env'
import { serverGate } from '@/modules/server-panel/server/gate'
import { DownloadError } from '@/modules/server-panel/domain/downloads'
import {
  cancelJob, clearJobs, deletePaths, downloadsOverview, listArchive, listFiles, listJobs, localRoot, makeDir, movePaths, openStoredFile, queueArchive, queueFetch,
  queueTransfer, readTextFile, removeStorage, renamePath, retryJob, saveStorage, setLocalBaseUrl, storeUploads, testStorage, writeTextFile,
} from '@/modules/server-panel/server/downloads'

function failure(error: unknown) {
  if (error instanceof DownloadError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/downloads?view=overview|list&storage=&dir=|jobs|read&storage=&path=|file&storage=&path= */
export async function GET_downloads(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view') || 'overview') {
      case 'overview': return ok({ ...(await downloadsOverview()), jobs: await listJobs() })
      case 'list': return ok(await listFiles(q.get('storage'), q.get('dir')))
      case 'jobs': return ok({ jobs: await listJobs() })
      case 'read': return ok(await readTextFile(q.get('storage'), q.get('path')))
      case 'file': {
        const file = await openStoredFile(q.get('storage'), q.get('path'))
        await auditAdmin({ req, actor: gate.user, action: 'server.download_file', targetType: 'file', targetId: `${q.get('storage')}:${q.get('path')}` })
        return new NextResponse(file.stream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
      }
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

type Body = Record<string, unknown> & { op?: string }

/** POST /api/admin/server/downloads {op, …} — every change is audited (never with passwords). */
export async function POST_downloads(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = (await req.json().catch(() => null) || {}) as Body
  const actor = gate.user
  const audit = (action: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor, action: `server.downloads_${action}`, targetType: 'download', targetId: String(target ?? ''), metadata })
  const storage = body.storage
  try {
    switch (body.op) {
      case 'storage-save': {
        const input = body.item && typeof body.item === 'object' ? body.item as Record<string, unknown> : {}
        const r = await saveStorage(input)
        await audit('storage_save', r.id, { kind: r.kind, host: r.host, secretChanged: !!input.secret })
        return ok(r)
      }
      case 'storage-delete': { await removeStorage(body.id); await audit('storage_delete', body.id); return ok({ removed: true }) }
      case 'storage-test': return ok(await testStorage(body.id))
      case 'base-url': { const r = await setLocalBaseUrl(body.url); await audit('base_url', r.baseUrl); return ok(r) }
      case 'mkdir': { const r = await makeDir(storage, body.dir, body.name); await audit('mkdir', `${storage}:${r.path}`); return ok(r) }
      case 'rename': { const r = await renamePath(storage, body.path, body.name); await audit('rename', `${storage}:${body.path}`, { to: r.path }); return ok(r) }
      case 'move': { const r = await movePaths(storage, body.paths, body.dest); await audit('move', `${storage}:${body.dest}`, { paths: body.paths }); return ok(r) }
      case 'delete': { const r = await deletePaths(storage, body.paths); await audit('delete', String(storage), { paths: body.paths }); return ok(r) }
      case 'write': { const r = await writeTextFile(storage, body.path, body.content, body.etag); await audit('write', `${storage}:${r.path}`); return ok(r) }
      case 'fetch': { const r = await queueFetch({ storage, dir: body.dir, list: body.list }, actor.id); await audit('fetch', `${storage}:${body.dir}`, { urls: String(body.list || '').split('\n').slice(0, 50) }); return ok(r) }
      case 'transfer': { const r = await queueTransfer({ from: storage, paths: body.paths, to: body.to, dir: body.dir, move: body.move }, actor.id); await audit('transfer', `${storage}→${body.to}`, { paths: body.paths, move: body.move === true }); return ok(r) }
      case 'archive-list': return ok(await listArchive(storage, body.path, body.password))
      case 'extract':
      case 'repack':
      case 'pack': {
        const job = await queueArchive(body, actor.id)
        await audit(body.op, `${storage}:${body.path || body.dir}`, { format: body.format, passwordChange: body.op === 'repack' ? (body.newPassword ? 'set' : 'remove') : undefined, names: body.names })
        return ok({ id: job.id })
      }
      case 'job-cancel': { await cancelJob(body.id); return ok({ cancelled: true }) }
      case 'job-retry': { await retryJob(body.id); return ok({ queued: true }) }
      case 'jobs-clear': return ok(await clearJobs())
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}

const uploadLimit = () => Math.max(1, Math.min(8192, Number(env('SERVER_PANEL_MAX_UPLOAD_MB') || 512))) * 1024 * 1024

/** POST /api/admin/server/downloads/upload (multipart: storage, dir, files[]) */
export async function POST_downloads_upload(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const limit = uploadLimit()
  if (Number(req.headers.get('content-length') || 0) > limit) return err(`حجم ارسال بیش از ${Math.round(limit / 1024 / 1024).toLocaleString('fa-IR')} مگابایت است`, 413)
  const form = await req.formData().catch(() => null)
  if (!form) return err('فرم ارسال نامعتبر است')
  const files = form.getAll('files').filter((item): item is File => typeof item === 'object' && 'arrayBuffer' in item).slice(0, 50)
  if (!files.length) return err('فایلی انتخاب نشده است')
  const dir = path.join(localRoot(), '.incoming')
  await fs.mkdir(dir, { recursive: true })
  const temps: { temp: string; name: string }[] = []
  try {
    for (const file of files) {
      const temp = path.join(dir, `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      await fs.writeFile(temp, new Uint8Array(await file.arrayBuffer()))
      temps.push({ temp, name: file.name })
    }
    const r = await storeUploads(form.get('storage'), form.get('dir'), temps)
    await auditAdmin({ req, actor: gate.user, action: 'server.downloads_upload', targetType: 'download', targetId: `${form.get('storage')}:${form.get('dir')}`, metadata: { files: r.saved } })
    return ok(r)
  } catch (error) { return failure(error) } finally {
    await Promise.all(temps.map((item) => fs.rm(item.temp, { force: true })))
  }
}
