import { resolveCurrentUser } from '@/modules/identity/server/access'
import { RepoError } from '@/modules/repository/domain/repository'

/** A human-bound machine credential uses current standing/global facts, like existing API keys. */
export async function assertLicenseOwner(license: { userId: number | null }) {
  // An explicitly unbound grant is not linked to a person by matching its email.
  if (license.userId === null) return
  // Long-lived license keys are not sessions: a password reset does not revoke their stored entitlement.
  if (!await resolveCurrentUser(license.userId, undefined)) {
    // Legacy clients treat 403/404 as permanent revocation and switch installed packages off.
    // Temporary account denial must withhold access without pretending the license was revoked.
    throw new RepoError('دسترسی حساب مالک به این مجوز فعلاً مجاز نیست', 423, { reason: 'account-restricted' })
  }
}
