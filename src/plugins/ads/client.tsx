'use client'

import PromoSlot from './PromoSlot'
import type { PluginClientModule } from '../types'

// The default places for the built-in placements. Themes and pages may also drop
// <PromoSlot placement="…" /> anywhere (article pages do, for content-top/bottom).
const at = (placement: string) => function Slot() { return <PromoSlot placement={placement} /> }

export const plugin: PluginClientModule = {
  ui: [
    { slot: 'site.after-header', Component: at('header-banner'), order: 50 },
    { slot: 'home.before-main', Component: at('home-top'), order: 50 },
    { slot: 'home.after-main', Component: at('home-middle'), order: 50 },
    { slot: 'site.before-footer', Component: at('footer-banner'), order: 50 },
    { slot: 'site.after-footer', Component: at('sticky-bottom'), order: 50 },
  ],
}
