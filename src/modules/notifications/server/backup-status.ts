import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/platform/database/prisma'
import type { BackupHealth } from '@/modules/notifications/domain/backup-health'

const ID = /^backup-\d{13}-[a-f0-9]{12}$/
type Manifest = { id: string; createdAt: string; bytes?: number; restore?: { ok?: boolean } | null }
const object = (value: string | undefined): Record<string, unknown> => {
  if (!value) return {}
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid backup settings')
  return parsed as Record<string, unknown>
}

/** Existing worker manifests. No archive path, encryption material or provider details escape here. */
export async function listBackupManifests(): Promise<Manifest[]> {
  const directory = path.resolve(process.env.BACKUP_DIR || 'storage/backups')
  let files: string[]
  try { files = await fs.readdir(directory) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const items: Manifest[] = []
  for (const file of files) {
    if (!file.endsWith('.json') || !ID.test(file.slice(0, -5))) continue
    try {
      const meta = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) as Manifest
      if (meta?.id === file.slice(0, -5) && Number.isFinite(Date.parse(meta.createdAt))) items.push(meta)
    } catch { /* A damaged file is never an available recovery point. */ }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
}

/** Read-only operational signal; presence is not a fresh restore or archive-integrity certification. */
export async function backupHealth(now = new Date()): Promise<BackupHealth> {
  const scheduler = process.env.BACKUP_SCHEDULER !== 'false'
  const fallback: BackupHealth = { status: 'unavailable', enabled: false, scheduler, latestAt: null, restoreTest: 'unknown' }
  try {
    const [rows, manifests] = await Promise.all([
      db.setting.findMany({ where: { key: { in: ['operations.backup.config', 'operations.backup.state'] } }, select: { key: true, value: true } }),
      listBackupManifests(),
    ])
    const config = object(rows.find(row => row.key === 'operations.backup.config')?.value)
    const state = object(rows.find(row => row.key === 'operations.backup.state')?.value)
    const enabled = config.enabled === true
    const latest = manifests.find(meta => Date.parse(meta.createdAt) <= now.getTime())
    const latestAt = latest?.createdAt || null
    const result: BackupHealth = { ...fallback, enabled, latestAt,
      restoreTest: latest?.restore?.ok === true ? 'passed' : latest?.restore?.ok === false ? 'failed' : 'unknown' }
    if (!enabled) return { ...result, status: 'disabled' }
    if (!/^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '') || !/^[a-f\d]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || '')) return { ...result, status: 'unconfigured' }
    if (state.status === 'FAILED' || state.status === 'PARTIAL' || result.restoreTest === 'failed') return { ...result, status: 'failed' }
    if (state.status === 'RUNNING') {
      const elapsed = now.getTime() - Date.parse(String(state.startedAt || ''))
      return { ...result, status: Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30 * 60_000 ? 'running' : 'stale' }
    }
    if (!latest || now.getTime() - Date.parse(latest.createdAt) > 24 * 60 * 60_000) return { ...result, status: 'stale' }
    try { await fs.access(path.resolve(process.env.BACKUP_DIR || 'storage/backups', `${latest.id}.dump.enc`)) }
    catch { return { ...result, status: 'unavailable' } }
    return { ...result, status: 'available' }
  } catch { return fallback }
}
