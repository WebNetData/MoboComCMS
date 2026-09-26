import { DefaultThemeHome } from '@/themes/sdk/server'
import type { ThemeServerModule } from '@/themes/types'

const Home: NonNullable<ThemeServerModule['Home']> = (props) => <div data-code-theme="minimal"><DefaultThemeHome {...props}/></div>
export const theme: ThemeServerModule = { Home }
