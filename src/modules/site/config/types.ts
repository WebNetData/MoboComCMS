export type LocalText = { fa: string; en: string; [locale: string]: string }
export type SiteLink = { label: LocalText; href: string }
export type ContentItem = { title: LocalText; text: LocalText; icon: string; href: string }
export type SectionKind = 'hero' | 'features' | 'plans' | 'network' | 'steps' | 'apps' | 'products' | 'posts' | 'faq' | 'cta' | 'form'
export type SiteSection = { id: string; kind: SectionKind; enabled: boolean; eyebrow: LocalText; title: LocalText; description: LocalText; items: ContentItem[]; action: SiteLink; formSlug: string; image?: string }
export type ThemeColors = { background: string; surface: string; accent: string; text: string; muted: string; border: string }
export type ThemeManifest = { id: string; name: string; description: string; version: string; extends?: string; colors: ThemeColors; lightColors?: ThemeColors; radius: number }
export type SiteFonts = { body: string; heading: string }
export type SiteConfig = {
  publicApiEnabled?: boolean
  copy?: Record<string, LocalText>
  logo?: string
  fonts?: SiteFonts
  customCss?: string
  version: 1; brand: string; tagline: LocalText; announcement: { enabled: boolean; text: LocalText; link: SiteLink }
  navigation: SiteLink[]; footer: SiteLink[]; copyright: LocalText
  themeId: string; themes: ThemeManifest[]; /** @deprecated runtime extension state lives outside SiteConfig */ plugins: Record<string, boolean>; sections: SiteSection[]
}
export const local = (fa: string, en: string): LocalText => ({ fa, en })
export const translate = (value: LocalText, locale: string) => value[locale] || value[locale.split('-')[0]] || value.en || value.fa
/** Font stacks used when the site has no custom font preference. */
export const defaultSiteFonts = (locale: string): SiteFonts => ({
  body: locale === 'fa' ? "'Vazirmatn',var(--sds-typography-family-sans)" : 'var(--sds-typography-family-sans)',
  heading: locale === 'fa' ? "'Vazirmatn',var(--sds-typography-family-sans)" : 'var(--sds-typography-family-sans)',
})
