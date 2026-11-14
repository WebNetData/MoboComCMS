import { randomUUID } from 'node:crypto'
import { db } from '@/platform/database/prisma'
import { isModuleEnabled } from '@/extensions/server/modules'
import { acquireLease, updateJsonSetting } from '@/modules/settings/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import { probePublicFile } from '@/modules/downloads/server/remote'
import { healthSettings } from './settings'
import { healthSource } from './sources'

export async function syncHealthInventory() {
  if (!await isModuleEnabled('download-guard')) return { scanned: 0 }
  let scanned = 0
  await updateJsonSetting('downloads.health.cursor.v1', async (cursor, tx) => {
    const linkRows = await tx.mediaLink.findMany({ where: { id: { gt: Number(cursor.link) || 0 }, ownerType: { in: ['title', 'episode', 'game', 'gameupdate', 'software', 'softwarerelease'] }, disabled: false }, orderBy: { id: 'asc' }, take: 50, select: { id: true } })
    const tracks = await tx.musicTrack.findMany({ where: { id: { gt: Number(cursor.track) || 0 }, status: 'PUBLISHED' }, orderBy: { id: 'asc' }, take: 25, select: { id: true } })
    for (const key of [...linkRows.map(row => `link:${row.id}`), ...tracks.flatMap(row => [`track:${row.id}:normal`, `track:${row.id}:hq`])]) {
      const source = await healthSource(key); if (!source) continue
      const held = await tx.downloadLinkHealth.findUnique({ where: { sourceKey: key } })
      if (!held) await tx.downloadLinkHealth.create({ data: { sourceKey: key, sourceHash: source.hash, linkId: source.linkId, trackId: source.trackId, quality: source.quality } })
      else if (held.sourceHash !== source.hash) await tx.downloadLinkHealth.updateMany({ where: { id: held.id, sourceHash: held.sourceHash }, data: { sourceHash: source.hash, status: 'PENDING', failureCount: 0, checkedAt: null, lastSuccessAt: null, leaseToken: '', leaseUntil: null, nextCheckAt: new Date() } })
      scanned++
    }
    cursor.link = linkRows.length === 50 ? linkRows.at(-1)!.id : 0; cursor.track = tracks.length === 25 ? tracks.at(-1)!.id : 0
  })
  return { scanned }
}
export async function scheduleLinkHealth() {
  if (!await isModuleEnabled('download-guard')) return { skipped: true }
  const settings = await healthSettings()
  if (!settings.enabled || !settings.hosts.length) return { skipped: true }
  await syncHealthInventory()
  return enqueue('downloads.health', {}, { dedupeKey: 'downloads:health:scheduled' })
}
export async function runHealthBatch(checkpoint: () => Promise<void> = async () => {}) {
  if (!await isModuleEnabled('download-guard') || !await acquireLease('downloads-health-batch', 45_000)) return { checked: 0 }
  const settings = await healthSettings(); if (!settings.enabled || !settings.hosts.length) return { checked: 0 }
  const due = await db.downloadLinkHealth.findMany({ where: { nextCheckAt: { lte: new Date() }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }], take: settings.batchSize })
  let checked = 0
  for (const row of due) {
    await checkpoint()
    const currentSettings = await healthSettings()
    if (!currentSettings.enabled || !await isModuleEnabled('download-guard')) break
    const source = await healthSource(row.sourceKey), leaseToken = randomUUID()
    if (!source || source.hash !== row.sourceHash) { await db.downloadLinkHealth.updateMany({ where: { id: row.id, sourceHash: row.sourceHash }, data: { nextCheckAt: new Date(Date.now() + 6 * 3600_000) } }); continue }
    let host = ''; try { host = new URL(source.url).hostname.toLowerCase() } catch { /* invalid source is a persisted failure without network */ }
    const claim = await db.downloadLinkHealth.updateMany({ where: { id: row.id, sourceHash: row.sourceHash, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken, leaseUntil: new Date(Date.now() + 30_000) } })
    if (!claim.count) continue
    const allowed = currentSettings.hosts.includes(host)
    const result = allowed ? await probePublicFile(source.url, currentSettings.hosts) : { ok: false, status: 0, detail: 'میزبان در فهرست مجاز پایش نیست؛ درخواستی ارسال نشد' }
    await checkpoint()
    const after = await healthSource(row.sourceKey), configAfter = await healthSettings()
    if (!after || after.hash !== row.sourceHash || !configAfter.enabled || (allowed && !configAfter.hosts.includes(host))) { await db.downloadLinkHealth.updateMany({ where: { id: row.id, leaseToken }, data: { leaseUntil: null, leaseToken: '' } }); continue }
    const now = new Date(), failureCount = !allowed || result.ok ? 0 : row.failureCount + 1
    await db.$transaction(async tx => {
      const currentSource = await healthSource(row.sourceKey, tx)
      if (!currentSource || currentSource.hash !== row.sourceHash) return
      const changed = await tx.downloadLinkHealth.updateMany({ where: { id: row.id, sourceHash: row.sourceHash, leaseToken }, data: { status: !allowed ? 'SKIPPED' : result.ok ? 'OK' : 'FAILED', httpStatus: result.status, detail: result.detail, failureCount, checkedAt: now, ...(result.ok ? { lastSuccessAt: now } : {}), nextCheckAt: new Date(now.getTime() + Math.min(168, currentSettings.intervalHours * (!allowed || result.ok ? 1 : Math.min(4, failureCount))) * 3600_000), leaseToken: '', leaseUntil: null } })
      if (changed.count && allowed && !result.ok && failureCount >= 2 && source.linkId) {
        const existing = await tx.linkReport.findFirst({ where: { linkId: source.linkId, visitor: `health:${row.id}`, status: 'OPEN' } })
        if (!existing) await tx.linkReport.create({ data: { linkId: source.linkId, visitor: `health:${row.id}`, reason: 'BROKEN', note: `پایش خودکار: ${result.detail}` } })
      }
    }, { isolationLevel: 'Serializable' })
    checked++
  }
  return { checked }
}
export async function healthDashboard() {
  const rows = await db.downloadLinkHealth.findMany({ orderBy: [{ status: 'asc' }, { checkedAt: 'desc' }], take: 100 })
  return Promise.all(rows.map(async row => { const source = await healthSource(row.sourceKey); return { id: row.id, sourceKey: row.sourceKey, status: row.status, httpStatus: row.httpStatus, detail: row.detail, failureCount: row.failureCount, checkedAt: row.checkedAt, lastSuccessAt: row.lastSuccessAt, nextCheckAt: row.nextCheckAt, title: source?.title || 'مورد تغییرکرده یا غیرفعال', editHref: source?.admin || '' } }))
}
