// Config usernames the customer picks before a panel account is created.
// The panel only accepts `[a-z0-9_]`, so everything is sanitised the same way
// here and availability is checked against both our DB and the live panel.
import { db } from '@/platform/database/prisma'
import { getPanelAdapter } from '@/modules/providers/server/panels'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30
const PANEL_SAFE = /^[a-z0-9_]+$/

/** Panels reject anything but lowercase letters, digits and underscores. */
export function sanitizeUsername(raw: string) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, USERNAME_MAX)
}

export function suggestUsername(seed: string) {
  const base = sanitizeUsername(seed) || 'happ'
  const short = base.length > 20 ? base.slice(0, 20) : base
  return `${short}_${Math.random().toString(36).slice(2, 6)}`
}

export interface UsernameCheck {
  username: string
  available: boolean
  reason?: string
  /** true when the name is free locally but the panel still had to be asked */
  checkedPanel: boolean
}

/**
 * A name is usable when it is well formed, unused locally and unknown to every
 * active panel the plan lives on.
 */
export async function checkUsername(raw: string, planId?: number | null): Promise<UsernameCheck> {
  const username = sanitizeUsername(raw)
  if (username.length < USERNAME_MIN) {
    return { username, available: false, reason: 'too_short', checkedPanel: false }
  }
  if (username !== String(raw || '').trim().toLowerCase()) {
    return { username, available: false, reason: 'invalid_chars', checkedPanel: false }
  }
  if (!PANEL_SAFE.test(username)) {
    return { username, available: false, reason: 'invalid_chars', checkedPanel: false }
  }

  const local = await db.subscription.findFirst({ where: { username }, select: { id: true } })
  if (local) return { username, available: false, reason: 'taken', checkedPanel: false }

  const panel = planId
    ? (await db.plan.findUnique({ where: { id: planId }, include: { panel: true } }))?.panel
    : ((await db.panel.findFirst({ where: { active: true } })) ?? null)
  if (!panel) return { username, available: true, checkedPanel: false }

  const adapter = getPanelAdapter(panel)
  if (!adapter) return { username, available: true, checkedPanel: false }

  const res = await adapter.getUser(username)
  // a panel outage must not block the purchase; provisioning falls back to a
  // suffixed name if the account already exists by then
  if (!res.ok && res.message === 'not found') return { username, available: true, checkedPanel: true }
  if (res.ok) return { username, available: false, reason: 'taken', checkedPanel: true }
  return { username, available: true, checkedPanel: true }
}

/** Never let a naming clash fail a paid order: fall back to `name_ab12`. */
export async function uniqueUsername(desired: string, planId?: number | null): Promise<string> {
  const base = sanitizeUsername(desired)
  if (base && (await checkUsername(base, planId)).available) return base
  for (let i = 0; i < 6; i++) {
    const candidate = suggestUsername(base || 'happ')
    if ((await checkUsername(candidate, planId)).available) return candidate
  }
  return `${sanitizeUsername(base || 'happ').slice(0, 20)}_${Date.now().toString(36).slice(-4)}`
}
