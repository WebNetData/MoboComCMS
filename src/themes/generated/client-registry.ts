import { theme as t0 } from '@/themes/code/minimal/client'
import { theme as t1 } from '@/themes/code/orbital/client'
import type { ThemeClientModule } from '@/themes/types'
export const codeThemeClients: Readonly<Record<string, ThemeClientModule>> = {
  'minimal': t0,
  'orbital': t1
}
