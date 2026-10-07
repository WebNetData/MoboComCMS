import { upstreamUrl } from '@/modules/subscriptions/domain/subscription-content'
import { siteBaseUrl } from '@/modules/site/server/site-url'
import { type PanelAdapter, type PanelGroup, type PanelUser, type ProvisionInput, type SubContent, type SubFormat } from '@/modules/providers/server/panels/contract'
import { gbToBytes, httpJson, joinUrl } from '@/modules/providers/server/panels/http'

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
