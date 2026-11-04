// One contract per family of outside system. A driver says what it can do; the customer's workspace shows only
// those actions. Later slices add the operations (create, suspend, power, rebuild…) to these interfaces.

export type DriverCheck = { ok: boolean; message: string }

/** Everything a driver needs to reach its system. `secret` is already decrypted and never leaves the server. */
export type DriverConnection = { driver: string; url: string; username: string; secret: string; config: Record<string, unknown> }

export const COMPUTE_CAPABILITIES = ['create', 'start', 'stop', 'shutdown', 'reboot', 'reset', 'rebuild', 'password', 'console', 'rescue', 'iso', 'snapshots', 'backups', 'resize', 'rdns', 'firewall', 'graphs', 'delete'] as const
export const WEB_PANEL_CAPABILITIES = ['create', 'suspend', 'unsuspend', 'terminate', 'package', 'password', 'usage', 'sso'] as const
export const REGISTRAR_CAPABILITIES = ['check', 'register', 'renew', 'transfer', 'nameservers', 'lock', 'authcode', 'contacts', 'sync'] as const
export type Capability = (typeof COMPUTE_CAPABILITIES)[number] | (typeof WEB_PANEL_CAPABILITIES)[number] | (typeof REGISTRAR_CAPABILITIES)[number]

export interface HostingDriver {
  readonly id: string
  /** What this driver can do today; empty while only the connection check exists. */
  readonly capabilities: readonly Capability[]
  testConnection(): Promise<DriverCheck>
}

export type HostingDriverFactory = (connection: DriverConnection) => HostingDriver
