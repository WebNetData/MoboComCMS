import t0 from '@/themes/code/clean/manifest.json'
import t1 from '@/themes/code/minimal/manifest.json'
import t2 from '@/themes/code/mobocom/manifest.json'
import t3 from '@/themes/code/orbital/manifest.json'
import type { ThemeManifest } from '@/modules/site/config/types'
export const codeThemeCatalog = [t0, t1, t2, t3] as const
export const codeThemeDesigns: readonly ThemeManifest[] = codeThemeCatalog.map(theme => theme.design as ThemeManifest)
