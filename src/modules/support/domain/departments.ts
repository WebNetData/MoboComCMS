export const ticketDepartments = ['GENERAL', 'SALES', 'SUBSCRIPTION', 'PRODUCT'] as const
export type TicketDepartment = typeof ticketDepartments[number]

export function isTicketDepartment(value: unknown): value is TicketDepartment {
  return typeof value === 'string' && ticketDepartments.includes(value as TicketDepartment)
}

export function needsSubscription(department: TicketDepartment) {
  return department === 'SUBSCRIPTION'
}

export function needsProduct(department: TicketDepartment) {
  return department === 'PRODUCT'
}

export function departmentLabel(department: string, locale: 'en' | 'fa') {
  const labels: Record<TicketDepartment, [string, string]> = {
    GENERAL: ['General support', 'پشتیبانی عمومی'],
    SALES: ['Sales & pre-purchase', 'فروش و پیش از خرید'],
    SUBSCRIPTION: ['Subscription support', 'پشتیبانی اشتراک'],
    PRODUCT: ['Product support', 'پشتیبانی محصول'],
  }
  const pair = labels[department as TicketDepartment] || labels.GENERAL
  return pair[locale === 'fa' ? 1 : 0]
}
