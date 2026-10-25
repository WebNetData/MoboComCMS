// WCAG contrast for the site's own colours: which ink reads on a colour, and the nearest shade of a colour that reads as
// text on given backgrounds. Pure; #rrggbb only (the theme contract's format).

const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const rgb = (hex: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (parts: number[]) => `#${parts.map((p) => Math.round(Math.min(255, Math.max(0, p))).toString(16).padStart(2, '0')).join('')}`

export function luminance(hex: string): number {
  const c = rgb(hex)
  return c ? 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]) : 0
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** The ink (near-black or white) that reads best on a coloured surface, e.g. a button in the site accent. */
export function readableInk(background: string, dark = '#0b1020', light = '#ffffff'): string {
  return contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light
}

/**
 * The colour itself when it already reads as text (≥ target) on every background; otherwise the nearest shade toward
 * black (light backgrounds) or white (dark backgrounds) that does. Keeps the owner's hue, changes only as much as needed.
 */
export function textShade(color: string, backgrounds: string[], target = 4.5): string {
  const base = rgb(color)
  if (!base) return color
  const reads = (hex: string) => backgrounds.every((bg) => !rgb(bg) || contrastRatio(hex, bg) >= target)
  if (reads(color)) return color.toLowerCase()
  const lightBackgrounds = backgrounds.filter((bg) => rgb(bg)).every((bg) => luminance(bg) > 0.4)
  const toward = lightBackgrounds ? [0, 0, 0] : [255, 255, 255]
  for (let step = 1; step <= 20; step++) {
    const mix = step / 20
    const shade = toHex(base.map((v, i) => v + (toward[i] - v) * mix))
    if (reads(shade)) return shade
  }
  return lightBackgrounds ? '#000000' : '#ffffff'
}
