export type CustomerServiceHistory = {
  status: 'available' | 'restricted' | 'unavailable'
  rows: { id: number; title: string; stage: string; status: string; createdAt: string; assignee: string; href: string }[]
  hasMore: boolean
}
