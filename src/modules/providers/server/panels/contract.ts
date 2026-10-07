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
