import { theme as t0 } from '@/themes/code/clean/home'
import { theme as t1 } from '@/themes/code/minimal/home'
import { theme as t2 } from '@/themes/code/orbital/home'
import type { ThemeServerModule } from '@/themes/types'
export const codeThemeServers: Readonly<Record<string, ThemeServerModule>> = {
  'clean': t0,
  'minimal': t1,
  'orbital': t2
}
