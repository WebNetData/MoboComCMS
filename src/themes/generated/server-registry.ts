import { theme as t0 } from '@/themes/code/minimal/home'
import { theme as t1 } from '@/themes/code/orbital/home'
import type { ThemeServerModule } from '@/themes/types'
export const codeThemeServers: Readonly<Record<string, ThemeServerModule>> = {
  'minimal': t0,
  'orbital': t1
}
