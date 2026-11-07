import { createHash } from 'node:crypto';
import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server';
import { normalizeEngagement, type EngagementJourney } from '../../domain/engagement';
export const ENGAGEMENT_SETTINGS_KEY = 'crm.engagement.v1';
const owner = () => createSectionSettingsHistory(ENGAGEMENT_SETTINGS_KEY, 'settings-crm-engagement', normalizeEngagement, settings => ({
  enabled: settings.enabled,
  journeys: settings.journeys.length
}), {
  action: 'crm.engagement.settings',
  targetId: ENGAGEMENT_SETTINGS_KEY
});
export const getEngagementSettings = (...args: Parameters<ReturnType<typeof owner>['read']>) => owner().read(...args);
export const saveEngagementSettings = (input: unknown, context: SectionSettingsContext) => owner().save(input, context);
export const engagementSettingsState = () => owner().current();
export const restoreEngagementSettings = (...args: Parameters<ReturnType<typeof owner>['restore']>) => owner().restore(...args);
/** A queued message cannot silently acquire a new audience, channel, link or text after an edit. */
export const journeyVersion = (journey: EngagementJourney) => createHash('sha256').update(JSON.stringify(journey)).digest('hex');
export const journeySource = (journey: EngagementJourney) => `${journey.id}:${journeyVersion(journey)}`;
