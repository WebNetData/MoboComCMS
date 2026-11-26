import type { HostingDriver } from '@/modules/hosting/server/drivers/contract'

export type CloudAction =
  | 'CREATE'
  | 'SUSPEND'
  | 'UNSUSPEND'
  | 'TERMINATE'
  | 'START'
  | 'STOP'
  | 'SHUTDOWN'
  | 'REBOOT'
  | 'REGISTER'
  | 'RENEW'
export type RegistrarContact = {
  firstName: string
  lastName: string
  organization?: string
  email: string
  phone: string
  street: string
  city: string
  postalCode: string
  state?: string
  country: string
}
/** Encrypted and persisted by Hosting before an external write. Never a browser DTO. */
export type CloudOperationInput = {
  operationId: string
  action: CloudAction
  namespace: string
  resourceName: string
  name: string
  serviceId?: number
  domainId?: number
  resourceId?: string
  plan?: string
  username?: string
  password?: string
  email?: string
  years?: number
  nameservers?: string[]
  contact?: RegistrarContact
  config: Record<string, unknown>
  stage?: string
  state?: Record<string, string | number | boolean | null>
}
export type CloudOperationResult = {
  state: 'DONE' | 'PENDING' | 'NEXT' | 'FAILED' | 'UNKNOWN'
  code: string
  reference?: string
  resourceId?: string
  data?: {
    ipv4?: string
    ipv6?: string
    username?: string
    password?: string
    panelUrl?: string
    expiresAt?: string
    nameservers?: string[]
    powerState?: 'RUNNING' | 'STOPPED'
  }
  next?: { stage: string; state?: Record<string, string | number | boolean | null> }
}
/** Each perform is a claimed write phase; inspection must be read-only.
 * NEXT asks the owner to persist a new phase before dispatch. UNKNOWN never
 * causes an automatic repeated write; caller may only inspect its frozen input.
 */
export interface CloudOperationsDriver extends HostingDriver {
  performOperation(input: CloudOperationInput): Promise<CloudOperationResult>
  inspectOperation(input: CloudOperationInput, reference: string): Promise<CloudOperationResult>
}
export function hasCloudOperations(driver: HostingDriver): driver is CloudOperationsDriver {
  const candidate = driver as Partial<CloudOperationsDriver>
  return typeof candidate.performOperation === 'function' && typeof candidate.inspectOperation === 'function'
}
