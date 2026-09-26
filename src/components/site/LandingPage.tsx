import DefaultLandingPage from '@/components/site/default-theme/DefaultLandingPage'
import { codeThemeServers } from '@/themes/generated/server-registry'
import type { ThemeHomeProps } from '@/themes/types'
import { PluginOutlet } from '@/plugins/registry'
import { resolveCodeThemeId } from '@/themes/runtime'

export default function LandingPage(props: ThemeHomeProps) {
  const Home = codeThemeServers[resolveCodeThemeId(props.site)]?.Home || DefaultLandingPage
  return <><PluginOutlet slot="home.before-main" site={props.site} locale={props.locale}/><Home {...props} /><PluginOutlet slot="home.after-main" site={props.site} locale={props.locale}/></>
}
