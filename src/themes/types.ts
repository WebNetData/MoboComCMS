import type { ComponentType } from 'react'
import type { SiteConfig } from '@/modules/site/config/types'
import type { LandingData } from '@/modules/site/domain/homepage'
import type { Locale } from '@/i18n/dictionaries'

export interface ThemeHeaderProps { theme: string; navPages?: { slug: string; title: string; titleEn: string }[]; breadcrumbs?: { label: string; href?: string }[] }
export interface ThemeFooterProps { navPages?: { slug: string; title: string; titleEn: string }[] }
export interface ThemeHomeProps { site: SiteConfig; locale: Locale; data: LandingData }
export interface ThemeClientModule { Header?: ComponentType<ThemeHeaderProps>; Footer?: ComponentType<ThemeFooterProps> }
export interface ThemeServerModule { Home?: ComponentType<ThemeHomeProps> }
