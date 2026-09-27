import { db } from '@/platform/database/prisma'
import { formatMoney, normalizeCurrency } from '@/shared/money'
import { lastDays, tehranDay } from '@/shared/time/day'
import { change } from '@/modules/analytics/domain/analytics'

/**
 * The analytics dashboard: traffic (visitors, views, pages, sources, devices),
 * site search (including zero-result queries — content to add) and business
 * numbers (paid invoices, signups, downloads) for the chosen range, each with
 * the change against the previous range of the same length.
 */

type Top = { value: string; count: number }

function top(rows: { value: string; count: number }[], limit = 12): Top[] {
  const sums = new Map<string, number>()
  for (const row of rows) sums.set(row.value, (sums.get(row.value) || 0) + row.count)
  return [...sums].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, limit)
}

export async function analyticsDashboard(days = 30) {
  const range = lastDays(days)
  const previous = lastDays(days, new Date(Date.now() - days * 86_400_000))
  const from = new Date(Date.now() - days * 86_400_000)
  const prevFrom = new Date(Date.now() - 2 * days * 86_400_000)

  const [totals, prevTotals, pages, dims, invoices, prevInvoices, users, prevUsers, downloads, prevDownloads, reviews, favorites, pushSubs, docs] = await Promise.all([
    db.analyticsDaily.findMany({ where: { path: '*', day: { in: range } } }),
    db.analyticsDaily.findMany({ where: { path: '*', day: { in: previous } } }),
    db.analyticsDaily.groupBy({ by: ['path'], where: { day: { in: range }, NOT: { path: '*' } }, _sum: { views: true }, orderBy: { _sum: { views: 'desc' } }, take: 15 }),
    db.analyticsDimension.findMany({ where: { day: { in: range } }, select: { dim: true, value: true, count: true } }),
    db.invoice.findMany({ where: { status: 'PAID', paidAt: { gte: from } }, select: { paidAt: true, paidAmountMinor: true, totalMinor: true, currency: true } }),
    db.invoice.count({ where: { status: 'PAID', paidAt: { gte: prevFrom, lt: from } } }),
    db.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    db.user.count({ where: { createdAt: { gte: prevFrom, lt: from } } }),
    db.downloadLog.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    db.downloadLog.count({ where: { createdAt: { gte: prevFrom, lt: from } } }),
    db.itemReview.count({ where: { createdAt: { gte: from } } }),
    db.itemFavorite.count({ where: { createdAt: { gte: from } } }),
    db.pushSubscription.count(),
    db.searchDocument.findMany({ select: { url: true, title: true }, take: 20_000 }),
  ])

  const byDay = new Map(totals.map((row) => [row.day, row]))
  const perDay = <T extends { createdAt?: Date; paidAt?: Date | null }>(rows: T[], key: 'createdAt' | 'paidAt') => {
    const map = new Map<string, number>()
    for (const row of rows) { const at = row[key]; if (at) map.set(tehranDay(at), (map.get(tehranDay(at)) || 0) + 1) }
    return map
  }
  const signupsByDay = perDay(users, 'createdAt')
  const salesByDay = perDay(invoices, 'paidAt')
  const downloadsByDay = perDay(downloads, 'createdAt')
  const series = range.map((day) => ({
    day, visitors: byDay.get(day)?.visitors || 0, views: byDay.get(day)?.views || 0,
    signups: signupsByDay.get(day) || 0, sales: salesByDay.get(day) || 0, downloads: downloadsByDay.get(day) || 0,
  }))
  const sum = (rows: { visitors: number; views: number }[], field: 'visitors' | 'views') => rows.reduce((total, row) => total + row[field], 0)
  const visitors = sum(totals, 'visitors')
  const views = sum(totals, 'views')

  // Revenue per currency (never mixed), formatted with the shared money helper.
  const revenue = new Map<string, bigint>()
  for (const invoice of invoices) {
    const currency = normalizeCurrency(invoice.currency)
    revenue.set(currency, (revenue.get(currency) || 0n) + (invoice.paidAmountMinor > 0n ? invoice.paidAmountMinor : invoice.totalMinor))
  }

  const titles = new Map(docs.map((doc) => [doc.url, doc.title]))
  const dim = (name: string, limit?: number) => top(dims.filter((row) => row.dim === name), limit)

  return {
    days,
    summary: {
      visitors, views, pagesPerVisit: visitors ? Math.round((views / visitors) * 10) / 10 : 0,
      visitorsChange: change(visitors, sum(prevTotals, 'visitors')), viewsChange: change(views, sum(prevTotals, 'views')),
      sales: invoices.length, salesChange: change(invoices.length, prevInvoices),
      revenue: [...revenue].map(([currency, minor]) => formatMoney(minor, currency, 'fa-IR')),
      signups: users.length, signupsChange: change(users.length, prevUsers),
      downloads: downloads.length, downloadsChange: change(downloads.length, prevDownloads),
      reviews, favorites, pushSubscribers: pushSubs,
    },
    series,
    pages: pages.map((row) => ({ path: row.path, title: titles.get(row.path) || '', views: row._sum.views || 0 })),
    sources: dim('source'), devices: dim('device', 5), browsers: dim('browser', 8), os: dim('os', 8), landing: dim('landing', 10),
    searches: dim('search', 15), emptySearches: dim('search-empty', 15),
  }
}
