import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { db } from '@/platform/database/prisma'
import { decideMode, type InstallMode, type ModeInput } from '@/modules/installer/domain/installer'

// Install state, kept where every bundle of this process can see it (the middleware and the route handlers are separate bundles).
export const configDirectory = () => resolve(process.env.INSTALL_CONFIG_DIR || join(process.cwd(), 'storage', 'config'))
export const lockFile = () => join(configDirectory(), 'installed.lock')
export const runtimeEnvFile = () => join(configDirectory(), 'runtime.env')
export const lastErrorFile = () => join(configDirectory(), 'last-error.txt')
export function installationToken(): string {
  if (process.env.INSTALL_TOKEN?.trim()) return process.env.INSTALL_TOKEN.trim()
  try { return readFileSync(join(configDirectory(), 'install.token'), 'utf8').trim() } catch { return '' }
}

export const installerDisabled = () => process.env.INSTALL_DISABLED === 'true'
/** Booted without a database: the container start script sets SETUP_MODE=1 when no DATABASE_URL is configured. */
export const isSetupMode = () => process.env.SETUP_MODE === '1' || !String(process.env.DATABASE_URL || '').trim()

interface Cache { installed: boolean; mode?: InstallMode; at: number; inflight?: Promise<InstallMode> }
const g = globalThis as unknown as { __mobocomInstall?: Cache }
const cache = (): Cache => (g.__mobocomInstall ||= { installed: false, at: 0 })
const FRESH_MS = 3000

async function probe(): Promise<ModeInput['probe']> {
  try {
    const admins = await db.user.count({ where: { role: 'ADMIN' } })
    return admins > 0 ? 'admin' : 'no-admin'
  } catch (error) {
    const code = (error as { code?: string; errorCode?: string }).code || (error as { errorCode?: string }).errorCode
    // A missing table means a fresh database; anything else (refused connection, timeout) says nothing about it.
    return code === 'P2021' || code === 'P2022' ? 'no-schema' : 'unreachable'
  }
}

export function markInstalled() {
  const c = cache()
  c.installed = true
  c.mode = 'installed'
  try {
    mkdirSync(configDirectory(), { recursive: true })
    writeFileSync(lockFile(), `${new Date().toISOString()}\n`, { mode: 0o644 })
  } catch { /* the database already knows; the lock file only saves a query */ }
}

/**
 * The current install state. Once a site is installed the answer is a memory read; before that the database is asked
 * at most every few seconds. A working site that merely cannot reach its database is `unknown`, never "needs install".
 */
export async function installMode(force = false): Promise<InstallMode> {
  const c = cache()
  if (c.installed || installerDisabled()) return 'installed'
  if (existsSync(lockFile())) { c.installed = true; return 'installed' }
  if (!force && c.mode && Date.now() - c.at < FRESH_MS) return c.mode
  if (c.inflight && !force) return c.inflight
  c.inflight = (async () => {
    const setupMode = isSetupMode()
    const result = decideMode({ disabled: false, lockFile: false, setupMode, probe: setupMode ? 'skipped' : await probe() })
    if (result === 'installed') markInstalled()
    c.mode = result
    c.at = Date.now()
    return result
  })().finally(() => { c.inflight = undefined })
  return c.inflight
}
