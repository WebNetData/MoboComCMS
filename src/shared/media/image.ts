/**
 * Resized copies of site images: images stored by the site (covers
 * /api/media/covers/<id>.webp|png|jpg, profile pictures /api/profile/media/<id>.…, and pictures copied into the files
 * storage, /files/download/….webp|png|jpg|avif or by their transfer /api/media/transfers/<id>) can be requested at a
 * width, and are served as cached WebP. Other addresses are returned unchanged.
 */

export const IMAGE_WIDTHS = [160, 320, 480, 640, 960, 1280] as const
const OWN = /^\/api\/media\/covers\/[0-9a-f-]{36}\.(webp|png|jpg)$/
const PROFILE = /^\/api\/profile\/media\/[0-9a-f-]{36}\.(webp|png|jpg)$/
const STORED = /^\/files\/download\/[^?#]+\.(webp|png|jpe?g|avif)$/i
const TRANSFER = /^\/api\/media\/transfers\/[0-9a-f-]{36}$/

/** The nearest allowed width at or above the requested one. */
export const snapWidth = (width: number) => IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]

/** Optional media CDN (NEXT_PUBLIC_MEDIA_CDN, e.g. https://media.example.com) in front of /api/media/covers. */
const CDN = (process.env.NEXT_PUBLIC_MEDIA_CDN || '').replace(/\/+$/, '')

/** The address of a resizable site image (the media CDN fronts covers only), or null for any other address. */
const base = (value: string) => (OWN.test(value) ? `${CDN}${value}` : PROFILE.test(value) || STORED.test(value) || TRANSFER.test(value) ? value : null)

export function sized(src: string | null | undefined, width: number): string {
  const value = String(src || ''), own = base(value)
  return own ? `${own}?w=${snapWidth(width)}` : value
}

/** srcset for 1× and 2× screens (empty when the image is not a site image). */
export function srcSet(src: string | null | undefined, width: number): string | undefined {
  const own = base(String(src || ''))
  return own ? `${own}?w=${snapWidth(width)} 1x, ${own}?w=${snapWidth(width * 2)} 2x` : undefined
}
