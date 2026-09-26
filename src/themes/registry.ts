import type { ThemeManifest } from '@/modules/site/config/types'
import { EXTENSION_API_VERSION, assertUniqueExtensionIds, type ExtensionManifest } from '@/platform/extensions/contracts'
import { codeThemeDesigns } from '@/themes/generated/catalog'

/** Register independently maintained bundled themes here. */
export const bundledThemes: ThemeManifest[] = [
  { id: 'noir', name: 'Happ Noir', description: 'زغالی عمیق، سبز نئونی و جزئیات تکنولوژی', version: '1.0.0', radius: 20, colors: { background: '#090d0c', surface: '#111916', accent: '#b6f76b', text: '#eef3ec', muted: '#94a399', border: '#26332b' } },
  { id: 'aurora', name: 'Aurora', description: 'آبی نیمه‌شب با درخشش بنفش', version: '1.0.0', radius: 24, colors: { background: '#0c1020', surface: '#141a30', accent: '#b4a0ff', text: '#f1effa', muted: '#a0a6bf', border: '#2a314c' } },
  { id: 'graphite', name: 'Graphite', description: 'خاکستری مینیمال با رنگ یخی', version: '1.0.0', radius: 10, colors: { background: '#101214', surface: '#191c20', accent: '#92dfed', text: '#f1f3f4', muted: '#a2acb5', border: '#30373d' } },
  ...codeThemeDesigns,
]

export const themeCatalog: readonly ExtensionManifest[] = bundledThemes.map((theme) => ({
  id: theme.id,
  name: theme.name,
  description: theme.description,
  version: theme.version,
  kind: 'theme',
  apiVersion: EXTENSION_API_VERSION,
  capabilities: ['ui'],
}))

assertUniqueExtensionIds(themeCatalog)
