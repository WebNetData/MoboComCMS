import { theme as t0 } from '@/themes/code/clean/client'
import { theme as t1 } from '@/themes/code/minimal/client'
import { theme as t2 } from '@/themes/code/mobocom/client'
import { theme as t3 } from '@/themes/code/orbital/client'
import type { ThemeClientModule } from '@/themes/types'
export const codeThemeClients: Readonly<Record<string, ThemeClientModule>> = {
  'clean': t0,
  'minimal': t1,
  'mobocom': t2,
  'orbital': t3
}
