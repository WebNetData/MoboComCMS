export { businessDirectory, businessPage, businessAdminData, waitingForModeration } from './queries'
export { saveBusinessProfile, writeBusinessProfile } from './commands'
export { businessTrustPolicy } from './trust-policy'
export { myBusinessTrust } from './trust-queries'
export { myBusinessRequests, businessRequestPolicy } from './requests'
export { submitBusinessExperience, decideBusinessExperience, respondToBusinessExperience } from './experiences'
export { businessSettingsState, saveBusinessSettings, restoreBusinessSettings } from './settings-history'

/** The owner's active fields of activity, in order: what a member may choose when suggesting a business. */
export async function businessCategoryNames(): Promise<string[]> {
  const { activeLists } = await import('@/modules/vocabulary/server/vocabulary')
  return ((await activeLists('businesses')).CATEGORY ?? []).map((entry) => entry.code)
}
