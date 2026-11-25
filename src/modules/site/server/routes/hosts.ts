import { createHash } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict, type AdminAuditInput } from '@/platform/audit/server'
import { checkSectionHosts, mainSiteOrigin, SectionHostError, type SectionHosts } from '../../domain/section-hosts'
import { routableSections } from './state'

const KEY = 'site.section-hosts.v1'
export const sectionHostsOrigin = () => mainSiteOrigin(process.env.NEXTAUTH_URL)
const revision = (raw: string | null) => createHash('sha256').update(raw ?? 'absent').digest('hex')
export async function loadSectionHosts() {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  let input: unknown = {}
  if (row) { try { input = JSON.parse(row.value) } catch { throw new SectionHostError('تنظیم ساب‌دامنه‌ها قابل خواندن نیست؛ اطلاعات حفظ شد', 503) } }
  return { hosts: checkSectionHosts(input, routableSections(), sectionHostsOrigin()), revision: revision(row?.value ?? null) }
}
export async function saveSectionHosts(patch: Record<string, unknown>, context: Pick<AdminAuditInput, 'req' | 'actor'> & { expected: string }) {
  if (!context.expected) throw new SectionHostError('نسخهٔ تنظیم ساب‌دامنه لازم است؛ صفحه را تازه کنید', 428)
  for (let attempt = 0; ; attempt++) try {
    return await db.$transaction(async tx => {
      const admin = await requirePerm(context.req, 'settings.manage', tx)
      if (!admin || admin.id !== context.actor.id) throw new SectionHostError('اجازهٔ تغییر ساب‌دامنه ندارید', 403)
      const row = await tx.setting.findUnique({ where: { key: KEY } }), before = row?.value ?? null
      if (context.expected !== revision(before)) throw new SectionHostError('ساب‌دامنه‌ها هم‌زمان تغییر کرده‌اند؛ پیش‌نویس را نگه دارید و صفحه را تازه کنید', 409)
      let raw: unknown = {}
      try { raw = before === null ? {} : JSON.parse(before) } catch { throw new SectionHostError('تنظیم قبلی قابل خواندن نیست؛ اطلاعات حفظ شد', 503) }
      const current = checkSectionHosts(raw, routableSections(), sectionHostsOrigin())
      const hosts = checkSectionHosts({ ...current, ...patch }, routableSections(), sectionHostsOrigin()), value = JSON.stringify(hosts)
      if (before === null) await tx.setting.create({ data: { key: KEY, value } })
      else if ((await tx.setting.updateMany({ where: { key: KEY, value: before }, data: { value } })).count !== 1) throw new SectionHostError('تنظیم هم‌زمان تغییر کرد', 409)
      await auditAdminStrict({ ...context, actor: admin, action: 'site.section-hosts.update', targetType: 'setting', targetId: KEY, metadata: { before: revision(before), revision: revision(value), hosts } }, tx)
      return { hosts, revision: revision(value) }
    }, { isolationLevel: 'Serializable', timeout: 15000 })
  } catch (error) { if (['P2034', 'P2002'].includes(String((error as { code?: string }).code)) && attempt < 3) continue; throw error }
}
export type { SectionHosts }
