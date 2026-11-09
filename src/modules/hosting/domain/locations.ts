/**
 * Where a server runs, for choosing between Iranian and foreign datacenters. A product's `location` stays free
 * text; these names are suggested in Admin and recognised here, and older free text is read by keywords.
 */
export type CloudRegion = 'IR' | 'INTL'
export type CloudLocation = { id: string; label: string; country: string; region: CloudRegion }

export const CLOUD_LOCATIONS: readonly CloudLocation[] = [
  { id: 'ir-thr', label: 'ایران، تهران', country: 'IR', region: 'IR' },
  { id: 'ir-tbz', label: 'ایران، تبریز', country: 'IR', region: 'IR' },
  { id: 'ir-mhd', label: 'ایران، مشهد', country: 'IR', region: 'IR' },
  { id: 'ir-ifn', label: 'ایران، اصفهان', country: 'IR', region: 'IR' },
  { id: 'ir-syz', label: 'ایران، شیراز', country: 'IR', region: 'IR' },
  { id: 'de-fsn', label: 'آلمان، فالکن‌اشتاین', country: 'DE', region: 'INTL' },
  { id: 'de-nbg', label: 'آلمان، نورنبرگ', country: 'DE', region: 'INTL' },
  { id: 'de-fra', label: 'آلمان، فرانکفورت', country: 'DE', region: 'INTL' },
  { id: 'fi-hel', label: 'فنلاند، هلسینکی', country: 'FI', region: 'INTL' },
  { id: 'nl-ams', label: 'هلند، آمستردام', country: 'NL', region: 'INTL' },
  { id: 'fr-par', label: 'فرانسه، پاریس', country: 'FR', region: 'INTL' },
  { id: 'gb-lon', label: 'انگلستان، لندن', country: 'GB', region: 'INTL' },
  { id: 'tr-ist', label: 'ترکیه، استانبول', country: 'TR', region: 'INTL' },
  { id: 'ae-dxb', label: 'امارات، دبی', country: 'AE', region: 'INTL' },
  { id: 'us-ash', label: 'آمریکا، ویرجینیا', country: 'US', region: 'INTL' },
  { id: 'sg-sin', label: 'سنگاپور', country: 'SG', region: 'INTL' },
] as const

const IRAN = /ایران|تهران|تبریز|مشهد|اصفهان|شیراز|کرج|قم|اهواز|iran|tehran|tabriz|mashhad|isfahan|shiraz|asiatech|afranet|parsonline|shatel|mobinnet|\bir\b/i

export const REGION_LABEL: Record<CloudRegion, string> = { IR: 'سرور ایران', INTL: 'سرور خارج' }

/** The region of a location text: a listed datacenter, then keywords; empty text has none. */
export function regionOf(location: string): CloudRegion | null {
  const text = location.trim()
  if (!text) return null
  const known = CLOUD_LOCATIONS.find((entry) => entry.label === text || entry.id === text)
  if (known) return known.region
  return IRAN.test(text) ? 'IR' : 'INTL'
}
