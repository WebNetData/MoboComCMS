import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { moduleGuard } from '@/extensions/server/modules'
import { requireContentScope, requirePerm, requireUser } from '@/modules/identity/server/access'
import { PromptError } from '../domain/prompts'

export async function templateScope(req: NextRequest, reader: Prisma.TransactionClient = db) {
  if (await moduleGuard('prompt-master', reader)) throw new PromptError('پرامپت مستر فعال نیست', 404)
  const caller = await requireContentScope(req, 'prompts.manage', 'prompts.author', reader)
  if (!caller) throw new PromptError('دسترسی نوشتن در پرامپت مستر ندارید', 403)
  return caller
}
export async function promptTransaction<T>(req: NextRequest, admin: boolean | 'content', work: (tx: Prisma.TransactionClient, actor: NonNullable<Awaited<ReturnType<typeof requireUser>>>, authorId: number | null) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        if (await moduleGuard('prompt-master', tx)) throw new PromptError('پرامپت مستر فعال نیست', 404)
        const scope = admin === 'content' ? await templateScope(req, tx) : null
        const actor = scope?.admin || (admin ? await requirePerm(req, 'prompts.manage', tx) : await requireUser(req, tx))
        if (!actor) throw new PromptError(admin ? 'دسترسی مدیریت پرامپت مستر ندارید' : 'برای نگه‌داری خروجی وارد حساب شوید', admin ? 403 : 401)
        return work(tx, actor, scope?.authorId ?? null)
      }, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      if (attempt < 4 && code === 'P2034') continue
      if (code === 'P2002') throw new PromptError('این نشانی قبلاً ثبت شده است؛ نشانی دیگری انتخاب کنید', 409)
      throw error
    }
  }
}
export function positiveId(value: unknown) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 1) throw new PromptError('شناسه معتبر نیست')
  return n
}
