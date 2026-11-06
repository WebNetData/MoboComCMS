export type SiteIdentity = {
  favicon?: string; appleIcon?: string; appIcon?: string; maskableIcon?: string
  shortName?: string; themeColor?: string; backgroundColor?: string
}
const assets = ['favicon', 'appleIcon', 'appIcon', 'maskableIcon'] as const
const keys = [...assets, 'shortName', 'themeColor', 'backgroundColor']
export function identityAsset(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) return false
  if (!value) return true
  if (/^\/(?!\/)/.test(value)) return true
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password } catch { return false }
}
export function validSiteIdentity(value: unknown): value is SiteIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).every(k => keys.includes(k)) && assets.every(k => v[k] === undefined || identityAsset(v[k]))
    && (v.shortName === undefined || (typeof v.shortName === 'string' && v.shortName.length <= 30 && !/[<>\u0000-\u001f]/.test(v.shortName)))
    && ['themeColor', 'backgroundColor'].every(k => v[k] === undefined || v[k] === '' || (typeof v[k] === 'string' && /^#[0-9a-f]{6}$/i.test(v[k])))
}
export const siteIcons = (identity: SiteIdentity = {}) => ({ icon: identity.favicon || '/favicon.svg', apple: identity.appleIcon || '/pwa-icon/180', shortcut: identity.favicon || '/favicon.svg' })
export function appIcons(identity: SiteIdentity = {}) {
  const icons = identity.appIcon ? [{ src: identity.appIcon, sizes: 'any', purpose: 'any' as const }] : [192, 512].map(size => ({ src: `/pwa-icon/${size}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' as const }))
  return [...icons, ...(identity.maskableIcon ? [{ src: identity.maskableIcon, sizes: 'any', purpose: 'maskable' as const }] : identity.appIcon ? [] : [{ src: '/pwa-icon/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const }])]
}
