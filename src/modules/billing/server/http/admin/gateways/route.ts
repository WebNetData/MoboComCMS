import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import type { Permission } from '@/modules/identity/rbac'
import { isGatewayUsable, maskSecret, PROVIDERS, providerMeta, testGateway, type GatewayRuntime } from '@/modules/billing/server/gateways'
import { legacyNumber, normalizeCurrency, toMinor } from '@/shared/money'

function sanitize(g: any) {
  return {
    id: g.id,
    name: g.name,
    provider: g.provider,
    providerLabel: providerMeta(g.provider).label,
    fiat: g.fiat,
    currencies: g.currencies,
    feePercent: g.feeBps ? g.feeBps / 100 : g.feePercent,
    minAmount: g.minAmountMinor ? legacyNumber(g.minAmountMinor, g.fiat) : g.minAmount,
    instructions: g.instructions,
    active: g.active,
    isDefault: g.isDefault,
    sortOrder: g.sortOrder,
    apiKeyMasked: maskSecret(g.apiKey),
    secretMasked: maskSecret(g.secretKey),
    hasApiKey: Boolean(g.apiKey),
    hasSecret: Boolean(g.secretKey),
    usable: isGatewayUsable(g),
  }
}

export async function GET(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const rows = await db.gateway.findMany({ orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }] })
  return ok({ providers: PROVIDERS, gateways: rows.map(sanitize) })
}

export async function POST(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const name = String(b?.name || '').trim()
  if (!name) return err('gateway name is required')
  const requestedProvider = String(b?.provider || 'PLISIO').toUpperCase()
  const provider = PROVIDERS.some((item) => item.key === requestedProvider) ? requestedProvider : 'PLISIO'
  const makeDefault = b?.isDefault === true

  if (makeDefault) await db.gateway.updateMany({ data: { isDefault: false } })

  const fiat = provider === 'FRENZYEX' ? 'TMN' : normalizeCurrency(b?.fiat || 'USD')
  const feeBps = Math.max(0, Math.min(10000, Math.round((Number(b?.feePercent) || 0) * 100)))
  let minAmountMinor: bigint
  try { minAmountMinor = toMinor(String(b?.minAmount ?? '0'), fiat) } catch (e) { return err(e instanceof Error ? e.message : 'invalid minimum') }
  const gw = await db.gateway.create({
    data: {
      name,
      provider,
      apiKey: String(b?.apiKey || '').trim(),
      secretKey: String(b?.secretKey || '').trim(),
      fiat,
      currencies: String(b?.currencies || '').trim(),
      feePercent: feeBps / 100,
      feeBps,
      minAmount: legacyNumber(minAmountMinor, fiat),
      minAmountMinor,
      instructions: String(b?.instructions || ''),
      active: b?.active !== false,
      isDefault: makeDefault,
      sortOrder: Number(b?.sortOrder) || 0,
    },
  })
  return ok(sanitize(gw))
}

export async function PATCH(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')

  const data: Record<string, unknown> = {}
  for (const k of ['name', 'fiat', 'currencies', 'instructions']) {
    if (typeof b?.[k] === 'string') data[k] = k === 'fiat' ? b[k].toUpperCase() : b[k]
  }
  if (PROVIDERS.some((item) => item.key === b?.provider)) {
    data.provider = b.provider
    if (b.provider === 'FRENZYEX') data.fiat = 'TMN'
  }
  if (b?.feePercent !== undefined) {
    const feeBps = Math.max(0, Math.min(10000, Math.round((Number(b.feePercent) || 0) * 100)))
    data.feeBps = feeBps
    data.feePercent = feeBps / 100
  }
  if (b?.sortOrder !== undefined) data.sortOrder = Number(b.sortOrder) || 0
  if (b?.active !== undefined) data.active = Boolean(b.active)
  // credentials: empty string = keep the stored value
  if (typeof b?.apiKey === 'string' && b.apiKey.trim() !== '') data.apiKey = b.apiKey.trim()
  if (typeof b?.secretKey === 'string' && b.secretKey.trim() !== '') data.secretKey = b.secretKey.trim()

  const current = await db.gateway.findUnique({ where: { id }, select: { fiat: true, minAmount: true } })
  if (!current) return err('not found', 404)
  const effectiveProvider = String(b?.provider || '') === 'FRENZYEX' ? 'FRENZYEX' : undefined
  const effectiveFiat = effectiveProvider === 'FRENZYEX' ? 'TMN' : normalizeCurrency(b?.fiat ?? current.fiat)
  if (b?.fiat !== undefined && effectiveFiat !== current.fiat && b?.minAmount === undefined) {
    return err('changing gateway currency requires an explicit minimum amount')
  }
  if (b?.minAmount !== undefined) {
    try {
      const minor = toMinor(String(b.minAmount), effectiveFiat)
      data.minAmountMinor = minor
      data.minAmount = legacyNumber(minor, effectiveFiat)
    } catch (e) { return err(e instanceof Error ? e.message : 'invalid minimum') }
  }

  if (b?.isDefault === true) {
    await db.gateway.updateMany({ data: { isDefault: false } })
    data.isDefault = true
  }

  const gw = await db.gateway.update({ where: { id }, data })
  return ok(sanitize(gw))
}

export async function DELETE(req: NextRequest) {
  const admin = await requirePerm(req, 'gateways.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const gw = await db.gateway.findUnique({ where: { id } })
  if (!gw) return err('not found', 404)

  const used = await db.payment.count({ where: { gatewayId: id } })
  if (used > 0) {
    await db.gateway.update({ where: { id }, data: { active: false } })
    return ok({ deactivated: true, reason: 'gateway has payments — deactivated instead of deleted' })
  }
  await db.invoice.updateMany({ where: { gatewayId: id }, data: { gatewayId: null } })
  await db.order.updateMany({ where: { gatewayId: id }, data: { gatewayId: null } })
  await db.gateway.delete({ where: { id } })
  return ok({ deleted: true })
}

export async function PUT(req: NextRequest) {
  // connection test
  const admin = await requirePerm(req, 'gateways.manage' as Permission)
  if (!admin) return err('forbidden', 403)
  const b = await req.json().catch(() => null)
  const id = Number(b?.id)
  if (!id) return err('invalid id')
  const gw = await db.gateway.findUnique({ where: { id } })
  if (!gw) return err('not found', 404)

  const runtime: GatewayRuntime = {
    id: gw.id,
    name: gw.name,
    provider: b?.provider || gw.provider,
    apiKey: typeof b?.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim() : gw.apiKey,
    secretKey: typeof b?.secretKey === 'string' && b.secretKey.trim() ? b.secretKey.trim() : gw.secretKey,
    fiat: gw.fiat,
    currencies: gw.currencies,
    feePercent: gw.feeBps ? gw.feeBps / 100 : gw.feePercent,
    feeBps: gw.feeBps || Math.round((gw.feePercent || 0) * 100),
    minAmount: gw.minAmountMinor ? legacyNumber(gw.minAmountMinor, gw.fiat) : gw.minAmount,
    minAmountMinor: gw.minAmountMinor || toMinor(gw.minAmount || 0, gw.fiat),
    instructions: typeof b?.instructions === 'string' ? b.instructions : gw.instructions,
  }
  const res = await testGateway(runtime)
  return ok(res)
}
