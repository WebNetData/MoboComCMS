// The panel-side groups new users must join: Remnawave internal squads or
// PasarGuard groups. Without one the account gets no config at all, so the
// panel form asks the panel for the list instead of making the admin type it.
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getPanelAdapter, type PanelConfig } from '@/modules/providers/server/panels'
import { isKnownPanelType } from '@/modules/providers/domain/panel-types'

/** Reads the groups of a stored panel, or of the values currently in the form. */
async function listGroups(panel: PanelConfig) {
  const adapter = getPanelAdapter(panel)
  if (!adapter) return { ok: false as const, message: 'panel url and token are required' }
  const res = await adapter.listGroups()
  if (!res.ok) return { ok: false as const, message: res.message || 'panel did not return any group' }
  return { ok: true as const, groups: res.groups }
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)

  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  const stored = id ? await db.panel.findUnique({ where: { id } }) : null

  // the form may not be saved yet: fall back to the values sent along
  const panel: PanelConfig = {
    type: isKnownPanelType(b?.type) ? b.type : (stored?.type || 'REMNAWAVE'),
    url: String(b?.url || stored?.url || '').trim().replace(/\/+$/, ''),
    token: String(b?.token || '').trim() || stored?.token || '',
    password: String(b?.password || '') || stored?.password || '',
    inbounds: String(b?.inbounds ?? stored?.inbounds ?? ''),
    internalSquads: String(b?.internalSquads ?? stored?.internalSquads ?? ''),
    config: String(b?.config ?? stored?.config ?? '{}'),
  }

  if (!panel.url || !panel.token || panel.token.startsWith('••')) {
    return err('برای خواندن گروه‌ها آدرس و توکن/نام‌کاربری پنل لازم است')
  }

  const res = await listGroups(panel)
  if (!res.ok) return err(res.message, 502)
  return ok({ ok: true, groups: res.groups })
}
