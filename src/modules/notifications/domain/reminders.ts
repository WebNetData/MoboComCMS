export const reminderDefaults = {
  enabled: false, expiryDays: 3, trafficPercent: 20,
  expiryTemplate: '⏳ زمان اشتراک {plan} رو به پایان است.\nنام اشتراک: {username}\nزمان باقی‌مانده: {days} روز\nتاریخ انقضا: {expiry}\nحجم باقی‌مانده: {remainingGB}',
  expiryTemplateEn: '⏳ Your {plan} subscription expires soon.\nConfiguration: {username}\nDays left: {days}\nExpiry: {expiry}\nTraffic left: {remainingGB}',
  expiredTemplate: '⌛ اعتبار اشتراک {plan} به پایان رسید.\nنام اشتراک: {username}\nتاریخ انقضا: {expiry}\nبرای ادامهٔ اتصال، اشتراک را تمدید کنید.',
  expiredTemplateEn: '⌛ Your {plan} subscription has expired.\nConfiguration: {username}\nExpiry: {expiry}\nRenew to keep your connection active.',
  trafficTemplate: '📊 حجم اشتراک {plan} رو به پایان است.\nنام اشتراک: {username}\nحجم باقی‌مانده: {remainingGB} ({remainingPercent}٪)\nتاریخ انقضا: {expiry}',
  trafficTemplateEn: '📊 Your {plan} subscription is running low on traffic.\nConfiguration: {username}\nTraffic left: {remainingGB} ({remainingPercent}%)\nExpiry: {expiry}',
}
export type ReminderSettings = typeof reminderDefaults
const placeholders = ['plan', 'username', 'days', 'expiry', 'remainingGB', 'remainingPercent']

export function validateReminderSettings(value: unknown): ReminderSettings {
  if (!value || typeof value !== 'object') throw new Error('تنظیمات نامعتبر است')
  const data = { ...reminderDefaults, ...value as object }
  if (typeof data.enabled !== 'boolean') throw new Error('وضعیت فعال بودن معتبر نیست')
  if (!Number.isInteger(data.expiryDays) || data.expiryDays < 1 || data.expiryDays > 30) throw new Error('آستانه زمان باید بین ۱ تا ۳۰ روز باشد')
  if (!Number.isInteger(data.trafficPercent) || data.trafficPercent < 1 || data.trafficPercent > 90) throw new Error('آستانه حجم باید بین ۱ تا ۹۰ درصد باشد')
  for (const field of ['expiryTemplate', 'trafficTemplate', 'expiredTemplate', 'expiryTemplateEn', 'trafficTemplateEn', 'expiredTemplateEn'] as const) {
    const text = data[field]
    if (typeof text !== 'string' || !text.trim() || text.length > 1500) throw new Error('متن پیام باید بین ۱ تا ۱۵۰۰ کاراکتر باشد')
    for (const match of text.matchAll(/\{([^{}]+)\}/g)) if (!placeholders.includes(match[1])) throw new Error(`متغیر ناشناخته: ${match[1]}`)
  }
  return { enabled: data.enabled, expiryDays: data.expiryDays, trafficPercent: data.trafficPercent, expiryTemplate: data.expiryTemplate, trafficTemplate: data.trafficTemplate, expiredTemplate: data.expiredTemplate, expiryTemplateEn: data.expiryTemplateEn, trafficTemplateEn: data.trafficTemplateEn, expiredTemplateEn: data.expiredTemplateEn }
}

export function reminderFacts(input: { now: number; expiresAt: number; used: number; limit: number }, settings: ReminderSettings) {
  if (![input.now, input.expiresAt, input.used, input.limit].every(Number.isFinite) || input.used < 0 || input.limit < 0) return null
  const time = input.expiresAt - input.now
  if (time < -86400_000) return null // Do not flood users about long-expired accounts.
  const days = Math.max(0, Math.ceil(time / 86400_000))
  const remaining = input.limit === 0 ? null : Math.max(0, input.limit - input.used)
  const percent = remaining === null ? null : remaining / input.limit * 100
  return { days, remaining, percent, expiry: time > 0 && time <= settings.expiryDays * 86400_000, expired: time <= 0, traffic: time > 0 && percent !== null && percent <= settings.trafficPercent }
}

// Send plain text, never Telegram HTML; substituted customer data cannot inject markup.
export function renderReminder(template: string, values: Record<string, string>) {
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => values[key] || '').slice(0, 4000)
}
