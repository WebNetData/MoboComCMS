import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { GroupError } from '@/modules/account/domain/user-groups'
import { addGroupMember, deleteGroup, removeGroupMember, saveGroup } from './user-groups'

const idOf = (value: unknown) => { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new GroupError('شناسه معتبر نیست'); return id }

/** Group capabilities never change Identity roles; writes and their audit share one transaction. */
export async function writeUserGroup(req: NextRequest, input: Record<string, unknown>) {
  return db.$transaction(async tx => {
    const actor = await requirePerm(req, 'users.manage', tx)
    if (!actor) throw new GroupError('دسترسی کافی ندارید', 403)
    let targetId: number, action: string, metadata: Record<string, unknown> = {}
    let result: { group?: { id: number }; ok?: boolean } = { ok: true }
    switch (input.op) {
      case 'save': {
        if (!input.group || typeof input.group !== 'object' || Array.isArray(input.group)) throw new GroupError('اطلاعات گروه معتبر نیست')
        const group = await saveGroup(input.group as Record<string, unknown>, tx)
        targetId = group.id; action = 'user-group.save'
        metadata = { vipBenefits: group.vipBenefits, hideAds: group.hideAds, discountPercent: group.discountPercent }
        result = { group: { id: group.id } }; break
      }
      case 'delete':
        targetId = idOf(input.id); action = 'user-group.delete'
        if (!(await deleteGroup(targetId, tx)).count) throw new GroupError('گروه پیدا نشد', 404)
        break
      case 'member.add': {
        targetId = idOf(input.id); action = 'user-group.member-add'
        const member = await addGroupMember({ groupId: targetId, user: input.user, expiresAt: input.expiresAt, note: input.note, actorId: actor.id }, tx)
        metadata = { userId: member.userId, expiresAt: member.expiresAt }; break
      }
      case 'member.remove':
        targetId = idOf(input.id); action = 'user-group.member-remove'
        metadata = { userId: idOf(input.userId) }
        await removeGroupMember(targetId, Number(metadata.userId), tx); break
      default: throw new GroupError('عملیات نامعتبر است')
    }
    await auditAdminStrict({ req, actor, action, targetType: 'user-group', targetId, metadata }, tx)
    return result
  })
}
