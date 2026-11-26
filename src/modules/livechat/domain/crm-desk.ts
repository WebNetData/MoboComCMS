export const CRM_TITLE = 'مدیریت ارتباط با مشتریان'
export const CRM_PERMISSIONS = ['users.manage', 'support.chat', 'tickets.handle', 'settings.manage']
export const CRM_PAGE_SIZE = 25
export const CRM_SEGMENT_POLICY = { loyalOrders: 5, loyalDays: 60, riskDays: 90, lostDays: 180, dayMs: 86_400_000 }

export const CRM_SEGMENTS = {
  lead: { key: 'lead', label: 'هنوز خرید نکرده', tone: '' },
  loyal: { key: 'loyal', label: 'مشتری وفادار', tone: 'ok' },
  lost: { key: 'lost', label: 'از دست رفته', tone: 'bad' },
  'at-risk': { key: 'at-risk', label: 'در خطر ریزش', tone: 'warn' },
  new: { key: 'new', label: 'مشتری تازه', tone: 'ok' },
  active: { key: 'active', label: 'مشتری فعال', tone: 'ok' },
} as const

export const CRM_SORTS = { recent: 'تازه‌ترین عضویت', lastOrder: 'تازه‌ترین خرید', spend: 'بیشترین مبلغ خرید' } as const
export const CRM_STATUSES = { ACTIVE: 'حساب فعال', BANNED: 'حساب مسدود' } as const

export type CrmDeskRow = {
  id: number; name: string; email: string; phone: string; status: string
  createdAt: string; orders: number; spend: number; lastOrderAt: string | null
  segment: (typeof CRM_SEGMENTS)[keyof typeof CRM_SEGMENTS]; tags: string[]
}
export type CrmDeskPage = {
  rows: CrmDeskRow[]
  tags: { tag: string; count: number }[]
  page: number; pageSize: number; pageCount: number
  summary: { total: number; buyers: number; needsFollowUp: number }
  mayManageEngagement: boolean
}

function option<T extends string>(values: Record<T, unknown>, value: string): T | '' {
  return Object.hasOwn(values, value) ? value as T : ''
}

export function crmDeskFilters(query: Pick<URLSearchParams, 'get'>) {
  const page = Number(query.get('page'))
  return {
    q: (query.get('q') || '').trim().slice(0, 120),
    tag: (query.get('tag') || '').trim().slice(0, 24),
    segment: option(CRM_SEGMENTS, query.get('segment') || ''),
    status: option(CRM_STATUSES, query.get('status') || ''),
    sort: option(CRM_SORTS, query.get('sort') || '') || 'recent',
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1,
  }
}

export type CrmDeskFilters = ReturnType<typeof crmDeskFilters>
