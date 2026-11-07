import { db } from '@/platform/database/prisma';
import { createInboxEvent } from '@/modules/notifications/server/inbox';
import { getSettings } from '@/modules/settings/server';
import { eventForJourney, engagementMessage } from '../../domain/engagement';
import { engagementClock, endOfEngagementDay, inEngagementWindow } from '../../domain/engagement-clock';
import { getEngagementSettings, journeySource } from './settings';
import { engagementAudience } from './audience';

/** Canonical inbox/delivery jobs plus fresh consent/pressure predicates commit as one serializable decision. */
export async function queueEngagement(journeyId: string, userId: number, now = new Date()): Promise<{
  queued: boolean;
  reason: string;
}> {
  const site = await getSettings(),
    brand = site.brandName || 'موبوکام';
  for (let attempt = 0;; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const settings = await getEngagementSettings(tx),
          journey = settings.journeys.find(item => item.id === journeyId);
        if (!settings.enabled || !journey?.enabled) return {
          queued: false,
          reason: 'disabled'
        };
        if (!inEngagementWindow(settings, now)) return {
          queued: false,
          reason: 'contact-window'
        };
        const audience = await engagementAudience(journey, settings, userId, now, tx);
        if (!audience.eligible) return {
          queued: false,
          reason: audience.reason
        };
        const dedupeKey = journey.kind === 'birthday' ? `crm:birthday:${settings.birthdayCalendar}:${audience.period}:${userId}` : `crm:${journey.id}:${userId}:${audience.period}`;
        if (await tx.automationEvent.findUnique({
          where: {
            dedupeKey
          },
          select: {
            id: true
          }
        })) return {
          queued: false,
          reason: 'already-queued'
        };
        if (journey.kind !== 'birthday' && journey.cadenceDays) {
          const recent = await tx.automationEvent.findFirst({
            where: {
              userId,
              name: 'crm.engagement.queued',
              dedupeKey: {
                startsWith: `crm:${journey.id}:${userId}:`
              },
              createdAt: {
                gt: new Date(now.getTime() - journey.cadenceDays * 86400000)
              }
            },
            select: {
              id: true
            }
          });
          if (recent) return {
            queued: false,
            reason: 'cadence-not-due'
          };
        }
        const dayStart = engagementClock(now).dayStart,
          weekStart = new Date(dayStart.getTime() - 6 * 86400000);
        const [daily, weekly] = await Promise.all([dayStart, weekStart].map(from => tx.automationEvent.count({
          where: {
            userId,
            name: 'crm.engagement.queued',
            createdAt: {
              gte: from
            }
          }
        })));
        if (daily >= settings.dailyCap || weekly >= settings.weeklyCap) return {
          queued: false,
          reason: 'frequency-cap'
        };
        const values = {
          name: audience.name,
          product: audience.product,
          brand
        };
        // Existing Automation owns the minimal durable receipt. It is already processed:
        // only the canonical inbox/queue owns delivery; purging an inbox cannot resend it.
        await tx.automationEvent.create({ data: { name: 'crm.engagement.queued', subjectKey: `user:${userId}`, userId, dedupeKey, payload: JSON.stringify({ journeyId: journey.id, kind: journey.kind }), createdAt: now, processedAt: now } });
        await createInboxEvent({
          userId,
          kind: eventForJourney(journey.kind),
          dedupeKey,
          titleFa: engagementMessage(journey.title, values),
          titleEn: '',
          bodyFa: engagementMessage(journey.body, values),
          bodyEn: '',
          href: audience.href,
          channels: journey.channels,
          marketingSource: journeySource(journey),
          expiresAt: endOfEngagementDay(engagementClock(now).day)
        }, tx);
        return {
          queued: true,
          reason: 'queued'
        };
      }, {
        isolationLevel: 'Serializable',
        timeout: 15000,
        maxWait: 10000
      });
    } catch (error) {
      const failure = error as {
        code?: string;
        meta?: {
          code?: string;
        };
      };
      // Parameterized INSERTs report PostgreSQL serialization/deadlock SQLSTATE through P2010.
      const retryable = ['P2034', 'P2002'].includes(String(failure.code)) || failure.code === 'P2010' && ['40001', '40P01'].includes(String(failure.meta?.code));
      if (attempt >= 3 || !retryable) throw error;
    }
  }
}
