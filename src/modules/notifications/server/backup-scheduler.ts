import { spawn } from 'node:child_process'
import path from 'node:path'

const state = globalThis as typeof globalThis & {
  backupTimer?: ReturnType<typeof setInterval>
  backupBusy?: boolean
  backupBusySince?: number
}

const WORKER = 'scripts/backup-worker.cjs'
// A stuck worker must not block the panel forever.
const BUSY_TTL = 30 * 60_000

function postgresReady() {
  return /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || '')
}

export function backupRunning() {
  if (!state.backupBusy) return false
  if (state.backupBusySince && Date.now() - state.backupBusySince > BUSY_TTL) {
    state.backupBusy = false
    state.backupBusySince = undefined
    return false
  }
  return true
}

function release() {
  state.backupBusy = false
  state.backupBusySince = undefined
}

/**
 * Starts the encrypted-backup worker. `force` is set by the admin panel's
 * manual button, which must not wait for the next two-hour slot.
 */
export function runBackupWorker(force = false) {
  if (backupRunning()) return false
  if (!postgresReady()) return false
  state.backupBusy = true
  state.backupBusySince = Date.now()
  const child = spawn(process.execPath, [path.join(process.cwd(), WORKER)], {
    windowsHide: true,
    stdio: 'ignore',
    env: force ? { ...process.env, BACKUP_FORCE: '1' } : process.env,
  })
  child.once('error', release)
  child.once('close', release)
  return true
}

export interface ScriptRun {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  message?: string
}

/**
 * Runs one of the restore scripts to completion and returns its JSON result.
 * Only fixed script names are accepted; arguments stay operator-controlled.
 */
export function runBackupScript(script: string, args: string[], extraEnv: Record<string, string> = {}, timeoutMs = 240_000): Promise<ScriptRun> {
  const allowed = new Set(['scripts/restore-backup.cjs', 'scripts/restore-live.cjs'])
  if (!allowed.has(script)) return Promise.resolve({ ok: false, code: null, stdout: '', stderr: '', message: 'UNKNOWN_SCRIPT' })
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), script), ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: ScriptRun) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, code: null, stdout, stderr, message: 'TIMEOUT' })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { if (stdout.length < 20000) stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { if (stderr.length < 20000) stderr += chunk.toString() })
    child.once('error', () => finish({ ok: false, code: null, stdout, stderr, message: 'SCRIPT_UNAVAILABLE' }))
    child.once('close', (code) => finish({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }))
  })
}

export function startBackupScheduler() {
  if (state.backupTimer || process.env.BACKUP_SCHEDULER === 'false' || !postgresReady()) return
  state.backupTimer = setInterval(runBackupWorker, 60000)
  state.backupTimer.unref()
  runBackupWorker()
}

