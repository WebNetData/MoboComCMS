import { safeHappLink } from '@/modules/subscriptions/server/happ-protocol'

export { err, ok } from '@/platform/http/response'
export {
  effectivePermissions,
  getRawToken,
  requireAdmin,
  requirePerm,
  requireUser,
  type AuthedUser,
} from '@/modules/identity/server/access'
export { randomPassword, randomToken } from '@/shared/security/random'

/** Customer-facing Happ crypt5 URL encrypted from the VPN panel subscription URL. */
export function subscriptionUrl(subToken: string) {
  return safeHappLink(subToken)
}
