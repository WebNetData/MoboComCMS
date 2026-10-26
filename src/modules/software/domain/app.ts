// A mobile app's own facts: its package (Android) or bundle (iOS) id, the oldest system it runs on, and its pages on
// app stores. Pure: the save checks each store against the owner's APP_STORE list.

export class AppFieldError extends Error {}

export type AppStoreLink = { store: string; url: string }

/** A package or bundle id: dotted, letters first (com.example.app); empty clears it. */
export function cleanPackageId(value: unknown): string {
  const id = String(value ?? '').trim()
  if (!id) return ''
  if (id.length > 160 || !/^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/.test(id)) throw new AppFieldError('شناسهٔ بسته باید مثل com.example.app باشد')
  return id
}

/** The oldest system version, as written (Android 8.0, iOS 15). */
export const cleanMinOs = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** Store pages: one per store, an http(s) address each, at most eight; rows without both are dropped. */
export function cleanAppStores(input: unknown): AppStoreLink[] {
  let rows: unknown = input
  if (typeof input === 'string') { try { rows = JSON.parse(input || '[]') } catch { rows = [] } }
  const out: AppStoreLink[] = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const store = String((row as AppStoreLink)?.store ?? '').trim().slice(0, 40)
    const url = String((row as AppStoreLink)?.url ?? '').trim()
    if (!store || !url || out.some((link) => link.store === store)) continue
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new AppFieldError(`نشانی فروشگاه «${store}» معتبر نیست`) }
    if (!['http:', 'https:'].includes(parsed.protocol) || url.length > 2000 || /[\s<>\\]/.test(url)) throw new AppFieldError(`نشانی فروشگاه «${store}» معتبر نیست`)
    out.push({ store, url })
    if (out.length === 8) break
  }
  return out
}
