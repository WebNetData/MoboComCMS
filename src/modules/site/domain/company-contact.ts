export type CompanyContact = { address: string; phone: string; email: string; telegram: string; instagram: string; x: string; hours: string; latitude: number | null; longitude: number | null; zoom: number; mapEnabled: boolean }
export const emptyCompanyContact = (): CompanyContact => ({ address: '', phone: '', email: '', telegram: '', instagram: '', x: '', hours: '', latitude: null, longitude: null, zoom: 16, mapEnabled: false })
export type ContactNetwork = 'telegram' | 'instagram' | 'x'
const networks = { telegram: { host: 't.me', hosts: ['t.me', 'www.t.me', 'telegram.me'], handle: /^[a-zA-Z0-9_]{5,32}$/ }, instagram: { host: 'www.instagram.com', hosts: ['instagram.com', 'www.instagram.com'], handle: /^[a-zA-Z0-9._]{1,30}$/ }, x: { host: 'x.com', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'], handle: /^[a-zA-Z0-9_]{1,15}$/ } } as const

export function contactSocialHref(network: ContactNetwork, value: string): string {
  if (!value.trim()) return ''
  const rule = networks[network]
  let handle = value.trim().replace(/^@/, '')
  if (value.includes('://')) {
    let url: URL
    try { url = new URL(value) } catch { throw Error('نشانی شبکهٔ اجتماعی معتبر نیست') }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !(rule.hosts as readonly string[]).includes(url.hostname.toLowerCase())) throw Error('نشانی باید متعلق به همان شبکهٔ اجتماعی و بدون پارامتر اضافی باشد')
    handle = url.pathname.replace(/^\/+|\/+$/g, '')
  }
  if (!rule.handle.test(handle)) throw Error('شناسهٔ شبکهٔ اجتماعی معتبر نیست')
  return `https://${rule.host}/${handle}`
}

function coordinate(value: unknown, max: number): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > max) throw Error('مختصات نقشه معتبر نیست')
  return value
}

export function normalizeCompanyContact(value: unknown): CompanyContact {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw Error('اطلاعات تماس معتبر نیست')
  const row = (value || {}) as Record<string, unknown>, result = emptyCompanyContact()
  for (const key of ['address', 'phone', 'email', 'telegram', 'instagram', 'x', 'hours'] as const) {
    const field = row[key] ?? ''
    if (typeof field !== 'string' || field.length > (key === 'address' ? 800 : 500) || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(field)) throw Error('اطلاعات تماس باید متن ساده و کوتاه باشد')
    result[key] = field.trim()
  }
  if (result.phone && (!/^\+?[0-9 ()-]{5,30}$/.test(result.phone) || result.phone.replace(/\D/g, '').length < 7)) throw Error('شماره تماس معتبر نیست؛ از ارقام انگلیسی و کد شهر یا کشور استفاده کنید')
  if (result.email && (result.email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(result.email))) throw Error('ایمیل معتبر نیست')
  for (const network of ['telegram', 'instagram', 'x'] as const) contactSocialHref(network, result[network])
  result.latitude = coordinate(row.latitude, 90); result.longitude = coordinate(row.longitude, 180)
  if ((result.latitude === null) !== (result.longitude === null)) throw Error('عرض و طول جغرافیایی را با هم وارد کنید')
  if (row.mapEnabled !== undefined && typeof row.mapEnabled !== 'boolean') throw Error('وضعیت نمایش نقشه معتبر نیست')
  result.mapEnabled = row.mapEnabled === true
  if (result.mapEnabled && result.latitude === null) throw Error('پیش از نمایش نقشه، محل پین را تعیین کنید')
  if (row.zoom !== undefined && (typeof row.zoom !== 'number' || !Number.isInteger(row.zoom) || row.zoom < 8 || row.zoom > 19)) throw Error('بزرگ‌نمایی نقشه باید بین ۸ تا ۱۹ باشد')
  result.zoom = typeof row.zoom === 'number' ? row.zoom : 16
  return result
}

export function validCompanyContact(value: unknown): value is CompanyContact { try { normalizeCompanyContact(value); return true } catch { return false } }

/** Selected Google marker wins over the map camera or city-level place coordinates. No network access. */
export function coordinatesFromMapLink(value: string): { latitude: number; longitude: number } {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw Error('لینک کامل نقشه را وارد کنید') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.google.com', 'maps.google.com', 'google.com', 'www.openstreetmap.org', 'openstreetmap.org'].includes(url.hostname)) throw Error('لینک کامل Google Maps یا OpenStreetMap را وارد کنید؛ لینک کوتاه را ابتدا در مرورگر باز کنید')
  const pairs = [...(url.pathname+url.search+url.hash).matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)]
  const selected = pairs.at(-1)
  const query = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('ll') || ''
  const pair = selected ? [selected[1], selected[2]] : /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(query)?.slice(1)
    || (url.searchParams.has('mlat') && url.searchParams.has('mlon') ? [url.searchParams.get('mlat'), url.searchParams.get('mlon')] : null)
    || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname)?.slice(1)
  if (!pair || pair.some(part => typeof part !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(part))) throw Error('مختصات در این لینک پیدا نشد؛ لینک کامل پین یا عرض و طول جغرافیایی را وارد کنید')
  const latitude = coordinate(Number(pair[0]), 90), longitude = coordinate(Number(pair[1]), 180)
  return { latitude: latitude!, longitude: longitude! }
}

export function companyMapLinks(contact: CompanyContact) {
  if (contact.latitude === null || contact.longitude === null) return null
  const { latitude: lat, longitude: lon } = contact
  const delta = 180 / 2 ** contact.zoom
  const bbox = [Math.max(-180, lon-delta), Math.max(-90, lat-delta*.65), Math.min(180, lon+delta), Math.min(90, lat+delta*.65)].join(',')
  return { embed: 'https://www.openstreetmap.org/export/embed.html?'+new URLSearchParams({ bbox, layer: 'mapnik', marker: `${lat},${lon}` }), google: 'https://www.google.com/maps/search/?'+new URLSearchParams({ api: '1', query: `${lat},${lon}` }), directions: 'https://www.google.com/maps/dir/?'+new URLSearchParams({ api: '1', destination: `${lat},${lon}` }) }
}
