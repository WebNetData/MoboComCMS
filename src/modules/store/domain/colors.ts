/**
 * Colour names a product option may use, and the swatch each is drawn with (the buy box and the shop filters read
 * the same table). A value that is already a hex colour is drawn as itself; an unknown name gets no swatch.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  مشکی: '#1f2328', سفید: '#ffffff', نقره‌ای: '#c9ced6', طلایی: '#d4af37', قرمز: '#e5484d', آبی: '#3b82f6', سبز: '#22a06b', زرد: '#f5c542',
  صورتی: '#f472b6', بنفش: '#8b5cf6', نارنجی: '#f97316', خاکستری: '#8b949e', سرمه‌ای: '#1e3a8a', قهوه‌ای: '#8b5a2b', کرم: '#f1e7d0',
  black: '#1f2328', white: '#ffffff', silver: '#c9ced6', gold: '#d4af37', red: '#e5484d', blue: '#3b82f6', green: '#22a06b', gray: '#8b949e', grey: '#8b949e',
}

export const colorSwatch = (value: string) => COLOR_SWATCHES[value.trim().toLowerCase()] || COLOR_SWATCHES[value.trim()] || (/^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : '')
