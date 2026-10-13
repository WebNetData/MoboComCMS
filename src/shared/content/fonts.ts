// The fonts a writer may give to a piece of text. One list: the editor offers exactly these, and the server's
// cleaning keeps a font-family only when it is one of them — so a style attribute can never name a remote font
// or smuggle anything else in. The first two are the site's own faces; the rest are in public/fonts/editor.

export interface ContentFont { family: string; fa: string; en: string; fallback: 'sans-serif' | 'serif' | 'monospace' }

export const CONTENT_FONTS: readonly ContentFont[] = [
  { family: 'HappVazirmatn', fa: 'وزیرمتن (پیش‌فرض)', en: 'Vazirmatn (default)', fallback: 'sans-serif' },
  { family: 'HappInter', fa: 'اینتر (لاتین)', en: 'Inter (Latin)', fallback: 'sans-serif' },
  { family: 'MoboEstedad', fa: 'استعداد', en: 'Estedad', fallback: 'sans-serif' },
  { family: 'MoboPlexArabic', fa: 'آی‌بی‌ام پلکس', en: 'IBM Plex Sans Arabic', fallback: 'sans-serif' },
  { family: 'MoboKufi', fa: 'نوتو کوفی', en: 'Noto Kufi Arabic', fallback: 'sans-serif' },
  { family: 'MoboNaskh', fa: 'نوتو نسخ', en: 'Noto Naskh Arabic', fallback: 'serif' },
  { family: 'MoboMarkazi', fa: 'مرکزی', en: 'Markazi Text', fallback: 'serif' },
  { family: 'MoboAmiri', fa: 'امیری', en: 'Amiri', fallback: 'serif' },
  { family: 'MoboLalezar', fa: 'لاله‌زار', en: 'Lalezar', fallback: 'sans-serif' },
]

/**
 * The CSS value of a font: the face, then the site's own face for letters it lacks, then a generic family.
 * The default's value is also the writing area's own font, so the editor's font menu names it instead of
 * showing a raw list.
 */
export const DEFAULT_FONT_STACK = 'HappVazirmatn, HappInter, sans-serif'
export const fontStack = (font: ContentFont) => (font.family === 'HappVazirmatn' ? DEFAULT_FONT_STACK : `${font.family}, HappVazirmatn, ${font.fallback}`)

/** Is this `font-family` value one the editor writes? (quotes and spacing are the browser's to choose) */
export function isContentFontFamily(value: string): boolean {
  const names = value.split(',').map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
  const generic = ['sans-serif', 'serif', 'monospace']
  return names.length > 0 && names.length <= 4 && names.every((name) => generic.includes(name) || CONTENT_FONTS.some((font) => font.family === name)) && CONTENT_FONTS.some((font) => font.family === names[0])
}

export const CONTENT_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64] as const
export const CONTENT_LINE_HEIGHTS = ['1.4', '1.6', '1.8', '2', '2.2', '2.6'] as const
