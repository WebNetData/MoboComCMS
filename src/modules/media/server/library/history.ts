import { createSectionSettingsHistory } from '@/modules/settings/server/section-history'
import { MEDIA_SETTINGS_KEY, normalizeMediaSettings } from './settings'
const history = createSectionSettingsHistory(MEDIA_SETTINGS_KEY, 'settings-media', raw => normalizeMediaSettings(raw as Record<string, unknown> || {}))
export const mediaSettingsState = history.current
export const restoreMediaSettings = history.restore
