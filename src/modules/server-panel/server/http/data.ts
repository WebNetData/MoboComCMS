import type { NextRequest } from 'next/server'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { Readable } from 'node:stream'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { serverGate } from '@/modules/server-panel/server/gate'
import { DbError, browse, exportCsv, overview, runQuery, sqliteFile, tables } from '@/modules/server-panel/server/database'
import { GalleryError, galleryDelete, galleryList, galleryUpload } from '@/modules/server-panel/server/gallery'

function failure(error: unknown) {
  if (error instanceof DbError || error instanceof GalleryError) return err(error.message, error.status)
  return err('عملیات انجام نشد', 500)
}

/** GET /api/admin/server/db  |  ?table=User&page=2&sort=id&dir=asc&column=email&search=x  |  ?export=User  |  ?download=sqlite */
export async function GET_db(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const params = req.nextUrl.searchParams
  try {
    if (params.has('export')) {
      const csv = await exportCsv(params.get('export'))
      await auditAdmin({ req, actor: gate.user, action: 'server.db_export', targetType: 'table', targetId: params.get('export') })
      return new Response(csv.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csv.name}"`, 'Cache-Control': 'no-store' } })
    }
    if (params.get('download') === 'sqlite') {
      const file = sqliteFile()
      if (!file) return err('دانلود مستقیم فقط برای SQLite است؛ برای PostgreSQL از بکاپ رمزگذاری‌شده استفاده کنید', 400)
      const stat = await fs.stat(file).catch(() => null)
      if (!stat) return err('فایل پایگاه داده پیدا نشد', 404)
      await auditAdmin({ req, actor: gate.user, action: 'server.db_backup', targetType: 'database', targetId: 'sqlite-download' })
      return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { 'Content-Type': 'application/vnd.sqlite3', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename="database-${new Date().toISOString().slice(0, 10)}.db"`, 'Cache-Control': 'no-store' } })
    }
    if (params.has('table')) {
      const result = await browse({ table: params.get('table'), page: params.get('page'), size: params.get('size'), sort: params.get('sort'), dir: params.get('dir'), column: params.get('column'), search: params.get('search') })
      await auditAdmin({ req, actor: gate.user, action: 'server.db_browse', targetType: 'table', targetId: result.table, metadata: { page: result.page } })
      return ok(result)
    }
    const [info, list] = await Promise.all([overview(), tables()])
    return ok({ ...info, tables: list })
  } catch (error) { return failure(error) }
}

/** POST /api/admin/server/db {sql} — read-only console. */
export async function POST_db(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const body = await req.json().catch(() => null) as { sql?: unknown } | null
  try {
    const result = await runQuery(body?.sql)
    await auditAdmin({ req, actor: gate.user, action: 'server.db_query', targetType: 'database', metadata: { sql: String(body?.sql || '').slice(0, 800), rows: result.rows.length } })
    return ok(result)
  } catch (error) {
    await auditAdmin({ req, actor: gate.user, action: 'server.db_query', targetType: 'database', metadata: { sql: String(body?.sql || '').slice(0, 800), rejected: error instanceof Error ? error.message : 'error' } })
    return failure(error)
  }
}

/** GET /api/admin/server/gallery?collection=covers&q=&page=&sort=new|big|name */
export async function GET_gallery(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  const params = req.nextUrl.searchParams
  return ok(await galleryList({ collection: params.get('collection'), q: params.get('q'), page: params.get('page'), sort: params.get('sort') }))
}

/** POST multipart files[] → covers; JSON {delete: [{collection, name}]} */
export async function POST_gallery(req: NextRequest) {
  const gate = await serverGate(req)
  if ('response' in gate) return gate.response
  try {
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      if (Number(req.headers.get('content-length') || 0) > 120 * 1024 * 1024) return err('حجم ارسال زیاد است', 413)
      const form = await req.formData().catch(() => null)
      const files = (form?.getAll('files') || []).filter((item): item is File => typeof item === 'object' && 'arrayBuffer' in item).slice(0, 40)
      if (!files.length) return err('تصویری انتخاب نشده است')
      const saved = await galleryUpload(await Promise.all(files.map(async (file) => ({ name: file.name, data: Buffer.from(await file.arrayBuffer()) }))))
      await auditAdmin({ req, actor: gate.user, action: 'server.file_upload', targetType: 'gallery', targetId: 'covers', metadata: { files: saved.map((item) => item.name) } })
      return ok({ saved })
    }
    const body = await req.json().catch(() => null) as { delete?: unknown } | null
    const result = await galleryDelete(body?.delete)
    await auditAdmin({ req, actor: gate.user, action: 'server.file_delete', targetType: 'gallery', metadata: { items: body?.delete } })
    return ok(result)
  } catch (error) { return failure(error) }
}
