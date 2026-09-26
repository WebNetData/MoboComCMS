export const incidentStatuses = ['INVESTIGATING', 'MAINTENANCE', 'RESOLVED'] as const
export const issueTypes = ['connection', 'slow', 'import', 'other'] as const
export const reportDevices = ['android', 'ios', 'windows', 'macos', 'linux', 'other'] as const
export function issueLabel(value: string, locale: 'en' | 'fa') {
  const labels: Record<string, [string, string]> = { connection: ['Cannot connect', 'اتصال برقرار نمی‌شود'], slow: ['Slow connection', 'کندی اتصال'], import: ['Subscription import error', 'خطای افزودن اشتراک'], other: ['Other issue', 'سایر مشکلات'] }
  return (labels[value] || labels.other)[locale === 'fa' ? 1 : 0]
}
export function deviceLabel(value: string, locale: 'en' | 'fa') {
  return value === 'other' ? (locale === 'fa' ? 'سایر' : 'Other') : value === 'ios' ? 'iOS' : value === 'macos' ? 'macOS' : value === 'android' ? 'Android' : value === 'windows' ? 'Windows' : value === 'linux' ? 'Linux' : value
}
export function validateIncident(input: any) {
  if (!input || !incidentStatuses.includes(input.status)) throw Error('وضعیت معتبر نیست / Invalid status')
  const panelId = input.panelId === null ? null : input.panelId
  if (panelId !== null && (!Number.isSafeInteger(panelId) || panelId <= 0)) throw Error('سرویس معتبر نیست / Invalid service')
  const text = (key: string, max: number) => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw Error('متن معتبر نیست / Invalid text')
    return input[key].trim()
  }
  return { panelId, status: input.status as string, titleFa: text('titleFa', 160), titleEn: text('titleEn', 160), messageFa: text('messageFa', 3000), messageEn: text('messageEn', 3000) }
}
