import { getSettings } from '@/modules/settings/server'
export async function brandVars() {
  const settings = await getSettings().catch(() => ({} as Record<string, string>))
  return { brand: settings.brandName || 'موبوکام', site: (settings.siteUrl || process.env.NEXTAUTH_URL || '').replace(/\/+$/, '') }
}
