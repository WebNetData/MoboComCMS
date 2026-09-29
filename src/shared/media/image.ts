/**
 * Resized copies of site images: images stored by the site
 * (/api/media/covers/<id>.webp|png|jpg) can be requested at a width, and are
 * served as cached WebP. Other addresses are returned unchanged.
 */

export const IMAGE_WIDTHS = [160, 320, 480, 640, 960, 1280] as const
const OWN = /^\/api\/media\/covers\/[0-9a-f-]{36}\.(webp|png|jpg)$/

/** The nearest allowed width at or above the requested one. */
export const snapWidth = (width: number) => IMAGE_WIDTHS.find((w) => w >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]

export function sized(src: string | null | undefined, width: number): string {
  const value = String(src || '')
  return OWN.test(value) ? `${value}?w=${snapWidth(width)}` : value
}

/** srcset for 1× and 2× screens (empty when the image is not a site image). */
export function srcSet(src: string | null | undefined, width: number): string | undefined {
  const value = String(src || '')
  return OWN.test(value) ? `${value}?w=${snapWidth(width)} 1x, ${value}?w=${snapWidth(width * 2)} 2x` : undefined
}
