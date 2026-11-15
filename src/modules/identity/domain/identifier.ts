import { isPhonePlaceholderEmail, normalizeMobile } from '@/modules/sms/domain/sms'

/** An administrative identifier; a phone here is not evidence of verification. */
export function userIdentifier(user: { id?: number; phone?: string | null; phoneVerifiedAt?: Date | string | null; email?: string | null }): string {
 const phone = normalizeMobile(user.phone || '')
 if (phone) return phone
 const email = user.email?.trim() || ''
 if (email && !isPhonePlaceholderEmail(email) && !/@(?:[\w-]+\.)?mobocom\.local$|@telegram\.local$/i.test(email)) return email
 return user.id == null ? 'کاربر' : `کاربر #${user.id}`
}
