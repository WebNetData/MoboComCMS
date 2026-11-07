import type { NextRequest } from 'next/server';
import { db } from '@/platform/database/prisma';
import { auditAdminStrict } from '@/platform/audit/server';
import { RevisionError } from '@/modules/content/server/revisions';
import type { AuthedUser } from './access';

/** Only the signed-in member may choose marketing consent; channel preferences remain the Notification owner. */
export async function marketingConsent(userId: number) {
  return db.user.findUniqueOrThrow({
    where: {
      id: userId
    },
    select: {
      marketingOptIn: true,
      marketingConsentAt: true
    }
  });
}
export async function setMarketingConsent(req: NextRequest, actor: AuthedUser, enabled: boolean, expected: boolean) {
  return db.$transaction(async tx => {
    const changed = await tx.user.updateMany({
      where: {
        id: actor.id,
        status: 'ACTIVE',
        marketingOptIn: expected
      },
      data: {
        marketingOptIn: enabled,
        marketingConsentAt: new Date()
      }
    });
    if (changed.count !== 1) throw new RevisionError('انتخاب شما هم‌زمان تغییر کرده است؛ صفحه را تازه کنید', 409);
    await auditAdminStrict({
      req,
      actor,
      action: 'notification.marketing_consent',
      targetType: 'User',
      targetId: actor.id,
      metadata: {
        enabled
      }
    }, tx);
    return tx.user.findUniqueOrThrow({
      where: {
        id: actor.id
      },
      select: {
        marketingOptIn: true,
        marketingConsentAt: true
      }
    });
  });
}
