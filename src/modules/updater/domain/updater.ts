// Updater rules: versions, release feed, how this site can be updated. Pure functions with no imports.

export class UpdateError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// ------------------------------------------------------------------ versions

export interface Version { major: number; minor: number; patch: number; pre: string[] }

/** "v1.5.0", "1.6.0-rc.1" → parts; null when it is not a version. Build metadata (+x) is ignored. */
export function parseVersion(text: unknown): Version | null {
  const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,40}))?(?:\+[0-9A-Za-z.-]{1,40})?$/.exec(String(text ?? '').trim())
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ? match[4].split('.') : [] }
}

/** -1, 0 or 1 by semantic-version precedence (a pre-release is older than its release). */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) throw new UpdateError('نسخه معتبر نیست')
  for (const key of ['major', 'minor', 'patch'] as const) if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1
    if (pn !== qn) return pn ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

/** A git tag the updater may check out: a plain version with an optional leading "v". Anything else is refused. */
export const isSafeRef = (ref: unknown): ref is string => typeof ref === 'string' && ref.length <= 60 && parseVersion(ref) !== null && /^[v0-9][0-9A-Za-z.+-]*$/.test(ref)

// ------------------------------------------------------------------ release feed

export interface Release { version: string; tag: string; notes: string; url: string; publishedAt: string; prerelease: boolean }

const httpsUrl = (value: unknown) => { try { const u = new URL(String(value)); return u.protocol === 'https:' ? u.toString() : '' } catch { return '' } }

/** A GitHub "release" object or a self-hosted feed entry → one shape. Anything unusable → null. */
export function normalizeRelease(input: unknown): Release | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const tag = String(raw.tag_name ?? raw.tag ?? raw.version ?? '').trim()
  const parsed = parseVersion(tag)
  if (!parsed) return null
  if (raw.draft === true) return null
  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.pre.length ? `-${parsed.pre.join('.')}` : ''}`
  const published = new Date(String(raw.published_at ?? raw.publishedAt ?? raw.date ?? ''))
  return {
    version, tag, notes: String(raw.body ?? raw.notes ?? '').replace(/\r\n/g, '\n').slice(0, 20_000),
    url: httpsUrl(raw.html_url ?? raw.url), publishedAt: Number.isNaN(published.getTime()) ? '' : published.toISOString(), prerelease: raw.prerelease === true || parsed.pre.length > 0,
  }
}

export const isValidRepo = (repo: unknown): repo is string => typeof repo === 'string' && /^[A-Za-z0-9_.-]{1,80}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)

/** The newest stable release newer than `current` (pre-releases only when the current version is one). */
export function pickUpdate(current: string, releases: Release[]): Release | null {
  const cur = parseVersion(current)
  const allowPre = !!cur && cur.pre.length > 0
  const newer = releases.filter((r) => (allowPre || !r.prerelease) && compareVersions(r.version, current) > 0)
  newer.sort((a, b) => compareVersions(b.version, a.version))
  return newer[0] ?? null
}

// ------------------------------------------------------------------ how this site is updated

export type Method = 'systemd' | 'package' | 'hook' | 'docker' | 'manual'

export interface Environment { dockerenv: boolean; hasGit: boolean; helper: boolean; hookUrl: string; packageReady?: boolean }

/**
 * `systemd`: a git checkout with the root helper installed (one click, with automatic rollback).
 * `hook`: a deploy webhook (for example Coolify's) starts the rebuild. `docker`: an image is redeployed by the host.
 * `manual`: anything else — the page explains the steps.
 */
export function chooseMethod(env: Environment): Method {
  if (env.packageReady && env.helper) return 'package'
  if (env.hasGit && env.helper && !env.dockerenv) return 'systemd'
  if (env.hookUrl) return 'hook'
  if (env.dockerenv) return 'docker'
  return 'manual'
}

/** A deploy-hook address: https only, and never a private or local host. */
export function safeHookUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let url: URL
  try { url = new URL(raw) } catch { throw new UpdateError('نشانی وب‌هوک معتبر نیست') }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:') throw new UpdateError('نشانی وب‌هوک باید https باشد')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1' || host.startsWith('[')) throw new UpdateError('نشانی وب‌هوک نباید محلی یا خصوصی باشد')
  return url.toString()
}

// ------------------------------------------------------------------ progress written by deploy/ubuntu/self-update.sh

export type RunStatus = 'idle' | 'running' | 'done' | 'failed' | 'rolled-back'
export interface RunState { status: RunStatus; step: string; target: string; previous: string; at: string }

export function parseRunState(text: string): RunState {
  const empty: RunState = { status: 'idle', step: '', target: '', previous: '', at: '' }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const status = (['running', 'done', 'failed', 'rolled-back'] as string[]).includes(String(raw.status)) ? String(raw.status) as RunStatus : 'idle'
    return { status, step: String(raw.step ?? '').slice(0, 80), target: String(raw.target ?? '').slice(0, 60), previous: String(raw.previous ?? '').slice(0, 60), at: String(raw.at ?? '').slice(0, 40) }
  } catch { return empty }
}

/** A run that says "running" but has not written anything for this long died with its process. */
export const RUN_STALE_MS = 45 * 60_000
export function effectiveStatus(state: RunState, now = Date.now()): RunStatus {
  if (state.status !== 'running') return state.status
  const at = Date.parse(state.at)
  return Number.isNaN(at) || now - at > RUN_STALE_MS ? 'failed' : 'running'
}

// ------------------------------------------------------------------ migrations

/** Migration folder names that exist in the code but are not recorded as applied. */
export function pendingMigrations(available: string[], applied: string[]): string[] {
  const done = new Set(applied)
  return available.filter((name) => /^\d{14}_/.test(name) && !done.has(name)).sort()
}
