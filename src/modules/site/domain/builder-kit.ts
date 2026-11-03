// The builder's global kit: the brand colours, type and shapes every built page shares. Set once, read by every block
// through CSS variables on the page's root, and by advanced style through `kit:cN` colours. As everywhere in the
// builder, only listed choices and hex colours are stored, so the CSS written from them holds nothing a person typed.

export const KIT_COLOR_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const
export type KitColorId = typeof KIT_COLOR_IDS[number]
// 'theme' (and weight 0) leaves the site's own look: an untouched kit writes no CSS, so existing pages stay as they are.
export const KIT_FONTS = ['theme', 'vazir', 'inter', 'system'] as const
export const KIT_WEIGHTS = [0, 600, 700, 800, 900] as const
export const KIT_SCALES = ['theme', 'compact', 'normal', 'large'] as const
export const KIT_RADII = ['theme', 'sharp', 'soft', 'round', 'pill'] as const
export const KIT_BUTTONS = ['solid', 'gradient', 'glow', 'outline', 'glass'] as const

export type KitColor = { id: KitColorId; name: string; hex: string }
export type BuilderKit = {
  /** c1 is the main colour: it becomes the accent of every block on built pages. */
  colors: KitColor[]
  headingFont: typeof KIT_FONTS[number]; bodyFont: typeof KIT_FONTS[number]; headingWeight: typeof KIT_WEIGHTS[number]
  scale: typeof KIT_SCALES[number]; radius: typeof KIT_RADII[number]; buttons: typeof KIT_BUTTONS[number]
}

export const KIT_KEY = 'page.builder.kit.v1'
const HEX = /^#[0-9a-fA-F]{6}$/

export const DEFAULT_KIT: BuilderKit = {
  colors: [
    { id: 'c1', name: 'اصلی', hex: '' }, { id: 'c2', name: 'دوم', hex: '' }, { id: 'c3', name: 'تأکید', hex: '' }, { id: 'c4', name: 'تیره', hex: '' },
  ],
  headingFont: 'theme', bodyFont: 'theme', headingWeight: 0, scale: 'theme', radius: 'theme', buttons: 'solid',
}

const pick = <T extends readonly (string | number)[]>(value: unknown, list: T, fallback: T[number]): T[number] => (list.includes(value as never) ? value as T[number] : fallback)

/** What may be stored: up to eight named colours (an empty one is a free slot), and choices from the lists. */
export function validateKit(input: unknown): BuilderKit {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const seen = new Set<string>()
  const colors = (Array.isArray(raw.colors) ? raw.colors : DEFAULT_KIT.colors).flatMap((entry) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const id = pick(row.id, KIT_COLOR_IDS, 'c1')
    if (seen.has(id) || !KIT_COLOR_IDS.includes(row.id as KitColorId)) return []
    seen.add(id)
    const hex = typeof row.hex === 'string' && HEX.test(row.hex) ? row.hex.toLowerCase() : ''
    return [{ id, name: String(row.name ?? '').replace(/[<>{}]/g, '').trim().slice(0, 30), hex }]
  }).slice(0, KIT_COLOR_IDS.length)
  return {
    colors,
    headingFont: pick(raw.headingFont, KIT_FONTS, DEFAULT_KIT.headingFont), bodyFont: pick(raw.bodyFont, KIT_FONTS, DEFAULT_KIT.bodyFont),
    headingWeight: pick(typeof raw.headingWeight === 'string' ? Number(raw.headingWeight) : raw.headingWeight, KIT_WEIGHTS, DEFAULT_KIT.headingWeight),
    scale: pick(raw.scale, KIT_SCALES, DEFAULT_KIT.scale), radius: pick(raw.radius, KIT_RADII, DEFAULT_KIT.radius), buttons: pick(raw.buttons, KIT_BUTTONS, DEFAULT_KIT.buttons),
  }
}

/** A colour advanced style may hold: a hex code or a kit colour. */
export const KIT_REF = /^kit:c[1-8]$/
/** The CSS for a stored colour: a kit colour falls back to the accent when its slot is empty. */
export const colorValue = (value: string) => (KIT_REF.test(value) ? `var(--bk-${value.slice(4)}, var(--primary))` : value)

const FONT_STACK: Record<typeof KIT_FONTS[number], string> = {
  theme: '',
  vazir: "'Vazirmatn', 'HappVazirmatn', var(--sds-typography-family-sans, system-ui), sans-serif",
  inter: "'HappInter', 'Inter', 'Vazirmatn', 'HappVazirmatn', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Vazirmatn', sans-serif",
}
const SCALE: Record<typeof KIT_SCALES[number], [string, string, string] | null> = {
  theme: null,
  compact: ['clamp(26px, 3vw, 40px)', 'clamp(22px, 2.2vw, 30px)', '20px'],
  normal: ['clamp(30px, 4vw, 52px)', 'clamp(24px, 2.8vw, 36px)', '22px'],
  large: ['clamp(36px, 5.4vw, 72px)', 'clamp(28px, 3.6vw, 46px)', '26px'],
}
const RADIUS: Record<typeof KIT_RADII[number], string> = { theme: '', sharp: '4px', soft: '14px', round: '22px', pill: '28px' }
const BUTTON_CSS: Record<typeof KIT_BUTTONS[number], string> = {
  solid: '',
  gradient: 'background: linear-gradient(120deg, var(--primary), var(--bk-c2, #8b5cf6)); border-color: transparent; color: #fff;',
  glow: 'box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent), 0 12px 32px -8px color-mix(in srgb, var(--primary) 70%, transparent);',
  outline: 'background: transparent; border: 2px solid var(--primary); color: var(--primary);',
  glass: 'background: color-mix(in srgb, var(--primary) 22%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent); color: inherit; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);',
}

/** The kit as CSS on a built page's root (`.br-doc` for blocks, `.br-page` for code mode). Nothing set writes nothing. */
export function kitCss(kit: BuilderKit): string {
  const root = ':is(.br-doc, .br-page)'
  const vars = kit.colors.filter((color) => color.hex).map((color) => `--bk-${color.id}: ${color.hex};`)
  const main = kit.colors.find((color) => color.id === 'c1' && color.hex)
  if (main) vars.push(`--primary: ${main.hex}; --primary-soft: color-mix(in srgb, ${main.hex} 14%, transparent);`)
  if (RADIUS[kit.radius]) vars.push(`--br-radius: ${RADIUS[kit.radius]};`)
  if (FONT_STACK[kit.bodyFont]) vars.push(`font-family: ${FONT_STACK[kit.bodyFont]};`)
  const out: string[] = []
  if (vars.length) out.push(`${root} { ${vars.join(' ')} }`)
  const heading = [FONT_STACK[kit.headingFont] ? `font-family: ${FONT_STACK[kit.headingFont]};` : '', kit.headingWeight ? `font-weight: ${kit.headingWeight};` : ''].filter(Boolean)
  if (heading.length) out.push(`${root} :is(h1, h2, h3, h4, .br-h) { ${heading.join(' ')} }`)
  const sizes = SCALE[kit.scale]
  if (sizes) out.push(`${root} h1 { font-size: ${sizes[0]}; } ${root} h2 { font-size: ${sizes[1]}; } ${root} h3 { font-size: ${sizes[2]}; }`)
  if (RADIUS[kit.radius]) out.push(`${root} :is(.btn, .br-price, .br-iconbox, .br-steps li, .br-tl-card, .br-member, .br-cmp-wrap, .br-alert, .br-flip-face, .br-flip-inner) { border-radius: var(--br-radius); }`)
  if (BUTTON_CSS[kit.buttons]) out.push(`${root} .btn-primary { ${BUTTON_CSS[kit.buttons]} }`)
  return out.join('\n')
}
