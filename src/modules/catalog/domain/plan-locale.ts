export type LocalizedPlan = { name: string; nameEn?: string | null; description?: string | null; descriptionEn?: string | null; trafficGB: number; days: number }

/** Legacy plans without an English translation get a neutral, useful label. */
export function planName(plan: LocalizedPlan, locale: 'en' | 'fa'): string {
  if (locale === 'fa') return plan.name.trim() || `اشتراک ${plan.trafficGB} گیگابایت، ${plan.days} روزه`
  return plan.nameEn?.trim() || `${plan.trafficGB} GB · ${plan.days}-day plan`
}

export function planDescription(plan: LocalizedPlan, locale: 'en' | 'fa'): string {
  return (locale === 'fa' ? plan.description : plan.descriptionEn)?.trim() || ''
}
