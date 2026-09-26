import { upstreamUrl } from '@/modules/subscriptions/domain/subscription-content'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { randomPassword } from '@/shared/security/random'
import { decryptPanelCredential } from '@/modules/providers/server/panel-credentials'

// ============ Panel adapter interface ============
export interface ProvisionInput {
  expiresAt?: Date
  username: string
  trafficGB: number
  days: number
  deviceLimit: number
  inbounds?: string[]
}

/**
 * The panel-side group a user has to belong to for its config to exist:
 * a Remnawave *internal squad* or a PasarGuard *group* (which carries the
 * inbound tags / services). Both panels let a shop pick it by name.
 */
export interface PanelGroup {
  id: string
  name: string
  /** how many inbounds (services) the group carries */
  inboundsCount?: number
}

export interface PanelUser {
  username: string
  trafficUsed: number // bytes
  trafficLimit: number // bytes
  expiresAt: Date | null
  status: 'active' | 'disabled' | 'expired' | 'limit_reached' | 'unknown'
  subUrl: string
  /** squad UUIDs the user belongs to; `undefined` when the panel does not report them */
  squads?: string[]
  /** Remnawave short id the configs are keyed by */
  shortUuid?: string
  lastOpenedAt?: Date | null
  lastUserAgent?: string
  lifetimeTrafficUsed?: number
  deviceLimit?: number | null
}

/** Subscription flavours a panel can render for a client. */
export type SubFormat = 'links' | 'clash' | 'singbox' | 'xray'

export interface SubContent {
  ok: boolean
  message?: string
  /** ready-to-serve body (base64 links, yaml, json…) */
  body?: string
  contentType?: string
  /** the individual `vless://…` configs, when the panel hands them out */
  links?: string[]
}

export interface PanelDevice {
  hwid: string
  platform?: string
  deviceModel?: string
  osVersion?: string
  userAgent?: string
  createdAt?: Date | null
}

export interface PanelAdapter {
  testConnection(): Promise<{ ok: boolean; message?: string }>
  normalizeUsername(username: string): string
  createUser(input: ProvisionInput): Promise<{ ok: boolean; message?: string; user?: PanelUser }>
  updateUser(username: string, input: Partial<ProvisionInput> & { disabled?: boolean }): Promise<{ ok: boolean; message?: string; user?: PanelUser }>
  deleteUser(username: string): Promise<{ ok: boolean; message?: string }>
  getUser(username: string): Promise<{ ok: boolean; message?: string; user?: PanelUser }>
  /** Connected devices (HWID) — empty when the panel version does not expose them. */
  listDevices(username: string): Promise<{ ok: boolean; message?: string; devices: PanelDevice[] }>
  deleteDevice(username: string, hwid: string): Promise<{ ok: boolean; message?: string }>
  /** Regenerates the subscription link, invalidating the previous one. */
  revokeSubscription(username: string): Promise<{ ok: boolean; message?: string; subUrl?: string }>
  /** Groups a panel user can be attached to (Remnawave squads / PasarGuard groups). */
  listGroups(): Promise<{ ok: boolean; message?: string; groups: PanelGroup[] }>
  /**
   * The configs a client would receive, straight from the panel. Serving these
   * through our own URL keeps a customer's subscription working even when the
   * panel's public subscription host is unreachable.
   */
  getSubscription(username: string, format: SubFormat): Promise<SubContent>
  /** Zeroes the traffic counter. */
  resetTraffic(username: string): Promise<{ ok: boolean; message?: string }>
  /** Kicks every connected device without deleting the user. */
  resetDevices(username: string): Promise<{ ok: boolean; message?: string }>
}

// ============ Helpers ============
function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, '') + path
}

async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    return { res, data, text }
  } finally {
    clearTimeout(t)
  }
}

function gbToBytes(gb: number) {
  return Math.round(gb * 1024 * 1024 * 1024)
}

function bytesToGb(bytes: number) {
  return Math.max(0, Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100)
}

/** Surfaces a panel validation error instead of a bare "Validation failed". */
function formatPanelError(data: any, status: number) {
  const errors = data?.errors
  if (Array.isArray(errors) && errors.length) {
    const detail = errors
      .slice(0, 3)
      .map((e: any) => `${(e?.path || []).join('.') || 'body'}: ${e?.message || e?.code || 'invalid'}`)
      .join('; ')
    return `${data?.message || `HTTP ${status}`} — ${detail}`
  }
  return data?.message || data?.error || `HTTP ${status}`
}

// ============ Remnawave adapter ============
// Docs: https://docs.rw/api  (Bearer token auth, /api/users)
export class RemnaWaveAdapter implements PanelAdapter {
  constructor(
    private baseUrl: string,
    private token: string,
    private inbounds: string[] = [],
    /**
     * Internal squads the panel should hand to every new user — UUIDs or squad
     * names, comma separated in the admin form. A Remnawave user with no squad
     * gets an empty subscription, so this is what makes a sold plan usable.
     */
    private squadRefs: string[] = []
  ) {}

  private squadState: { supported: boolean; uuids: string[] } | null = null
  private userScanCache: Map<string, any> | null = null

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  normalizeUsername(u: string) {
    return u.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30)
  }

  async testConnection() {
    try {
      const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/users?size=1'), { headers: this.headers() })
      if (res.ok) return { ok: true }
      return { ok: false, message: `HTTP ${res.status} ${data?.message || ''}`.trim() }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'connection failed' }
    }
  }

  /** Health endpoint is available on current RemnaWave builds; older forks fall back to a read-only user probe. */
  async getHealth(): Promise<{ ok: boolean; source: string; latencyMs: number; components: number; message: string }> {
    const started = Date.now()
    try {
      const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/system/health'), { headers: this.headers(), timeoutMs: 8000 })
      if (res.ok) {
        const body = data?.response || data || {}
        const services = Array.isArray(body.runtimeMetrics) ? body.runtimeMetrics : Array.isArray(body.pm2Stats) ? body.pm2Stats : []
        const reported = String(body.status || body.health || '').toLowerCase()
        const healthy = body.isHealthy !== false && !['unhealthy', 'down', 'error', 'degraded'].includes(reported)
        return { ok: healthy, source: 'system/health', latencyMs: Date.now() - started, components: services.length, message: healthy ? 'Panel health endpoint responded.' : 'Panel reported degraded health.' }
      }
      if (res.status !== 404 && res.status !== 405) return { ok: false, source: 'system/health', latencyMs: Date.now() - started, components: 0, message: `HTTP ${res.status}` }
    } catch (error) { return { ok: false, source: 'system/health', latencyMs: Date.now() - started, components: 0, message: error instanceof Error ? error.message : 'connection failed' } }
    const fallback = await this.testConnection()
    return { ok: fallback.ok, source: 'users-probe', latencyMs: Date.now() - started, components: 0, message: fallback.message || (fallback.ok ? 'Read-only user probe succeeded.' : 'Panel unavailable.') }
  }

  /**
   * Panel keys differ per Remnawave build: classic builds key users by `uuid`,
   * the Happ fork by a numeric `id`. Everything below accepts both.
   */
  private key(user: any): string {
    return String(user?.uuid ?? user?.id ?? '')
  }

  private numericKey(key: string): number | null {
    return /^\d+$/.test(key) ? Number(key) : null
  }

  /** Tag validation on newer builds is `/^[A-Z0-9_]+$/`. */
  private static readonly TAG = 'HAPPVPN'

  private mapUser(u: any, baseUrlOverride?: string): PanelUser {
    const expireMs = u.expireAt ? Date.parse(u.expireAt) : NaN
    const limit = Number(u.trafficLimitBytes ?? u.trafficLimit ?? 0)
    // the Happ fork nests usage under userTraffic
    const used = Number(u.userTraffic?.usedTrafficBytes ?? u.usedTrafficBytes ?? u.usedTraffic ?? 0)
    const lifetimeRaw = u.userTraffic?.lifetimeUsedTrafficBytes ?? u.userTraffic?.lifetimeTrafficUsedBytes ?? u.lifetimeTrafficUsedBytes
    const subUrl =
      u.subscriptionUrl || u.subUrl || (u.shortUuid ? joinUrl(baseUrlOverride || this.baseUrl, `/sub/${u.shortUuid}`) : '')

    const state = String(u.status ?? u.state ?? u.activeUser?.userState ?? '').toUpperCase()
    let status: PanelUser['status'] = 'unknown'
    if (state === 'DISABLED' || state === 'INACTIVE') status = 'disabled'
    else if (state === 'LIMITED' || state === 'LIMIT_REACHED') status = 'limit_reached'
    else if (state === 'EXPIRED') status = 'expired'
    else if (state === 'ACTIVE') status = 'active'
    // nothing reported at all: keep the previous optimistic default
    else if (!state) status = 'active'
    else if (!Number.isNaN(expireMs) && expireMs < Date.now()) status = 'expired'

    return {
      username: u.username,
      trafficUsed: used,
      trafficLimit: limit,
      expiresAt: Number.isNaN(expireMs) ? null : new Date(expireMs),
      status,
      subUrl,
      squads: this.squadsOf(u),
      shortUuid: this.shortOf(u) || undefined,
      lastOpenedAt: u.subLastOpenedAt && Number.isFinite(Date.parse(u.subLastOpenedAt)) ? new Date(u.subLastOpenedAt) : null,
      lastUserAgent: typeof u.subLastUserAgent === 'string' ? u.subLastUserAgent.slice(0, 160) : undefined,
      lifetimeTrafficUsed: lifetimeRaw != null && Number.isFinite(Number(lifetimeRaw)) ? Number(lifetimeRaw) : undefined,
      deviceLimit: u.hwidDeviceLimit != null && Number.isFinite(Number(u.hwidDeviceLimit)) ? Number(u.hwidDeviceLimit) : null,
    }
  }

  /** The squad UUIDs a panel user is a member of (`undefined` when not reported). */
  private squadsOf(u: any): string[] | undefined {
    if (!Array.isArray(u?.activeInternalSquads)) return undefined
    return u.activeInternalSquads.map((s: any) => String(s?.uuid ?? s ?? '')).filter(Boolean)
  }

  async listGroups() {
    try {
      const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/internal-squads'), { headers: this.headers() })
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, groups: [] as PanelGroup[] }
      const raw = data?.response?.internalSquads ?? data?.response ?? data?.internalSquads ?? []
      const rows: any[] = Array.isArray(raw) ? raw : []
      return {
        ok: true,
        groups: rows
          .map((s) => ({
            id: String(s.uuid ?? s.id ?? ''),
            name: String(s.name ?? ''),
            inboundsCount: Array.isArray(s.inbounds) ? s.inbounds.length : undefined,
          }))
          .filter((s) => s.id),
      }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed', groups: [] as PanelGroup[] }
    }
  }

  /**
   * Turns the configured squad references into the UUIDs the panel expects.
   * Older Remnawave builds have no squads at all — `supported: false` then
   * keeps the legacy `activeUserInbounds` behaviour instead of inventing one.
   */
  private async resolveSquads(): Promise<{ supported: boolean; uuids: string[] }> {
    if (this.squadState) return this.squadState
    const list = await this.listGroups()
    if (!list.ok) {
      this.squadState = { supported: false, uuids: [] }
      return this.squadState
    }
    const configured = this.squadRefs.map((s) => s.trim()).filter(Boolean)
    // the old panel form only had an "inbounds" box; admins typed squad names in it
    const refs = configured.length ? configured : this.inbounds.map((s) => s.trim()).filter(Boolean)
    const uuids = new Set<string>()
    for (const ref of refs) {
      const hit =
        list.groups.find((s) => s.id.toLowerCase() === ref.toLowerCase()) ??
        list.groups.find((s) => s.name.toLowerCase() === ref.toLowerCase())
      if (hit) uuids.add(hit.id)
    }
    if (!uuids.size && !refs.length && list.groups.length) {
      // nothing configured: a user without a squad would get an empty
      // subscription, so fall back to the default (else the first) squad
      const fallback = list.groups.find((s) => /default/i.test(s.name)) ?? list.groups[0]
      uuids.add(fallback.id)
    }
    // stale references are handed to the panel unchanged so it reports them
    this.squadState = { supported: true, uuids: uuids.size ? [...uuids] : refs }
    return this.squadState
  }

  /**
   * Finds a user on any Remnawave build: the dedicated route first (Happ fork +
   * recent v2), then a paged scan. The `?username=` query is ignored by some
   * builds, so it is never trusted on its own.
   */
  private async findUser(username: string): Promise<any | null> {
    const direct = await httpJson(joinUrl(this.baseUrl, `/api/users/by-username/${encodeURIComponent(username)}`), {
      headers: this.headers(),
    })
    if (direct.res.ok) {
      const hit = direct.data?.response
      const rows = Array.isArray(hit) ? hit : hit?.users
      if (Array.isArray(rows)) {
        const found = rows.find((u: any) => u.username === username)
        if (found) return found
      } else if (hit?.username === username) {
        return hit
      }
    }

    if (this.userScanCache) return this.userScanCache.get(username) || null
    const pageSize = 200
    const cache = new Map<string, any>()
    for (let page = 0; page < 25; page++) {
      const list = await httpJson(joinUrl(this.baseUrl, `/api/users?size=${pageSize}&start=${page * pageSize}`), {
        headers: this.headers(),
      })
      if (!list.res.ok) throw new Error(`panel user list HTTP ${list.res.status}`)
      const rows: any[] = list.data?.response?.users || []
      for (const row of rows) if (typeof row?.username === 'string') cache.set(row.username, row)
      if (rows.length < pageSize) { this.userScanCache = cache; return cache.get(username) || null }
    }
    throw new Error('panel user lookup exceeded 5000 rows; narrow the panel search')
  }

  /**
   * PATCH /api/users — the body shape changed across builds (`uuid` vs numeric
   * `id` vs `username`), so we walk the shapes until one is accepted.
   */
  private async patchUser(user: any, fields: Record<string, unknown>) {
    const key = this.key(user)
    const numeric = this.numericKey(key)
    const candidates: Record<string, unknown>[] = []
    if (numeric != null) candidates.push({ id: numeric, ...fields })
    if (key && numeric == null) candidates.push({ uuid: key, ...fields })
    candidates.push({ username: user.username, ...fields })
    if (numeric != null) candidates.push({ uuid: key, ...fields })

    let last = 'panel rejected the update'
    for (const body of candidates) {
      const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/users'), {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
      })
      if (res.ok) { this.userScanCache = null; return { ok: true as const, user: this.mapUser(data?.response || data) } }
      last = data?.message || `HTTP ${res.status}`
      // only key-shape problems are worth retrying
      const retryable = Array.isArray(data?.errors)
        ? data.errors.some((e: any) => (e?.path || []).some((p: string) => ['id', 'uuid', 'username'].includes(String(p))))
        : false
      if (!retryable) break
    }
    return { ok: false as const, message: last }
  }

  async createUser(input: ProvisionInput) {
    try {
      const bytes = gbToBytes(input.trafficGB)
      const squads = await this.resolveSquads()
      const body: Record<string, unknown> = {
        username: input.username,
        expireAt: new Date(Date.now() + input.days * 86400_000).toISOString(),
        trafficLimitStrategy: 'NO_RESET',
        // newer builds read trafficLimitBytes, older ones trafficLimit — send both
        trafficLimitBytes: bytes,
        trafficLimit: bytes,
        tag: RemnaWaveAdapter.TAG,
      }
      if (squads.supported) {
        // without a squad the account has no config at all
        if (!squads.uuids.length) return { ok: false, message: 'no internal squad is configured for this panel' }
        body.activeInternalSquads = squads.uuids
      }
      if (input.deviceLimit > 0) body.hwidDeviceLimit = input.deviceLimit
      if (!squads.supported && input.inbounds?.length) body.activeUserInbounds = input.inbounds
      const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/users'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        return { ok: false, message: formatPanelError(data, res.status) }
      }
      return { ok: true, user: this.mapUser(data?.response || data) }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async updateUser(username: string, input: Partial<ProvisionInput> & { disabled?: boolean }) {
    try {
      const found = await this.findUser(username)
      if (!found) return { ok: false, message: 'user not found on panel' }
      const fields: Record<string, unknown> = {}
      if (input.days != null) fields.expireAt = new Date(Date.now() + input.days * 86400_000).toISOString()
      if (input.expiresAt) fields.expireAt = input.expiresAt.toISOString()
      if (input.trafficGB != null) {
        const bytes = gbToBytes(input.trafficGB)
        fields.trafficLimitBytes = bytes
        fields.trafficLimit = bytes
        fields.trafficLimitStrategy = 'NO_RESET'
      }
      if (input.deviceLimit != null) fields.hwidDeviceLimit = input.deviceLimit
      // accounts created before squads were configured (or by an older panel)
      // carry no config — every update doubles as a repair
      const squads = await this.resolveSquads()
      const currentSquads = this.squadsOf(found)
      if (squads.supported && !currentSquads?.length && squads.uuids.length) fields.activeInternalSquads = squads.uuids
      if (input.disabled != null) {
        // Remnawave reads `status`; `isActive` is the older flag. Sending both
        // is harmless (unknown fields are ignored) and covers either build.
        fields.status = input.disabled ? 'DISABLED' : 'ACTIVE'
        fields.isActive = !input.disabled
      }
      if (Object.keys(fields).length === 0) return { ok: true, user: this.mapUser(found) }
      const res = await this.patchUser(found, fields)
      if (!res.ok || input.disabled == null) return res

      // a build that stamped the request 200 while ignoring both flags would
      // leave a paying customer with a working account after "disable" — make
      // sure the state really changed, otherwise use the action route
      const expected = input.disabled ? 'disabled' : 'active'
      const got = res.user?.status
      const wrong = input.disabled ? got !== 'disabled' : got === 'disabled'
      if (!wrong) return res
      const forced = await this.setStatusViaAction(found, input.disabled)
      if (forced.ok) return forced
      return { ok: false, message: `panel did not ${expected === 'disabled' ? 'disable' : 'enable'} the account` }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  /** `POST /api/users/{uuid}/actions/{enable|disable}` — the state route. */
  private async setStatusViaAction(user: any, disabled: boolean) {
    try {
      const key = encodeURIComponent(this.key(user))
      const { res, data } = await httpJson(
        joinUrl(this.baseUrl, `/api/users/${key}/actions/${disabled ? 'disable' : 'enable'}`),
        { method: 'POST', headers: this.headers() }
      )
      if (res.ok) return { ok: true as const, user: this.mapUser(data?.response || data) }
      // A029 = the user is already in the requested state
      if (String(data?.errorCode || '') === 'A029') return { ok: true as const, user: this.mapUser(user) }
      return { ok: false as const, message: formatPanelError(data, res.status) }
    } catch (e: any) {
      return { ok: false as const, message: e?.message || 'request failed' }
    }
  }

  async deleteUser(username: string) {
    try {
      const found = await this.findUser(username)
      if (!found) return { ok: true }
      const { res, data } = await httpJson(joinUrl(this.baseUrl, `/api/users/${encodeURIComponent(this.key(found))}`), {
        method: 'DELETE',
        headers: this.headers(),
      })
      if (!res.ok) return { ok: false, message: formatPanelError(data, res.status) }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async getUser(username: string) {
    try {
      const found = await this.findUser(username)
      if (!found) return { ok: false, message: 'not found' }
      return { ok: true, user: this.mapUser(found) }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  /** The short id (`…/clientservice/<short>`) the user's configs are keyed by. */
  private shortOf(user: any): string {
    const direct = String(user?.shortUuid ?? user?.short_uuid ?? '').trim()
    if (direct) return direct
    const url = String(user?.subscriptionUrl ?? user?.subUrl ?? '')
    return url ? url.split('?')[0].split('/').filter(Boolean).pop() || '' : ''
  }

  /**
   * Real client configs, taken from the panel's own API instead of its public
   * subscription host:
   *   links   → `/api/subscriptions/by-short-uuid/{short}` (the panel's own links)
   *   clash   → `/api/sub/{short}/clash`
   *   singbox → `/api/sub/{short}/singbox`
   *   xray    → `/api/sub/{short}/json`
   */
  async getSubscription(username: string, format: SubFormat): Promise<SubContent> {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel' }
      const short = this.shortOf(user)
      if (!short) return { ok: false, message: 'panel user has no subscription id' }

      if (format === 'links') {
        const { res, data } = await httpJson(joinUrl(this.baseUrl, `/api/subscriptions/by-short-uuid/${encodeURIComponent(short)}`), {
          headers: this.headers(),
        })
        if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
        const links: string[] = (data?.response?.links || []).filter((l: any) => typeof l === 'string' && l.includes('://'))
        if (!links.length) return { ok: false, message: 'panel returned no config for this account' }
        // the classic subscription body: the links base64-encoded, one per line
        return {
          ok: true,
          links,
          body: Buffer.from(links.join('\n'), 'utf8').toString('base64'),
          contentType: 'text/plain; charset=utf-8',
        }
      }

      const path = format === 'clash' ? 'clash' : format === 'singbox' ? 'singbox' : 'json'
      const { res, text } = await httpJson(joinUrl(this.baseUrl, `/api/sub/${encodeURIComponent(short)}/${path}`), { headers: this.headers() })
      if (!res.ok || !text.trim()) return { ok: false, message: `panel did not render the ${format} config (HTTP ${res.status})` }
      return {
        ok: true,
        body: text,
        contentType: format === 'clash' ? 'text/yaml; charset=utf-8' : 'application/json; charset=utf-8',
      }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async listDevices(username: string) {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel', devices: [] }
      const { res, data } = await httpJson(joinUrl(this.baseUrl, `/api/hwid/devices/${encodeURIComponent(this.key(user))}`), { headers: this.headers() })
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, devices: [] }
      const rows: any[] = data?.response?.devices || data?.devices || (Array.isArray(data?.response) ? data.response : []) || []
      return {
        ok: true,
        devices: rows.map((d) => ({
          hwid: String(d.hwid || d.deviceId || ''),
          platform: d.platform || d.deviceOs || '',
          deviceModel: d.deviceModel || '',
          osVersion: d.osVersion || '',
          userAgent: d.userAgent || '',
          createdAt: d.createdAt ? new Date(d.createdAt) : null,
        })).filter((d) => d.hwid),
      }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed', devices: [] }
    }
  }

  async deleteDevice(username: string, hwid: string) {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel' }
      const key = this.key(user)
      const numeric = this.numericKey(key)
      // `{ userId, hwid }` on the Happ fork, `{ userUuid, hwid }` on classic builds
      const attempts: Record<string, unknown>[] = []
      if (numeric != null) attempts.push({ userId: numeric, hwid })
      attempts.push({ userUuid: key, hwid })

      let last = 'panel rejected the request'
      for (const body of attempts) {
        const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/hwid/devices/delete'), {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
        })
        if (res.ok) return { ok: true }
        last = formatPanelError(data, res.status)
        if (res.status !== 400) break
      }
      // older builds expose a plain DELETE route instead
      for (const target of [hwid, `${key}/${hwid}`]) {
        const alt = await httpJson(joinUrl(this.baseUrl, `/api/hwid/devices/${encodeURIComponent(target)}`), {
          method: 'DELETE',
          headers: this.headers(),
        })
        if (alt.res.ok) return { ok: true }
      }
      return { ok: false, message: last }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async revokeSubscription(username: string) {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel' }
      const { res, data } = await httpJson(
        joinUrl(this.baseUrl, `/api/users/${encodeURIComponent(this.key(user))}/actions/revoke`),
        { method: 'POST', headers: this.headers() }
      )
      if (!res.ok) return { ok: false, message: formatPanelError(data, res.status) }
      const fresh = await this.getUser(username)
      return { ok: true, subUrl: fresh.user?.subUrl || '' }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async resetTraffic(username: string) {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel' }
      const key = encodeURIComponent(this.key(user))
      // path changed across builds: reset-traffic (Happ fork) vs reset-traffic-usage
      let last = 'panel rejected the reset'
      for (const action of ['reset-traffic', 'reset-traffic-usage']) {
        const { res, data } = await httpJson(joinUrl(this.baseUrl, `/api/users/${key}/actions/${action}`), {
          method: 'POST',
          headers: this.headers(),
        })
        if (res.ok) return { ok: true }
        last = formatPanelError(data, res.status)
        if (res.status !== 404) break
      }
      return { ok: false, message: last }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async resetDevices(username: string) {
    try {
      const user = await this.findUser(username)
      if (!user) return { ok: false, message: 'user not found on panel' }
      const key = this.key(user)
      const numeric = this.numericKey(key)
      const attempts: Record<string, unknown>[] = []
      if (numeric != null) attempts.push({ userId: numeric })
      attempts.push({ userUuid: key })

      let last = 'panel rejected the request'
      for (const body of attempts) {
        const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/hwid/devices/delete-all'), {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
        })
        if (res.ok) return { ok: true }
        last = formatPanelError(data, res.status)
        if (res.status !== 400) break
      }
      // legacy route
      const legacy = await httpJson(joinUrl(this.baseUrl, `/api/hwid/devices/delete-all/${encodeURIComponent(key)}`), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({}),
      })
      if (legacy.res.ok) return { ok: true }
      return { ok: false, message: last }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }
}

// ============ PasarGuard adapter (Marzban-compatible API) ============
// Source: https://github.com/PasarGuard/panel
//   POST /api/admin/token (OAuth2 form) -> access_token
//   users:  POST /api/user · GET/PUT/DELETE /api/user/{username}
//   groups: GET /api/groups  (a group owns the inbound tags = the services)
//
// A PasarGuard user's config comes from its **groups** (`group_ids`); a user
// with no group receives no config at all. Pre-group Marzban builds instead
// take `inbounds` grouped by protocol, so both shapes are supported.
export class PasarGuardAdapter implements PanelAdapter {
  private cachedToken: { token: string; at: number } | null = null
  private groupState: { supported: boolean; ids: number[]; refs: string[] } | null = null

  constructor(
    private baseUrl: string,
    private adminUsername: string,
    private adminPassword: string,
    /** legacy `proto:tag` list for pre-group Marzban builds */
    private inbounds: string[] = [],
    /** the groups (name or id) every new user must join */
    private groupRefs: string[] = []
  ) {}

  normalizeUsername(u: string) {
    return u.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30)
  }

  private async login(): Promise<string | null> {
    if (this.cachedToken && Date.now() - this.cachedToken.at < 10 * 60_000) {
      return this.cachedToken.token
    }
    const credentials = { username: this.adminUsername, password: this.adminPassword }
    // the panel declares an OAuth2 password flow at /api/admin/token; some forks
    // take a JSON body instead, so both are tried
    const attempts: RequestInit[] = [
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ ...credentials, grant_type: 'password', scope: '', client_id: '', client_secret: '' }).toString(),
      },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(credentials),
      },
    ]
    for (const init of attempts) {
      try {
        const { res, data } = await httpJson(joinUrl(this.baseUrl, '/api/admin/token'), init)
        const token = data?.access_token || data?.accessToken
        if (res.ok && token) {
          this.cachedToken = { token, at: Date.now() }
          return token
        }
      } catch {
        // try the next shape
      }
    }
    return null
  }

  private async authedFetch(path: string, init: RequestInit = {}) {
    const token = await this.login()
    if (!token) throw new Error('panel login failed')
    return httpJson(joinUrl(this.baseUrl, path), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) },
    })
  }

  async testConnection() {
    try {
      const { res, data } = await this.authedFetch('/api/system')
      if (res.ok) return { ok: true }
      return { ok: false, message: `HTTP ${res.status} ${data?.detail || ''}`.trim() }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'connection failed' }
    }
  }

  /** `expire` is unix seconds on Marzban and an ISO datetime on PasarGuard v5. */
  private parseExpire(value: any): Date | null {
    if (typeof value === 'number') return value > 0 ? new Date(value * 1000) : null
    if (typeof value === 'string' && value) {
      const ms = Date.parse(value)
      return Number.isNaN(ms) ? null : new Date(ms)
    }
    return null
  }

  private mapUser(u: any): PanelUser {
    const limit = Number(u.data_limit || 0)
    const used = Number(u.used_traffic || 0)
    let status: PanelUser['status'] = 'unknown'
    if (u.status === 'disabled' || u.status === 'on_hold') status = 'disabled'
    else if (u.status === 'limited') status = 'limit_reached'
    else if (u.status === 'expired') status = 'expired'
    else if (u.status === 'active') status = 'active'
    return {
      username: u.username,
      trafficUsed: used,
      trafficLimit: limit,
      expiresAt: this.parseExpire(u.expire),
      status,
      subUrl: u.subscription_url || '',
      // `group_names` is what tells us whether the account still has a group
      // (empty list = no config); the API often hides it, so it stays undefined
      squads: Array.isArray(u.group_names) ? u.group_names.map((g: any) => String(g)) : undefined,
    }
  }

  async listGroups() {
    try {
      const { res, data } = await this.authedFetch('/api/groups')
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, groups: [] as PanelGroup[] }
      const rows: any[] = data?.groups || data?.response?.groups || []
      return {
        ok: true,
        groups: (Array.isArray(rows) ? rows : [])
          .map((g) => ({
            id: String(g.id ?? ''),
            name: String(g.name ?? ''),
            inboundsCount: Array.isArray(g.inbound_tags) ? g.inbound_tags.length : undefined,
          }))
          .filter((g) => g.id),
      }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed', groups: [] as PanelGroup[] }
    }
  }

  /**
   * Resolves the configured groups to their numeric ids. `supported: false`
   * means the build has no groups at all (Marzban < the group release), so the
   * legacy `inbounds` payload is used instead.
   */
  private async resolveGroups(): Promise<{ supported: boolean; ids: number[]; refs: string[] }> {
    if (this.groupState) return this.groupState
    const list = await this.listGroups()
    if (!list.ok) {
      this.groupState = { supported: false, ids: [], refs: [] }
      return this.groupState
    }
    const refs = this.groupRefs.map((r) => r.trim()).filter(Boolean)
    const ids = new Set<number>()
    for (const ref of refs) {
      const hit = list.groups.find((g) => g.id === ref) ?? list.groups.find((g) => g.name.toLowerCase() === ref.toLowerCase())
      if (hit) ids.add(Number(hit.id))
    }
    if (!ids.size && !refs.length && list.groups.length) {
      // a user without a group gets no config, so fall back to the default
      // (else the first) group instead of selling a broken account
      const fallback = list.groups.find((g) => /default|main/i.test(g.name)) ?? list.groups[0]
      ids.add(Number(fallback.id))
    }
    this.groupState = { supported: true, ids: [...ids].filter((n) => Number.isFinite(n)), refs }
    return this.groupState
  }

  /** Inbounds grouped by protocol — only used by pre-group Marzban builds. */
  private legacyInboundsBody() {
    const inbounds: Record<string, string[]> = {}
    const proxies: Record<string, object> = {}
    for (const ref of this.inbounds) {
      const [head, ...rest] = ref.split(':')
      const proto = rest.length ? head.trim() : '_'
      const tag = (rest.length ? rest.join(':') : head).trim()
      if (!tag) continue
      ;(inbounds[proto] ||= []).push(tag)
      if (proto !== '_') proxies[proto] = {}
    }
    if (!Object.keys(inbounds).length) return {}
    return { inbounds, ...(Object.keys(proxies).length ? { proxies } : {}) }
  }

  async createUser(input: ProvisionInput) {
    try {
      const groups = await this.resolveGroups()
      const body: Record<string, unknown> = {
        username: input.username,
        status: 'active',
        expire: Math.floor((Date.now() + input.days * 86400_000) / 1000),
        data_limit: input.trafficGB > 0 ? gbToBytes(input.trafficGB) : 0,
        data_limit_reset_strategy: 'no_reset',
      }
      if (input.deviceLimit > 0) body.hwid_limit = input.deviceLimit
      if (groups.supported) {
        if (!groups.ids.length) {
          return {
            ok: false,
            message: groups.refs.length
              ? `no group on the panel matches ${groups.refs.join(', ')}`
              : 'no group is configured for this panel',
          }
        }
        body.group_ids = groups.ids
      } else {
        Object.assign(body, this.legacyInboundsBody())
      }

      // PasarGuard & Marzban create through POST /api/user (username in the
      // body); some forks expose POST /api/user/{username} instead
      const attempts = [
        { path: '/api/user', body },
        { path: `/api/user/${encodeURIComponent(input.username)}`, body },
      ]
      let last = 'panel rejected the request'
      for (const attempt of attempts) {
        const { res, data } = await this.authedFetch(attempt.path, { method: 'POST', body: JSON.stringify(attempt.body) })
        if (res.ok) return { ok: true, user: this.mapUser(data) }
        const detail = String(data?.detail || data?.message || '')
        if (res.status === 409 || res.status === 400 || /already exist/i.test(detail)) {
          const existing = await this.getUser(input.username)
          if (existing.ok) return { ok: true, user: existing.user, message: 'existing user reused' }
        }
        last = detail || `HTTP ${res.status}`
        // only a wrong route is worth retrying with the other shape
        if (res.status !== 404 && res.status !== 405) break
      }
      return { ok: false, message: last }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async updateUser(username: string, input: Partial<ProvisionInput> & { disabled?: boolean }) {
    try {
      const current = await this.getUser(username)
      if (!current.ok || !current.user) return { ok: false, message: current.message || 'user not found' }
      const body: Record<string, unknown> = { username, data_limit_reset_strategy: 'no_reset' }
      if (input.days != null) body.expire = Math.floor((Date.now() + input.days * 86400_000) / 1000)
      if (input.expiresAt) body.expire = Math.floor(input.expiresAt.getTime() / 1000)
      if (input.trafficGB != null) body.data_limit = gbToBytes(input.trafficGB)
      if (input.deviceLimit != null) body.hwid_limit = input.deviceLimit
      // groups are what give the account its config — re-apply them on every
      // change so an account created before they were configured is repaired
      const groups = await this.resolveGroups()
      if (groups.supported && groups.ids.length) body.group_ids = groups.ids
      else if (!groups.supported) Object.assign(body, this.legacyInboundsBody())
      // only touch the status when it was actually asked for
      if (input.disabled != null) body.status = input.disabled ? 'disabled' : 'active'

      const { res, data } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (!res.ok) return { ok: false, message: data?.detail || `HTTP ${res.status}` }
      const updated = this.mapUser(data)
      if (input.disabled == null) return { ok: true, user: updated }

      // make sure the panel really applied the state, otherwise use the
      // dedicated toggle route (a paying customer must not stay connected
      // after "disable")
      const wrong = input.disabled ? updated.status === 'active' : updated.status === 'disabled'
      if (!wrong) return { ok: true, user: updated }
      const forced = await this.setDisabledViaRoute(username, input.disabled)
      if (forced.ok) return forced
      return { ok: false, message: `panel did not ${input.disabled ? 'disable' : 'enable'} the account` }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  /** `PUT /api/user/{username}/disabled { disabled: bool }` */
  private async setDisabledViaRoute(username: string, disabled: boolean) {
    try {
      const { res, data } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}/disabled`, {
        method: 'PUT',
        body: JSON.stringify({ disabled }),
      })
      if (!res.ok) return { ok: false as const, message: data?.detail || `HTTP ${res.status}` }
      return { ok: true as const, user: this.mapUser(data) }
    } catch (e: any) {
      return { ok: false as const, message: e?.message || 'request failed' }
    }
  }

  async deleteUser(username: string) {
    try {
      const { res } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}`, { method: 'DELETE' })
      if (res.ok || res.status === 404) return { ok: true }
      return { ok: false, message: `HTTP ${res.status}` }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async getUser(username: string) {
    try {
      const { res, data } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}`)
      if (!res.ok) return { ok: false, message: data?.detail || `HTTP ${res.status}` }
      return { ok: true, user: this.mapUser(data) }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  /**
   * Marzban-compatible panels render one subscription body: base64-encoded
   * links served from `subscription_url`. Anything else is generated by the
   * panel's own web page, so it is reported as unsupported instead of faked.
   */
  async getSubscription(username: string, format: SubFormat): Promise<SubContent> {
    try {
      const current = await this.getUser(username)
      if (!current.ok || !current.user) return { ok: false, message: current.message || 'user not found on panel' }
      const url = upstreamUrl(current.user.subUrl || '', await siteBaseUrl())
      if (!url) return { ok: false, message: 'panel returned no subscription link' }
      if (format !== 'links') {
        return { ok: false, message: `this panel does not render the ${format} format` }
      }
      const { res, text } = await httpJson(url, { headers: { Accept: '*/*' } })
      if (!res.ok || !text.trim()) return { ok: false, message: `panel answered HTTP ${res.status}` }
      const links = this.decodeLinks(text)

      return { ok: true, body: text, contentType: 'text/plain; charset=utf-8', links }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  /** A Marzban subscription body is base64 of one link per line. */
  private decodeLinks(body: string): string[] {
    const trimmed = body.trim()
    const looksBase64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmed)
    const decoded = looksBase64 ? Buffer.from(trimmed, 'base64').toString('utf8') : trimmed
    return decoded
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.includes('://'))
  }

  async listDevices(username: string) {
    // Marzban-compatible APIs do not expose HWID lists — report that clearly.
    return { ok: false, message: 'device list is not supported by this panel', devices: [] }
  }


  async deleteDevice(_username: string, _hwid: string) {
    return { ok: false, message: 'device deletion is not supported by this panel' }
  }

  async revokeSubscription(username: string) {
    try {
      const { res, data } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}/revoke_sub`, { method: 'POST' })
      if (!res.ok) return { ok: false, message: data?.detail || `HTTP ${res.status}` }
      return { ok: true, subUrl: data?.subscription_url || '' }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async resetTraffic(username: string) {
    try {
      const { res, data } = await this.authedFetch(`/api/user/${encodeURIComponent(username)}/reset`, { method: 'POST' })
      if (!res.ok) return { ok: false, message: data?.detail || `HTTP ${res.status}` }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e?.message || 'request failed' }
    }
  }

  async resetDevices(_username: string) {
    return { ok: false, message: 'device reset is not supported by this panel' }
  }
}

// ============ Factory ============
export interface PanelConfig {
  type: string
  url: string
  token: string
  password: string
  inbounds: string
  internalSquads?: string
  /** Provider-specific non-secret JSON settings. Credentials stay in token/password. */
  config?: string
}

function csv(value?: string) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export type PanelAdapterFactory = (panel: PanelConfig) => PanelAdapter

const panelAdapterFactories = new Map<string, PanelAdapterFactory>([
  ['REMNAWAVE', (panel) => new RemnaWaveAdapter(panel.url, panel.token, csv(panel.inbounds), csv(panel.internalSquads))],
  ['PASARGUARD', (panel) => new PasarGuardAdapter(panel.url, panel.token, panel.password, csv(panel.inbounds), csv(panel.internalSquads))],
])

/**
 * Registering adapters behind one factory keeps provisioning/subscription code
 * provider-agnostic. A new panel normally needs only an adapter + registry entry.
 */
export function registerPanelAdapter(type: string, factory: PanelAdapterFactory) {
  const key = type.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{2,40}$/.test(key)) throw new Error('invalid panel adapter type')
  panelAdapterFactories.set(key, factory)
}

export function panelConfigJson(panel: PanelConfig): Record<string, unknown> {
  try {
    const value = JSON.parse(panel.config || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function getPanelAdapter(panel: PanelConfig): PanelAdapter | null {
  if (!panel.url || !panel.token) return null
  const factory = panelAdapterFactories.get(String(panel.type || '').toUpperCase())
  if (!factory) return null
  try {
    return factory({
      ...panel,
      token: decryptPanelCredential(panel.token),
      password: decryptPanelCredential(panel.password),
    })
  } catch {
    // A missing/wrong production key must never result in sending ciphertext to
    // a VPN panel. Admin connection-test will report the adapter unavailable.
    return null
  }
}
