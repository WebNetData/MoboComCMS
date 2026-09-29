import { DefaultThemeHome } from '@/themes/sdk/server'
import type { ThemeHomeProps } from '@/themes/sdk/server'
import type { ThemeServerModule } from '@/themes/types'

/**
 * Server part of a theme: the home page. It receives ready-made data (site settings, locale, latest posts,
 * products …) — a theme never queries the database, decides prices or checks permissions.
 * Here the default home page is kept and a strip is added above it; a full theme would map `props.site.sections` itself.
 */
function EditorialHome(props: ThemeHomeProps) {
  const fa = props.locale === 'fa'
  const tagline = props.site.tagline[props.locale] || props.site.tagline.fa
  return <>
    <div className="ed-strip" role="note"><span>{fa ? 'سرمقالهٔ امروز' : "Today's editorial"}</span><b>{tagline}</b></div>
    <DefaultThemeHome {...props} />
  </>
}

export const theme: ThemeServerModule = { Home: EditorialHome }
