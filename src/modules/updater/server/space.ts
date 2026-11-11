import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { UpdateError } from '../domain/updater'
import { environment, updateDirectory } from './service'

// Disk use of the updater's private snapshot directories, read and cleaned through the same tool the update scripts
// use (deploy/ubuntu/update-space.cjs), so the Server Panel can never apply a different retention policy.

export type SpaceEntry = { name: string; kind: 'git' | 'package' | 'trash'; status: string; startedAt: string; bytes: number; restorable: boolean; protected: string; removable: boolean }
export type SpaceReport = { supported: boolean; locked: boolean; keep: number; freeBytes: number; needBytes: number; totalBytes: number; removableBytes: number; entries: SpaceEntry[] }

const tool = () => process.env.UPDATE_SPACE_TOOL || join(process.cwd(), 'deploy', 'ubuntu', 'update-space.cjs')
const lockPath = () => join(updateDirectory(), 'lock')
const hostUpdates = () => ['systemd', 'package', 'manual'].includes(environment().method)

function run(command: 'list' | 'prune', timeout: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => execFile(process.execPath, [tool(), command, process.cwd(), '--lock', lockPath()], { timeout, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
    if (error) return reject(new UpdateError(String(stderr || '').replace(/^\[space\] /, '').trim().slice(0, 400) || 'بررسی فضای نسخه‌های قبلی انجام نشد', 502))
    try { resolve(JSON.parse(String(stdout).trim().split('\n').pop() || '{}')) } catch { reject(new UpdateError('پاسخ بررسی فضا قابل خواندن نیست', 502)) }
  }))
}

const STATUS = new Set(['building', 'adopted', 'healthy', 'rolled-back', 'failed', 'legacy', 'deleting'])
const PROTECTED = new Set(['', 'update-running', 'installation-incomplete', 'current-update', 'interrupted', 'latest-restorable'])
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0

/** Only the fields the panel shows; directory paths never leave the server. */
function entries(value: unknown): SpaceEntry[] {
  return (Array.isArray(value) ? value : []).slice(0, 200).flatMap((raw) => {
    const e = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const name = String(e.name || ''), kind = String(e.kind || ''), status = String(e.status || ''), guard = String(e.protected || '')
    if (!/^\.(mobocom-build|package|mobocom-trash)\.[A-Za-z0-9]+$/.test(name) || !['git', 'package', 'trash'].includes(kind) || !STATUS.has(status) || !PROTECTED.has(guard)) return []
    return [{ name, kind: kind as SpaceEntry['kind'], status, startedAt: String(e.startedAt || '').slice(0, 40), bytes: num(e.bytes), restorable: e.restorable === true, protected: guard, removable: !guard }]
  })
}

export async function updateSpace(): Promise<SpaceReport> {
  const empty: SpaceReport = { supported: false, locked: false, keep: 1, freeBytes: 0, needBytes: 0, totalBytes: 0, removableBytes: 0, entries: [] }
  if (!hostUpdates() || !existsSync(tool())) return empty
  // Sizes of many node_modules trees can take a while on a slow disk.
  const data = await run('list', 180_000)
  return { supported: true, locked: data.locked === true, keep: num(data.keep) || 1, freeBytes: num(data.freeBytes), needBytes: num(data.needBytes), totalBytes: num(data.totalBytes), removableBytes: num(data.removableBytes), entries: entries(data.entries) }
}

/** Removes what the retention policy allows; refused while an update or recovery holds the lock. */
export async function pruneUpdateSpace() {
  if (!hostUpdates() || !existsSync(tool())) throw new UpdateError('پاکسازی نسخه‌های قبلی روی این نصب پشتیبانی نمی‌شود', 409)
  if (existsSync(lockPath())) throw new UpdateError('به‌روزرسانی یا بازیابی در حال اجراست؛ پس از پایان آن دوباره امتحان کنید', 409)
  const data = await run('prune', 600_000)
  const removed = Array.isArray(data.removed) ? data.removed.length : 0
  return { removed, freedBytes: num(data.freedBytes), freeBytes: num(data.freeBytes) }
}
