import type { Prisma } from '@prisma/client';
import { db } from '@/platform/database/prisma';
import { memberDateField } from '@/modules/identity/server/profile-fields';
import { customerSegment } from '@/modules/livechat/domain/livechat';
import { isStoreEnabled } from '@/modules/catalog/server/storefront';
import { publicProductWhere } from '@/modules/catalog/domain/product-publication';
import { stockAlertAvailable } from '@/modules/store/domain/marketing';
import type { EngagementJourney, EngagementSettings } from '../../domain/engagement';
import { birthdayAnniversary, journeyDatesAllow, journeyPeriod } from '../../domain/engagement-clock';
export type AudienceResult = {
  eligible: false;
  reason: string;
} | {
  eligible: true;
  period: string;
  name: string;
  product: string;
  href: string;
  segment: string;
};
export async function engagementAudience(journey: EngagementJourney, settings: EngagementSettings, userId: number, now: Date, reader: Prisma.TransactionClient = db): Promise<AudienceResult> {
  const no = (reason: string): AudienceResult => ({
    eligible: false,
    reason
  });
  if (!journeyDatesAllow(journey, now)) return no('outside-dates');
  const user = await reader.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      status: true,
      role: true,
      name: true,
      marketingOptIn: true,
      lastLoginAt: true,
      createdAt: true
    }
  });
  if (!user || user.status !== 'ACTIVE' || user.role === 'ADMIN') return no('inactive-account');
  if (!user.marketingOptIn) return no('no-consent');
  if (journey.tags.length && !(await reader.crmTag.count({
    where: {
      userId,
      tag: {
        in: journey.tags
      }
    }
  }))) return no('tag-mismatch');
  let segment = 'all';
  if (journey.segment !== 'all') {
    const [orders, last] = await Promise.all([reader.order.count({
      where: {
        userId,
        status: 'PAID'
      }
    }), reader.order.findFirst({
      where: {
        userId,
        status: 'PAID'
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        createdAt: true
      }
    })]);
    segment = customerSegment({
      orders,
      spendToman: 0,
      lastOrderAt: last?.createdAt || null,
      openTickets: 0
    }, now).segment.key;
    if (segment !== journey.segment) return no('segment-mismatch');
  }
  if (journey.kind === 'winback' && now.getTime() - (user.lastLoginAt || user.createdAt).getTime() < journey.inactiveDays * 86400000) return no('recently-active');
  let period = journeyPeriod(journey, now);
  if (journey.kind === 'birthday') {
    const anniversary = birthdayAnniversary(await memberDateField(userId, settings.birthdayField, reader), settings, now);
    if (!anniversary) return no('not-birthday');
    period = anniversary;
  }
  let product = '',
    href = journey.href;
  if (journey.productId) {
    if (!(await isStoreEnabled())) return no('store-disabled');
    const item = await reader.product.findFirst({
      where: {
        id: journey.productId,
        ...publicProductWhere
      },
      select: {
        id: true,
        name: true,
        slug: true,
        stock: true,
        active: true,
        approval: true,
        variants: {
          where: {
            active: true
          },
          select: {
            id: true,
            stock: true
          }
        },
        _count: {
          select: {
            variants: true
          }
        }
      }
    });
    if (!item) return no('product-unavailable');
    if (!stockAlertAvailable({
      ...item,
      variantCount: item._count.variants
    }, 0)) return no('out-of-stock');
    if (journey.kind === 'product-interest' && !(await reader.itemFavorite.findFirst({
      where: {
        userId,
        itemType: 'product',
        itemId: item.id,
        notify: true
      },
      select: {
        userId: true
      }
    }))) return no('not-following');
    if (journey.purchaseQuietDays && (await reader.order.findFirst({
      where: {
        userId,
        status: 'PAID',
        createdAt: {
          gte: new Date(now.getTime() - journey.purchaseQuietDays * 86400000)
        },
        OR: [{
          productId: item.id
        }, {
          lines: {
            some: {
              productId: item.id
            }
          }
        }]
      },
      select: {
        id: true
      }
    }))) return no('recent-purchase');
    product = item.name;
    href = '/products/' + encodeURIComponent(item.slug);
  }
  return {
    eligible: true,
    period,
    name: user.name || 'کاربر',
    product,
    href,
    segment
  };
}
