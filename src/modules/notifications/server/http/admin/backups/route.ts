import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { runBackupWorker, runBackupScript, backupRunning } from '@/modules/notifications/server/backup-scheduler'
import { listBackupManifests } from '@/modules/notifications/server/backup-status'
const KEY = 'operations.backup.config'
const STATE = 'operations.backup.state'
const ID = /^backup-\d{13}-[a-f0-9]{12}$/
const defaults = { enabled:false, telegramEnabled:false, chatId:'', retentionDays:7, dailyRetentionDays:30, restoreTestEnabled:true }

function backupDir() {
  return path.resolve(process.env.BACKUP_DIR || 'storage/backups')
}

async function mergeState(patch: Record<string, unknown>) {
  const row = await db.setting.findUnique({ where: { key: STATE } })
  let current: Record<string, unknown> = {}
  try { current = row ? JSON.parse(row.value) : {} } catch {}
  const next = { ...current, ...patch }
  await db.setting.upsert({ where: { key: STATE }, create: { key: STATE, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } })
  return next
}

function parseResult(stdout: string) {
  try { return JSON.parse(stdout.split(/\r?\n/).filter(Boolean).pop() || 'null') } catch { return null }
}

export async function GET(req: NextRequest) {
  if (!await requirePerm(req,'settings.manage')) return err('forbidden',403)
  const [config,state,backups] = await Promise.all([db.setting.findUnique({where:{key:KEY}}),db.setting.findUnique({where:{key:STATE}}),listBackupManifests()])
  return ok({
    config: config ? JSON.parse(config.value) : defaults,
    state: state ? JSON.parse(state.value) : null,
    backups,
    busy: backupRunning(),
    postgres: /^postgres(?:ql)?:/.test(process.env.DATABASE_URL||''),
    hasKey: /^[a-f\d]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY||''),
    scheduler: process.env.BACKUP_SCHEDULER !== 'false',
  })
}
export async function PATCH(req: NextRequest) {
  if (!await requirePerm(req,'settings.manage')) return err('forbidden',403)
  const b=await req.json().catch(()=>null)
  if(!b || ['enabled','telegramEnabled','restoreTestEnabled'].some(key=>typeof b[key]!=='boolean') || typeof b.chatId!=='string' || !Number.isInteger(b.retentionDays) || b.retentionDays<1 || b.retentionDays>90 || !Number.isInteger(b.dailyRetentionDays) || b.dailyRetentionDays<b.retentionDays || b.dailyRetentionDays>365) return err('تنظیمات معتبر نیست',400)
  if(b.chatId && !/^[1-9]\d{0,19}$/.test(b.chatId)) return err('شناسه عددی کاربر ادمین را وارد کنید',400)
  if(b.enabled && (!/^postgres(?:ql)?:/.test(process.env.DATABASE_URL||'') || !/^[a-f\d]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY||''))) return err('PostgreSQL و کلید رمزگذاری سرور باید آماده باشند',400)
  if(b.telegramEnabled && !b.chatId) return err('شناسه تلگرام الزامی است',400)
  const config={enabled:b.enabled,telegramEnabled:b.telegramEnabled,restoreTestEnabled:b.restoreTestEnabled,chatId:b.chatId,retentionDays:b.retentionDays,dailyRetentionDays:b.dailyRetentionDays}
  await db.setting.upsert({where:{key:KEY},create:{key:KEY,value:JSON.stringify(config)},update:{value:JSON.stringify(config)}})
  return ok({saved:true})
}
export async function POST(req: NextRequest) {
  const admin = await requirePerm(req,'settings.manage')
  if (!admin) return err('forbidden',403)
  const b = await req.json().catch(()=>null)
  const action = String(b?.action || 'run')
  const id = typeof b?.id === 'string' ? b.id : ''
  if (action !== 'run' && !ID.test(id)) return err('بکاپ انتخابی معتبر نیست',400)

  if (action === 'run') return runBackupWorker(true) ? ok({queued:true}) : err('PostgreSQL آماده نیست یا عملیاتی در حال اجراست',409)

  const archive = path.join(backupDir(), id + '.dump.enc')
  try { await fs.access(archive) } catch { return err('فایل این بکاپ پیدا نشد',404) }

  if (action === 'restore-test') {
    const run = await runBackupScript('scripts/restore-backup.cjs', [archive])
    const result = parseResult(run.stdout)
    await mergeState({ lastRestoreTest: { at: new Date().toISOString(), backupId: id, ok: Boolean(result?.ok), result: result || run.message || run.stderr || null } })
    await auditAdmin({ req, actor: { id: admin.id, email: admin.email }, action: 'backup.restore_test', targetType: 'Backup', targetId: id, metadata: { ok: Boolean(result?.ok) } })
    if (!result?.ok) return err('آزمون بازیابی ناموفق بود: ' + (run.message || run.stderr || 'خطای نامشخص'), 502)
    return ok({ tested: true, result })
  }

  if (action === 'restore') {
    if (b?.confirm !== 'RESTORE') return err('برای بازیابی واقعی عبارت تأیید را وارد کنید',400)
    if (backupRunning()) return err('یک عملیات بکاپ در حال اجراست؛ بعد از پایان دوباره تلاش کنید',409)
    const run = await runBackupScript('scripts/restore-live.cjs', [archive], { RESTORE_CONFIRM: '1' }, 600_000)
    const result = parseResult(run.stdout)
    await mergeState({ lastRestore: { at: new Date().toISOString(), backupId: id, ok: Boolean(result?.ok), result: result || run.message || run.stderr || null } })
    await auditAdmin({ req, actor: { id: admin.id, email: admin.email }, action: 'backup.restore', targetType: 'Database', targetId: id, metadata: { ok: Boolean(result?.ok), counts: result?.counts || null, safetyBackup: result?.safetyBackup || null } })
    if (!result?.ok) return err('بازیابی ناموفق بود و دیتابیس دست‌نخورده ماند: ' + (run.message || run.stderr || 'خطای نامشخص'), 502)
    return ok({ restored: true, result, restartRequired: true })
  }

  return err('عملیات ناشناخته',400)
}
