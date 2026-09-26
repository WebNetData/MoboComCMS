import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import type { Permission } from '@/modules/identity/rbac'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { getPanelAdapter } from '@/modules/providers/server/panels'
import { isKnownPanelType } from '@/modules/providers/domain/panel-types'
import { encryptPanelCredential, hasPanelCredential, maskPanelCredential } from '@/modules/providers/server/panel-credentials'


function normalizePanelConfig(value: unknown): string | null {
  if (value == null || value === '') return '{}'
  const raw = typeof value === 'string' ? value.trim() : JSON.stringify(value)
  if (raw.length > 16_384) return null
  try {
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}

function sanitize(p: any) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    url: p.url,
    token: maskPanelCredential(p.token),
    hasPassword: hasPanelCredential(p.password),
    inbounds: p.inbounds,
    internalSquads: p.internalSquads,
    config: p.config || '{}',
    active: p.active,
  }
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const panels = await db.panel.findMany({ orderBy: { id: 'asc' } })
  return ok(panels.map(sanitize))
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const name = String(b?.name || '').trim()
  const type = isKnownPanelType(b?.type) ? b.type : ''
  const url = String(b?.url || '').trim().replace(/\/+$/, '')
  if (!name || !url || !type || !b?.token) return err('نام، نوع معتبر، آدرس و توکن/نام‌کاربری الزامی است')
  const config = normalizePanelConfig(b?.config)
  if (config === null) return err('config پنل باید یک JSON object معتبر و حداکثر 16KB باشد')
  const panel = await db.panel.create({
    data: {
      name,
      type,
      url,
      token: encryptPanelCredential(String(b.token)),
      password: encryptPanelCredential(String(b?.password || '')),
      inbounds: String(b?.inbounds || ''),
      internalSquads: String(b?.internalSquads || ''),
      config,
      active: b?.active !== false,
    },
  })
  return ok(sanitize(panel))
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const data: Record<string, unknown> = {}
  for (const k of ['name', 'url', 'inbounds', 'internalSquads']) {
    if (typeof b?.[k] === 'string') data[k] = k === 'url' ? b[k].replace(/\/+$/, '') : b[k]
  }
  if (typeof b?.token === 'string' && b.token && !b.token.startsWith('••')) data.token = encryptPanelCredential(b.token)
  // only overwrite the PasarGuard admin password when a new value is actually provided
  // (the edit form submits an empty string when the field is left untouched)
  if (typeof b?.password === 'string' && b.password !== '') data.password = encryptPanelCredential(b.password)
  if (b?.clearPassword === true) data.password = ''
  if (isKnownPanelType(b?.type)) data.type = b.type
  if (b?.config !== undefined) {
    const config = normalizePanelConfig(b.config)
    if (config === null) return err('config پنل باید یک JSON object معتبر و حداکثر 16KB باشد')
    data.config = config
  }
  if (b?.active !== undefined) data.active = Boolean(b.active)
  const panel = await db.panel.update({ where: { id }, data })
  return ok(sanitize(panel))
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const inUse = await db.plan.findFirst({ where: { panelId: id } })
  if (inUse) return err('ابتدا پلن‌های متصل به این پنل را ویرایش کنید', 400)
  await db.panel.delete({ where: { id } })
  return ok({ deleted: true })
}

export async function PUT(req: NextRequest) {
  // connection test
  const admin = await requirePerm(req, 'panels.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  const panel = await db.panel.findUnique({ where: { id } })
  if (!panel) return err('panel not found', 404)
  const adapter = getPanelAdapter(panel)
  if (!adapter) return err('آداپتور پنل در دسترس نیست')
  const res = await adapter.testConnection()
  return ok(res)
}
