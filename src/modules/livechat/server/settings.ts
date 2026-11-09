import { createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server/section-history'
import { normalizeChatSettings, ChatError, type ChatSettings } from '../domain/livechat'

const KEY = 'livechat.v1'
const chatHistory = createSectionSettingsHistory(KEY, 'settings-livechat', normalizeChatSettings, settings => ({ botEnabled: settings.botEnabled, hours: settings.hours.enabled }), { action: 'livechat.settings', targetId: 'livechat' })
export const chatSettingsState = chatHistory.current
export const restoreChatSettings = chatHistory.restore

export async function getChatSettings(): Promise<ChatSettings> {
  // Placement must reflect the saved selection on the next navigation, across route caches.
  return chatHistory.read()
}

export async function saveChatSettings(input: unknown, context?: SectionSettingsContext) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ChatError('تنظیمات گفت‌وگو معتبر نیست')
  return chatHistory.save(input, context)
}
