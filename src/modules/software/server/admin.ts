import { db } from '@/platform/database/prisma'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { splitList } from '@/modules/media/domain/media'
import { SOFTWARE_HEALTH, isStale, normalizeSoftwareSettings, softwareIssues, type SoftwareHealth, type SoftwareSettings } from '@/modules/software/domain/software'
import { currentSoftwareVersions, projectSoftwareVersion } from '@/modules/software/server/current-version'

// Software admin: portal settings, catalogue dashboard and picker.

const SETTINGS_KEY = 'software.portal.v1'
const settingsHistory = () => createSectionSettingsHistory(SETTINGS_KEY, 'settings-software', normalizeSoftwareSettings, settings => ({ rails: settings.rails.filter(rail => rail.enabled).length }))
export const softwareSettingsState = () => settingsHistory().current()
export const restoreSoftwareSettings = (...args: Parameters<ReturnType<typeof settingsHistory>['restore']>) => settingsHistory().restore(...args)
const DAY = 86_400_000
const tehranDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const LICENSES: Record<string, string> = { FREE: 'رایگان', FREEMIUM: 'رایگان با امکانات پولی', TRIAL: 'آزمایشی', PAID: 'پولی', OPEN_SOURCE: 'متن‌باز' }

export async function getSoftwareSettings(fresh = false): Promise<SoftwareSettings> {
  return fresh ? settingsHistory().read() : normalizeSoftwareSettings(await readJsonSetting(SETTINGS_KEY))
}

export async function saveSoftwareSettings(input: unknown, context?: SectionSettingsContext): Promise<SoftwareSettings> {
  return settingsHistory().save(input, context)
}

export async function softwareDashboard(now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY)
  const [settings, rawTitles, links, reports, downloads] = await Promise.all([
    getSoftwareSettings(),
    db.softwareTitle.findMany({ select: { id: true, slug: true, title: true, icon: true, version: true, summary: true, content: true, screenshots: true, platforms: true, size: true, license: true, status: true, publishedAt: true, releasedAt: true, updatedAt: true, views: true, downloads: true, access: true, featured: true } }),
    db.mediaLink.findMany({ where: { ownerType: { in: ['software', 'softwarerelease'] } }, select: { ownerType: true, ownerId: true, clicks: true, disabled: true } }),
    db.linkReport.count({ where: { status: 'OPEN', link: { ownerType: { in: ['software', 'softwarerelease'] } } } }).catch(() => 0),
    db.downloadLog.findMany({ where: { ownerType: { in: ['software', 'softwarerelease'] }, createdAt: { gte: since } }, select: { createdAt: true } }).catch(() => []),
  ])
  const versions = await currentSoftwareVersions(rawTitles.map((title) => title.id), now)
  const titles = rawTitles.map((title) => projectSoftwareVersion(title, versions))
  const linkCount = new Map<number, number>()
  const releaseIds = links.filter((link) => link.ownerType === 'softwarerelease').map((link) => link.ownerId)
  const releaseOwners = new Map((releaseIds.length ? await db.softwareRelease.findMany({ where: { id: { in: releaseIds }, status: 'PUBLISHED', releasedAt: { lte: now } }, select: { id: true, softwareId: true } }) : []).map((row) => [row.id, row.softwareId]))
  for (const link of links) if (!link.disabled) { const ownerId = link.ownerType === 'softwarerelease' ? releaseOwners.get(link.ownerId) : link.ownerId; if (ownerId) linkCount.set(ownerId, (linkCount.get(ownerId) || 0) + 1) }
  const live = titles.filter((title) => title.status === 'PUBLISHED' && title.publishedAt <= now)
  const health = Object.fromEntries(Object.keys(SOFTWARE_HEALTH).map((key) => [key, 0])) as Record<SoftwareHealth, number>
  const worst: { id: number; title: string; icon: string; version: string; issues: SoftwareHealth[] }[] = []
  for (const title of live) {
    const issues = softwareIssues({ ...title, links: linkCount.get(title.id) || 0 }, now, settings.staleDays)
    for (const issue of issues) health[issue]++
    if (issues.some((issue) => issue === 'links' || issue === 'icon' || issue === 'version' || issue === 'summary')) worst.push({ id: title.id, title: title.title, icon: title.icon, version: title.version, issues })
  }
  worst.sort((a, b) => b.issues.length - a.issues.length)
  const days = Array.from({ length: 30 }, (_, i) => tehranDay(new Date(now.getTime() - (29 - i) * DAY)))
  const counts = new Map(days.map((day) => [day, 0]))
  for (const row of downloads) { const key = tehranDay(row.createdAt); if (counts.has(key)) counts.set(key, counts.get(key)! + 1) }
  const share = (values: string[]) => { const map = new Map<string, number>(); for (const value of values) map.set(value, (map.get(value) || 0) + 1); return [...map].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) }
  const card = (title: typeof titles[number]) => ({ id: title.id, slug: title.slug, title: title.title, icon: title.icon, version: title.version, views: title.views, downloads: title.downloads })
  return {
    kpis: {
      published: live.length, drafts: titles.filter((title) => title.status !== 'PUBLISHED').length, scheduled: titles.filter((title) => title.status === 'PUBLISHED' && title.publishedAt > now).length,
      views: live.reduce((sum, title) => sum + title.views, 0), downloads: live.reduce((sum, title) => sum + title.downloads, 0), downloads30: downloads.length,
      clicks: links.reduce((sum, link) => sum + link.clicks, 0), openReports: reports, disabledLinks: links.filter((link) => link.disabled).length,
      updated7: live.filter((title) => now.getTime() - title.updatedAt.getTime() <= 7 * DAY).length, stale: health.stale, vip: live.filter((title) => title.access === 'MEMBERS').length,
      featured: live.filter((title) => title.featured).length, staleDays: settings.staleDays,
    },
    series: days.map((day) => ({ day, downloads: counts.get(day)! })),
    health: Object.entries(health).map(([key, count]) => ({ key, label: SOFTWARE_HEALTH[key as SoftwareHealth], count })).filter((row) => row.count).sort((a, b) => b.count - a.count),
    worst: worst.slice(0, 8),
    needsUpdate: live.filter((title) => isStale(title, now, settings.staleDays)).sort((a, b) => +(a.releasedAt || a.updatedAt) - +(b.releasedAt || b.updatedAt)).slice(0, 8)
      .map((title) => ({ ...card(title), since: (title.releasedAt || title.updatedAt).toISOString(), days: Math.floor((now.getTime() - (title.releasedAt || title.updatedAt).getTime()) / DAY) })),
    topDownloaded: [...live].sort((a, b) => b.downloads - a.downloads).slice(0, 8).map(card),
    platforms: share(live.flatMap((title) => splitList(title.platforms, 8))).slice(0, 8),
    licenses: share(live.map((title) => LICENSES[title.license] || title.license)),
  }
}

export async function softwarePicker() {
  const rows = await db.softwareTitle.findMany({ where: { status: 'PUBLISHED' }, orderBy: { updatedAt: 'desc' }, take: 800, select: { id: true, title: true, icon: true, version: true } })
  const versions = await currentSoftwareVersions(rows.map((row) => row.id))
  return rows.map((row) => ({ ...row, version: versions.has(row.id) ? versions.get(row.id)?.version || '' : row.version }))
}
