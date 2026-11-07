/** Public notification-policy boundary. No queue, transport or financial side effects. */
import { db } from '@/platform/database/prisma';
import { engagementAudience } from './engagement/audience';
import { getEngagementSettings, journeySource } from './engagement/settings';
import { inEngagementWindow, nextEngagementOpening } from '../domain/engagement-clock';
import { eventForJourney, isMarketingKind } from '../domain/engagement';
export async function engagementDeliveryPolicy(event: {
  userId: number;
  kind: string;
  marketingSource: string;
  expiresAt: Date | null;
}, now: Date): Promise<{
  allowed: boolean;
  reason: string;
  deferUntil?: Date;
}> {
  const settings = await getEngagementSettings();
  if (!settings.enabled || !isMarketingKind(event.kind)) return {
    allowed: false,
    reason: 'marketing-disabled'
  };
  if (!event.expiresAt || event.expiresAt <= now) return {
    allowed: false,
    reason: 'marketing-expired'
  };
  const journey = settings.journeys.find(item => journeySource(item) === event.marketingSource);
  if (!journey?.enabled || eventForJourney(journey.kind) !== event.kind) return {
    allowed: false,
    reason: 'journey-paused-or-changed'
  };
  const audience = await engagementAudience(journey, settings, event.userId, now, db);
  if (!audience.eligible) return {
    allowed: false,
    reason: audience.reason
  };
  if (!inEngagementWindow(settings, now)) return {
    allowed: false,
    reason: 'contact-window',
    deferUntil: nextEngagementOpening(settings, now)
  };
  return {
    allowed: true,
    reason: 'eligible'
  };
}
