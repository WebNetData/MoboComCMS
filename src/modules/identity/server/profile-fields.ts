import { db } from '@/platform/database/prisma'
import { readJsonSetting, createSectionSettingsHistory, type SectionSettingsContext } from '@/modules/settings/server'
import { ensureUserProfile, setUsername } from '@/modules/identity/server/profile'
import { isPhonePlaceholderEmail } from '@/modules/sms/domain/sms'
import { listAddresses, saveAddress } from '@/modules/shipping/server/shipping'
import { ShippingError, normalizeMobile } from '@/modules/shipping/domain/shipping'
import { ProfileError } from '@/modules/identity/domain/profile'
import { cleanCustomValue, missingRequired, normalizeFieldsConfig, splitName, type FieldsConfig, type MemberState } from '@/modules/identity/domain/profile-fields'

// Admin-designed registration fields and the "complete your details" step
// every new member (SMS sign-ups especially) goes through once.

const KEY = 'profile.fields.v1'

export class CompletionError extends Error {
  constructor(message: string, readonly errors: Record<string, string>) { super(message) }
}

export async function getFieldsConfig(): Promise<FieldsConfig> {
  return normalizeFieldsConfig(await readJsonSetting(KEY))
}

const fieldsHistory = () => createSectionSettingsHistory(KEY, 'settings-profile-fields', normalizeFieldsConfig, config => ({ fields: config.fields.map((field) => `${field.key}${field.required ? '*' : ''}${field.enabled ? '' : ' (off)'}`), enforce: config.enforce }), { action: 'profile_fields.update', targetId: KEY })
export const profileFieldsSettingsState = () => fieldsHistory().current()
export const restoreProfileFieldsSettings = (...args: Parameters<ReturnType<typeof fieldsHistory>['restore']>) => fieldsHistory().restore(...args)

export async function saveFieldsConfig(input: unknown, context?: SectionSettingsContext) {
  return fieldsHistory().save(input, context)
}

const realEmail = (email: string) => !!email && !isPhonePlaceholderEmail(email) && !/@(bot\.mobocom\.local|telegram\.local)$/.test(email)

function parseData(raw: string): Record<string, unknown> {
  try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}

async function loadMember(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, role: true, profileData: true, profileCompletedAt: true } })
  if (!user) throw new ProfileError('حساب پیدا نشد', 404)
  const data = parseData(user.profileData)
  const [firstFromName, lastFromName] = splitName(user.name || '')
  const firstName = typeof data.firstName === 'string' ? data.firstName : firstFromName
  const lastName = typeof data.lastName === 'string' ? data.lastName : lastFromName
  const addresses = await listAddresses(userId)
  const state: MemberState = { firstName, lastName, hasAddress: addresses.length > 0, realEmail: realEmail(user.email), data }
  return { user, data, state, addresses }
}

/** What the completion page needs: enabled fields, current values and what is still missing. */
export async function completionStatus(userId: number) {
  const [config, member, profile] = await Promise.all([getFieldsConfig(), loadMember(userId), ensureUserProfile(userId)])
  const missing = missingRequired(config, member.state)
  const defaultAddress = member.addresses.find((address) => address.isDefault) || member.addresses[0] || null
  return {
    // Staff accounts are never blocked by the customer onboarding step.
    needsCompletion: config.enforce && member.user.role !== 'ADMIN' && missing.length > 0,
    missing: missing.map((field) => field.key),
    intro: config.intro,
    fields: config.fields.filter((field) => field.enabled),
    values: {
      firstName: member.state.firstName, lastName: member.state.lastName, username: profile.username,
      email: member.state.realEmail ? member.user.email : '', emailLocked: member.state.realEmail,
      phone: normalizeMobile(member.user.phone || ''),
      address: defaultAddress ? { id: defaultAddress.id, province: defaultAddress.province, city: defaultAddress.city, address: defaultAddress.address, plaque: defaultAddress.plaque, unit: defaultAddress.unit, postalCode: defaultAddress.postalCode, mobile: defaultAddress.mobile, lat: defaultAddress.lat, lng: defaultAddress.lng } : null,
      custom: Object.fromEntries(config.fields.filter((field) => !field.builtin).map((field) => [field.key, member.data[field.key] ?? (field.type === 'checkbox' ? false : '')])),
    },
  }
}

const nameText = (value: unknown) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** Validates and saves the completion form; throws CompletionError with per-field messages. */
export async function submitCompletion(userId: number, input: Record<string, unknown>) {
  const [config, member] = await Promise.all([getFieldsConfig(), loadMember(userId)])
  const errors: Record<string, string> = {}
  const data: Record<string, unknown> = { ...member.data }
  const enabled = config.fields.filter((field) => field.enabled)
  let firstName = member.state.firstName, lastName = member.state.lastName
  let newEmail: string | null = null
  let newUsername: string | null = null
  let addressInput: Record<string, unknown> | null = null

  for (const field of enabled) {
    const value = input[field.key]
    switch (field.builtin) {
      case 'firstName':
      case 'lastName': {
        const cleaned = nameText(value)
        if (cleaned && cleaned.length < 2) errors[field.key] = `«${field.label}» خیلی کوتاه است`
        else if (!cleaned && field.required) errors[field.key] = `«${field.label}» را وارد کنید`
        if (field.builtin === 'firstName') firstName = cleaned || firstName
        else lastName = cleaned || lastName
        data[field.builtin] = field.builtin === 'firstName' ? firstName : lastName
        break
      }
      case 'username': {
        const wanted = String(value ?? '').trim().replace(/^@/, '').toLowerCase()
        if (wanted) newUsername = wanted
        break
      }
      case 'email': {
        if (member.state.realEmail) break
        const email = String(value ?? '').trim().toLowerCase()
        if (!email) { if (field.required) errors.email = 'ایمیل را وارد کنید'; break }
        if (!/^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 190) { errors.email = 'ایمیل معتبر نیست'; break }
        const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
        if (taken && taken.id !== userId) { errors.email = 'این ایمیل برای حساب دیگری ثبت شده است'; break }
        newEmail = email
        break
      }
      case 'address': {
        const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null
        const provided = raw && Object.entries(raw).some(([key, item]) => !['lat', 'lng', 'mobile'].includes(key) && String(item ?? '').trim())
        if (!provided) { if (field.required && !member.state.hasAddress) errors.address = 'آدرس و کد پستی را وارد کنید'; break }
        addressInput = raw
        break
      }
      default: {
        const [cleaned, error] = cleanCustomValue(field, value)
        if (error) errors[field.key] = error
        else if (field.required && (cleaned === '' || (field.type === 'checkbox' && cleaned !== true))) errors[field.key] = field.type === 'checkbox' ? `«${field.label}» را تأیید کنید` : `«${field.label}» را وارد کنید`
        data[field.key] = cleaned
      }
    }
  }

  // The address needs a recipient and a mobile: the member's own name and verified phone by default.
  if (addressInput && !errors.firstName && !errors.lastName) {
    const recipient = `${firstName} ${lastName}`.trim()
    const mobile = normalizeMobile((addressInput as Record<string, unknown>).mobile) || normalizeMobile(member.user.phone || '')
    const existing = member.addresses.find((address) => address.isDefault) || member.addresses[0]
    try {
      await saveAddress(userId, { ...(addressInput as Record<string, unknown>), recipient, mobile, title: existing?.title || 'خانه', isDefault: true }, existing?.id)
    } catch (error) {
      if (error instanceof ShippingError) errors.address = error.message
      else throw error
    }
  }
  if (newUsername) {
    try { await setUsername(userId, newUsername) } catch (error) { if (error instanceof ProfileError) errors.username = error.message; else throw error }
  }
  if (Object.keys(errors).length) throw new CompletionError('چند مورد نیاز به اصلاح دارد', errors)

  const fullName = `${firstName} ${lastName}`.trim()
  const hasAddress = member.state.hasAddress || !!addressInput
  const stillMissing = missingRequired(config, { firstName, lastName, hasAddress, realEmail: member.state.realEmail || !!newEmail, data })
  await db.user.update({
    where: { id: userId },
    data: {
      ...(fullName ? { name: fullName.slice(0, 80) } : {}),
      ...(newEmail ? { email: newEmail } : {}),
      profileData: JSON.stringify(data).slice(0, 20_000),
      profileCompletedAt: stillMissing.length ? null : new Date(),
    },
  })
  return completionStatus(userId)
}

/** Custom field values for the admin user view. */
export async function memberProfileData(userId: number) {
  const [config, member] = await Promise.all([getFieldsConfig(), loadMember(userId)])
  return {
    completedAt: member.user.profileCompletedAt,
    missing: missingRequired(config, member.state).map((field) => field.label),
    rows: config.fields.filter((field) => !field.builtin && member.data[field.key] !== undefined && member.data[field.key] !== '').map((field) => ({ label: field.label, value: field.type === 'checkbox' ? (member.data[field.key] ? 'بله' : 'خیر') : String(member.data[field.key]) })),
  }
}

/** The member's national ID from an admin-defined "کد ملی" field, for official invoices ('' when none). */
export async function memberNationalId(userId: number) {
  const [config, member] = await Promise.all([getFieldsConfig(), loadMember(userId)])
  const field = config.fields.find((item) => item.type === 'nationalId' && member.data[item.key])
  return field ? String(member.data[field.key]) : ''
}
