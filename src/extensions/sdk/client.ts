export { useExtensions } from '@/extensions/client/ExtensionProvider'
export { useI18n as useExtensionI18n } from '@/i18n/LocaleProvider'
export type {
  ExtensionUiSlot,
  ExtensionManifest,
  ExtensionSettingDefinition,
  ExtensionSiteContext,
  ExtensionLocalText,
} from '@/platform/extensions/contracts'

import type { ExtensionLocalText } from '@/platform/extensions/contracts'

export function translateExtensionText(value: ExtensionLocalText, locale: string) {
  return value[locale] || value[locale.split('-')[0]] || value.en || value.fa
}
export { default as Link } from '@/platform/routing/Link'
