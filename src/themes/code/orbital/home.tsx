import type { ThemeServerModule } from '@/themes/types'
import OrbitalHome from './homepage'

const Home: NonNullable<ThemeServerModule['Home']> = (props) => <div data-code-theme="orbital"><OrbitalHome {...props} /></div>

export const theme: ThemeServerModule = { Home }
