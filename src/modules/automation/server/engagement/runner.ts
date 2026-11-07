import { db } from '@/platform/database/prisma';
import { logEvent } from '@/platform/observability/logger';
import { getEngagementSettings, journeyVersion } from './settings';
import { queueEngagement } from './queue';
import { engagementClock, inEngagementWindow, journeyDatesAllow } from '../../domain/engagement-clock';
type Cursor = {
  day: string;
  version: string;
  after: number;
  nextAt: number;
};
/** The scheduler already owns its lease. Cursor claims are still safe if a lease expires mid-batch. */
export async function runCrmEngagement(now = new Date()) {
  const settings = await getEngagementSettings();
  if (!settings.enabled || !inEngagementWindow(settings, now)) return {
    scanned: 0,
    queued: 0,
    skipped: 'disabled-or-contact-window'
  };
  const journeys = settings.journeys.filter(j => j.enabled && journeyDatesAllow(j, now)).sort((a, b) => Number(b.kind === 'birthday') - Number(a.kind === 'birthday'));
  let scanned = 0,
    queued = 0;
  const reasons: Record<string, number> = {};
  const take = Math.max(1, Math.floor(settings.batchSize / Math.max(1, journeys.length))),
    day = engagementClock(now).day;
  for (const journey of journeys) {
    if (scanned >= settings.batchSize) break;
    const key = `crm.engagement.cursor.${journey.id}`,
      row = await db.setting.findUnique({
        where: {
          key
        },
        select: {
          value: true
        }
      }),
      version = journeyVersion(journey);
    let cursor: Cursor = {
      day,
      version,
      after: 0,
      nextAt: 0
    };
    if (row) {
      try {
        const saved = JSON.parse(row.value) as Cursor;
        if (saved.day === day && saved.version === version && Number.isSafeInteger(saved.after) && saved.after >= 0 && Number.isFinite(saved.nextAt)) cursor = saved;
      } catch {
        throw new Error('CRM cursor is unreadable; not advancing');
      }
    }
    if (cursor.nextAt > now.getTime()) continue;
    const members = await db.user.findMany({
      where: {
        id: {
          gt: cursor.after
        },
        status: 'ACTIVE',
        marketingOptIn: true,
        role: {
          not: 'ADMIN'
        }
      },
      orderBy: {
        id: 'asc'
      },
      take,
      select: {
        id: true
      }
    });
    for (const member of members) {
      const result = await queueEngagement(journey.id, member.id, now);
      scanned++;
      if (result.queued) queued++;
      reasons[result.reason] = (reasons[result.reason] || 0) + 1;
    }
    const done = members.length < take,
      next: Cursor = {
        day,
        version,
        after: done ? 0 : members.at(-1)!.id,
        nextAt: done ? now.getTime() + 3600000 : 0
      },
      value = JSON.stringify(next);
    if (row) await db.setting.updateMany({
      where: {
        key,
        value: row.value
      },
      data: {
        value
      }
    });else {
      try {
        await db.setting.create({
          data: {
            key,
            value
          }
        });
      } catch (error) {
        if ((error as {
          code?: string;
        }).code !== 'P2002') throw error;
      }
    }
  }
  if (queued) logEvent('info', 'crm.engagement.queued', {
    scanned,
    queued
  });
  return {
    scanned,
    queued,
    reasons
  };
}
