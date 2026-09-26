export type TicketField = { key: string; labelFa: string; labelEn: string; type: 'text' | 'textarea' | 'select' | 'checkbox'; required: boolean; options?: string[] }
export type DepartmentConfig = { slug: string; nameFa: string; nameEn: string; descriptionFa: string; descriptionEn: string; active: boolean; requiresSubscription: boolean; requiresProduct: boolean; fields: string; roleIds: string; sortOrder: number }

export function parseFields(value: string): TicketField[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}
export function parseRoleIds(value: string): number[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [] } catch { return [] }
}
export function canHandleDepartment(user: { role: string; roleId?: number | null; permissions?: string[] | null }, department: Pick<DepartmentConfig, 'roleIds'> | null) {
  if (user.role !== 'ADMIN') return false
  if (user.roleId === null || user.roleId === undefined || user.permissions?.includes('tickets.departments.manage')) return true
  return Boolean(department && parseRoleIds(department.roleIds).includes(user.roleId))
}

export function validateFields(value: unknown): TicketField[] {
  if (!Array.isArray(value) || value.length > 12) throw Error('Invalid department fields')
  const seen = new Set<string>()
  return value.map(input => {
    const key = String(input?.key || '').trim().toLowerCase()
    const labelFa = String(input?.labelFa || '').trim()
    const labelEn = String(input?.labelEn || '').trim()
    const type = input?.type
    const options = type === 'select' ? input?.options : undefined
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || seen.has(key) || !labelFa || !labelEn || labelFa.length > 100 || labelEn.length > 100 || !['text', 'textarea', 'select', 'checkbox'].includes(type)) throw Error('Invalid department field')
    if (type === 'select' && (!Array.isArray(options) || options.length < 1 || options.length > 30 || options.some((option: unknown) => typeof option !== 'string' || !option.trim() || option.length > 100))) throw Error('Invalid select options')
    seen.add(key)
    return { key, labelFa, labelEn, type, required: input.required === true, ...(options ? { options: options.map((s: string) => s.trim()) } : {}) } as TicketField
  })
}

export function validateDepartment(input: any) {
  const slug = String(input?.slug || '').trim().toUpperCase()
  const nameFa = String(input?.nameFa || '').trim()
  const nameEn = String(input?.nameEn || '').trim()
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(slug) || !nameFa || !nameEn || nameFa.length > 100 || nameEn.length > 100) throw Error('Invalid department name or key')
  const descriptionFa = String(input?.descriptionFa || '').trim().slice(0, 240)
  const descriptionEn = String(input?.descriptionEn || '').trim().slice(0, 240)
  const roleIds = input?.roleIds
  if (!Array.isArray(roleIds) || roleIds.length > 100 || roleIds.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0)) throw Error('Invalid role access')
  const requiresSubscription = input?.requiresSubscription === true
  const requiresProduct = input?.requiresProduct === true
  if (requiresSubscription && requiresProduct) throw Error('Choose one service requirement')
  const sortOrder = Number(input?.sortOrder || 0)
  if (!Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 100000) throw Error('Invalid sort order')
  return { slug, nameFa, nameEn, descriptionFa, descriptionEn, active: input?.active !== false, requiresSubscription, requiresProduct, fields: JSON.stringify(validateFields(input?.fields || [])), roleIds: JSON.stringify([...new Set(roleIds)]), sortOrder }
}

export function validateAnswers(fields: TicketField[], input: unknown): Record<string, string | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {}
  const answers = input as Record<string, unknown>
  if (Object.keys(answers).some(key => !fields.some(field => field.key === key))) throw Error('Unknown ticket field')
  const clean: Record<string, string | boolean> = {}
  for (const field of fields) {
    const raw = answers[field.key]
    if (field.type === 'checkbox') { const value = raw === true; if (field.required && !value) throw Error(`Required field: ${field.key}`); clean[field.key] = value; continue }
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (field.required && !value) throw Error(`Required field: ${field.key}`)
    if (value.length > (field.type === 'textarea' ? 4000 : 300)) throw Error(`Field too long: ${field.key}`)
    if (field.type === 'select' && value && !field.options?.includes(value)) throw Error(`Invalid option: ${field.key}`)
    if (value) clean[field.key] = value
  }
  return clean
}
