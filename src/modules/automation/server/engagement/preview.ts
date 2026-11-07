import { db } from '@/platform/database/prisma';
import { getSettings } from '@/modules/settings/server';
import { EngagementError, normalizeEngagement, engagementMessage, MARKETING_EVENTS } from '../../domain/engagement';
import { inEngagementWindow } from '../../domain/engagement-clock';
import { engagementAudience } from './audience';

/** An explicit bounded sample: never a count of the entire audience and never a send. */
export async function previewEngagement(input: unknown, journeyId: string, now = new Date()) {
  const settings = normalizeEngagement(input),
    journey = settings.journeys.find(item => item.id === journeyId);
  if (!journey) throw new EngagementError('ارتباط را انتخاب کنید');
  const [members, site] = await Promise.all([db.user.findMany({
    where: {
      status: 'ACTIVE',
      marketingOptIn: true,
      role: {
        not: 'ADMIN'
      }
    },
    orderBy: {
      id: 'asc'
    },
    take: 50,
    select: {
      id: true,
      name: true
    }
  }), getSettings()]);
  const sample: {
      id: number;
      name: string;
      title: string;
      body: string;
      href: string;
    }[] = [],
    reasons: Record<string, number> = {};
  let eligible = 0;
  for (const member of members) {
    const result = await engagementAudience(journey, settings, member.id, now);
    if (!result.eligible) {
      reasons[result.reason] = (reasons[result.reason] || 0) + 1;
      continue;
    }
    eligible++;
    if (sample.length < 10) {
      const values = {
        name: result.name,
        product: result.product,
        brand: site.brandName || 'موبوکام'
      };
      sample.push({
        id: member.id,
        name: result.name,
        title: engagementMessage(journey.title, values),
        body: engagementMessage(journey.body, values),
        href: result.href
      });
    }
  }
  return {
    scanned: members.length,
    eligible,
    sample,
    reasons,
    limit: 50,
    contactWindowOpen: inEngagementWindow(settings, now),
    enabled: settings.enabled && journey.enabled
  };
}
export async function engagementOverview(userId?: number) {
  const since = new Date(Date.now() - 30 * 86400000),
    where = {
      kind: {
        in: [...MARKETING_EVENTS]
      },
      createdAt: {
        gte: since
      },
      ...(userId ? {
        userId
      } : {})
    };
  const [total, notices, consenting] = await Promise.all([db.automationEvent.count({
    where: { name: 'crm.engagement.queued', createdAt: { gte: since }, ...(userId ? { userId } : {}) }
  }), db.userNotification.findMany({
    where,
    orderBy: {
      id: 'desc'
    },
    take: 40,
    select: {
      id: true,
      userId: true,
      kind: true,
      titleFa: true,
      marketingSource: true,
      deliveryChannels: true,
      createdAt: true,
      readAt: true,
      expiresAt: true
    }
  }), db.user.count({
    where: {
      status: 'ACTIVE',
      marketingOptIn: true,
      role: {
        not: 'ADMIN'
      }
    }
  })]);
  const keys = notices.flatMap(n => ['sms', 'email', 'push'].map(channel => `notification:${n.id}:${channel}`)),
    jobs = await db.backgroundJob.findMany({
      where: {
        kind: 'notification.deliver',
        dedupeKey: {
          in: keys
        }
      },
      select: {
        dedupeKey: true,
        status: true,
        attempts: true,
        runAt: true,
        finishedAt: true,
        result: true
      }
    });
  return {
    total,
    consenting,
    notices: notices.map(notice => ({
      ...notice,
      journeyId: notice.marketingSource.split(':')[0],
      deliveries: jobs.filter(job => job.dedupeKey?.startsWith(`notification:${notice.id}:`)).map(job => ({
        channel: job.dedupeKey!.split(':')[2],
        status: job.status,
        attempts: job.attempts,
        runAt: job.runAt,
        finishedAt: job.finishedAt,
        result: job.result
      }))
    }))
  };
}
