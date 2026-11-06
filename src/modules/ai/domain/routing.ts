export const AI_PURPOSES = [
  { id: 'admin', label: 'پیش‌فرض ابزارهای مدیریت', personal: true },
  { id: 'operations', label: 'دستیار عملیاتی با تأیید مدیر', personal: true },
  { id: 'support', label: 'پشتیبانی آنلاین کاربران', personal: false },
  { id: 'prompts', label: 'بهبود هوشمند پرامپت‌مستر', personal: false },
  { id: 'journal', label: 'نوشتن مطالب مجله', personal: true },
  { id: 'store', label: 'توضیحات و فرم محصولات', personal: true },
  { id: 'comments', label: 'پیشنهاد پاسخ دیدگاه‌ها', personal: true },
  { id: 'forum', label: 'پیشنهاد پاسخ انجمن', personal: true },
  { id: 'seo', label: 'توضیحات متا و سئو', personal: true },
  { id: 'editor', label: 'ویرایش و بازنویسی محتوا', personal: true },
  { id: 'pages', label: 'فرم صفحات', personal: true },
  { id: 'music', label: 'فرم موزیک', personal: true },
  { id: 'cinema', label: 'فرم فیلم و سریال', personal: true },
  { id: 'games', label: 'فرم بازی‌ها', personal: true },
  { id: 'software', label: 'فرم نرم‌افزار', personal: true },
] as const
export type AiPurpose = typeof AI_PURPOSES[number]['id']
export type AiSource = 'inherit' | 'api' | 'personal'
export const isAiPurpose = (value: unknown): value is AiPurpose => AI_PURPOSES.some(p => p.id === value)
export const allowsPersonalAi = (purpose: AiPurpose) => AI_PURPOSES.some(p => p.id === purpose && p.personal)
export const parentAiPurpose = (purpose: AiPurpose) => purpose !== 'admin' && allowsPersonalAi(purpose) ? 'admin' as const : null
export function purposeForSection(section: unknown): AiPurpose {
  const sections: Record<string, AiPurpose> = { posts: 'journal', products: 'store', pages: 'pages', music: 'music', 'music-tracks': 'music', 'music-albums': 'music', 'music-artists': 'music', movies: 'cinema', series: 'cinema', cinema: 'cinema', 'cinema-titles': 'cinema', games: 'games', software: 'software' }
  return sections[String(section)] || 'editor'
}
export function purposeForAdminAction(action: string, section?: unknown): AiPurpose {
  if (action === 'content.autofill') return purposeForSection(section)
  const actions: Record<string, AiPurpose> = { 'post.draft': 'journal', 'product.write': 'store', 'comment.suggest': 'comments', 'forum.suggest': 'forum', 'meta.suggest': 'seo', 'editor.assist': 'editor' }
  return actions[action] || 'admin'
}
