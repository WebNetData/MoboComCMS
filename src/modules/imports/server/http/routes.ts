import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { auditAdmin } from '@/platform/audit/server'
import { err, ok } from '@/platform/http/response'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { ImportFileError } from '@/modules/imports/domain/parse'
import { ImportError } from '@/modules/imports/server/engine'
import * as service from '@/modules/imports/server/service'

/**
 * Bulk import admin API. Every call needs the dedicated `imports.manage`
 * permission; state-changing calls are same-origin only (middleware) and
 * written to the audit log.
 *
 *   GET  /api/admin/imports?view=destinations|jobs|job|records|templates|choices|export
 *   POST /api/admin/imports/upload?adapter=store   (raw file body, x-file-name header)
 *   POST /api/admin/imports {op, …}
 */

const guard = (req: NextRequest) => adminGuard(req, null, ['imports.manage'])

function failure(error: unknown) {
  if (error instanceof ImportError) return err(error.message, error.status)
  if (error instanceof ImportFileError) return err(error.message, 400)
  console.error('[imports]', error)
  return err('انجام نشد؛ دوباره تلاش کنید', 500)
}

export async function GET(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const q = req.nextUrl.searchParams
  try {
    if (['job','records','export'].includes(q.get('view') || '')) await service.requireJobAccess(q.get('id'), g.admin)
    switch (q.get('view') || 'destinations') {
      case 'destinations': return ok(await service.destinations(g.admin))
      case 'jobs': return ok(await service.jobList({ adapter: q.get('adapter'), status: q.get('status'), page: q.get('page') }))
      case 'job': return ok(service.jobView(await service.getJob(q.get('id'))))
      case 'records': return ok(await service.records(await service.getJob(q.get('id')), { status: q.get('status'), page: q.get('page') }))
      case 'templates': return ok({ templates: await service.templateList(q.get('adapter')) })
      case 'choices': return ok({ choices: await service.choicesFor(q.get('adapter'), q.get('key')) })
      case 'export': {
        const job = await service.getJob(q.get('id'))
        const format = q.get('format') === 'json' ? 'json' : 'csv'
        const body = await service.exportErrors(job, format, q.get('all') === '1')
        return new NextResponse(body, {
          headers: {
            'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="import-${job.id}-${q.get('all') === '1' ? 'report' : 'errors'}.${format}"`,
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          },
        })
      }
      default: return err('نمای نامعتبر')
    }
  } catch (error) { return failure(error) }
}

/**
 * Raw file bytes (not multipart), 8 MB per request: ?adapter=&offset=&token=&final=1.
 * Each chunk is streamed to disk with the size limit enforced while reading.
 */
export async function POST_upload(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const q = req.nextUrl.searchParams
  const { LIMITS } = await import('@/modules/imports/domain/types')
  const { UPLOAD_CHUNK } = await import('@/modules/imports/server/files')
  const declared = Number(req.headers.get('content-length') || 0)
  if (declared > UPLOAD_CHUNK + 1024 || Number(q.get('offset') || 0) + declared > LIMITS.uploadBytes) return err(`حجم فایل بیش از ${LIMITS.uploadBytes / 1024 / 1024} مگابایت است`, 413)
  let name = ''
  try { name = decodeURIComponent(req.headers.get('x-file-name') || '') } catch { name = '' }
  try {
    const result = await service.uploadChunk(g.admin, { adapter: q.get('adapter'), name, token: q.get('token'), offset: q.get('offset'), final: q.get('final') === '1' }, req.body)
    if (result.done) await auditAdmin({ req, actor: g.admin, action: 'import.file_uploaded', targetType: 'import-job', targetId: result.job.id, metadata: { adapter: result.job.adapter, file: result.job.fileName, format: result.job.format, bytes: result.size, rows: result.rows } })
    return ok(result)
  } catch (error) {
    if (error instanceof ImportFileError && /مگابایت/.test(error.message)) return err(error.message, 413)
    return failure(error)
  }
}

export async function POST(req: NextRequest) {
  const g = await guard(req)
  if ('response' in g) return g.response
  const admin = g.admin
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return err('درخواست نامعتبر است')
  const audit = (action: string, targetType: string, target: unknown, metadata?: Record<string, unknown>) => auditAdmin({ req, actor: admin, action, targetType, targetId: String(target ?? ''), metadata })
  try {
    if (['analyze','settings','preview','dry-run','start','pause','resume','cancel','rollback','delete'].includes(String(body.op))) await service.requireJobAccess(body.id, admin)
    switch (body.op) {
      case 'analyze': return ok(await service.analyze(await service.getJob(body.id), body.sheet))
      case 'settings': {
        const job = await service.getJob(body.id)
        const view = await service.saveSettings(job, body.settings, body.templateId)
        await audit('import.mapping_saved', 'import-job', job.id, { adapter: job.adapter, mapped: Object.keys(view.settings.mapping || {}).length, templateId: body.templateId ?? null })
        return ok(view)
      }
      case 'preview': return ok(await service.preview(await service.getJob(body.id), body.settings, admin, body.count))
      case 'dry-run': {
        const job = await service.getJob(body.id)
        const result = await service.dryRun(job, body.settings, admin)
        await audit('import.dry_run', 'import-job', job.id, { total: result.summary.total, valid: result.summary.valid, invalid: result.summary.invalid, actions: result.summary.actions })
        return ok(result)
      }
      case 'start': {
        const job = await service.getJob(body.id)
        const view = await service.start(job, body.settings, admin)
        const options = (view.settings.options || {}) as Record<string, unknown>
        await audit('import.started', 'import-job', job.id, { adapter: job.adapter, file: job.fileName, total: view.total, existing: view.settings.existing, missingVariants: options.missingVariants ?? null })
        // Removing variants that are missing from the file is destructive: recorded on its own.
        if (options.missingVariants === 'delete') await audit('import.variants_delete_confirmed', 'import-job', job.id, { adapter: job.adapter })
        return ok(view)
      }
      case 'pause': case 'resume': case 'cancel': {
        const job = await service.getJob(body.id)
        const view = await service.control(job, body.op, admin)
        await audit(`import.${body.op === 'pause' ? 'paused' : body.op === 'resume' ? 'resumed' : 'cancelled'}`, 'import-job', job.id, { cursor: view.cursor, total: view.total })
        return ok(view)
      }
      case 'rollback': {
        const job = await service.getJob(body.id)
        if (body.confirm !== true) return err('بازگردانی نیاز به تأیید دارد')
        const view = await service.rollback(job, admin)
        await audit('import.rollback_started', 'import-job', job.id, { adapter: job.adapter })
        return ok(view)
      }
      case 'delete': {
        const job = await service.getJob(body.id)
        await service.removeJob(job)
        await audit('import.deleted', 'import-job', job.id, { adapter: job.adapter, file: job.fileName })
        return ok({ deleted: true })
      }
      case 'template-save': {
        const row = await service.templateSave(admin, { id: body.templateId, name: body.name, adapter: body.adapter, settings: body.settings })
        await audit(row.created ? 'import.template_created' : 'import.template_updated', 'import-template', row.id, { adapter: row.adapter, name: row.name })
        return ok(row)
      }
      case 'template-delete': {
        await service.templateDelete(body.templateId)
        await audit('import.template_deleted', 'import-template', body.templateId)
        return ok({ deleted: true })
      }
      default: return err('عملیات نامعتبر است')
    }
  } catch (error) { return failure(error) }
}
