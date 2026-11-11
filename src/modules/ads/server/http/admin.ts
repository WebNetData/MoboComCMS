import type { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { auditAdmin } from '@/platform/audit/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { AdsError } from '@/modules/ads/domain/ads'
import { flushAdStats, getAdsConfig, saveAdsConfig } from '@/modules/ads/server/serving'
import {
  adsOverview, campaignCsv, deleteCampaign, deleteCreative, deletePackage, deletePlacement, getCampaign, listAdvertisers, listCampaigns, listPackages, listPlacements,
  saveAdvertiser, saveCampaign, saveCreative, savePackage, savePlacement, setCampaignStatus,
} from '@/modules/ads/server/manage'

const PERMS = ['ads.manage', 'settings.manage']
const idOf = (value: unknown) => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : 0 }
const failure = (error: unknown) => {
  if (error instanceof AdsError) return err(error.message, error.status, error.meta)
  throw error
}

/** GET /api/admin/ads?view=overview|campaigns|campaign|placements|advertisers|packages|settings|csv */
export async function GET(req: NextRequest) {
  const guard = await adminGuard(req, 'ads', PERMS)
  if ('response' in guard) return guard.response
  const q = req.nextUrl.searchParams
  try {
    switch (q.get('view') || 'overview') {
      case 'campaigns': return ok(await listCampaigns({ status: q.get('status') || '', q: q.get('q') || '', advertiserId: idOf(q.get('advertiserId')), page: Number(q.get('page')) || 1 }))
      case 'campaign': return ok(await getCampaign(idOf(q.get('id'))))
      case 'placements': return ok({ placements: await listPlacements() })
      case 'advertisers': return ok({ advertisers: await listAdvertisers(q.get('q') || '') })
      case 'packages': return ok({ packages: await listPackages(), placements: (await listPlacements()).map((p) => ({ key: p.key, name: p.name, width: p.width, height: p.height })) })
      case 'settings': return ok({ settings: await getAdsConfig() })
      case 'csv': {
        const report = await campaignCsv(idOf(q.get('id')), { from: q.get('from') || '', to: q.get('to') || '' })
        return new Response(report.csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="campaign-${idOf(q.get('id'))}.csv"`, 'Cache-Control': 'no-store' } })
      }
      default: return ok({ ...(await adsOverview(Number(q.get('days')) || 30)), placementList: (await listPlacements()).map((p) => ({ key: p.key, name: p.name })) })
    }
  } catch (error) { return failure(error) }
}

/**
 * POST /api/admin/ads — { op, ... }:
 *  campaign.save | campaign.status | campaign.delete | creative.save | creative.delete
 *  placement.save | placement.delete | advertiser.save | package.save | package.delete | settings | flush
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuard(req, 'ads', PERMS)
  if ('response' in guard) return guard.response
  const body = (await req.json().catch(() => null)) || {}
  const op = String(body.op || '')
  const audit = (action: string, targetId: string | number, metadata: Record<string, unknown> = {}) => auditAdmin({ req, actor: guard.admin, action: `ads.${action}`, targetType: 'ads', targetId: String(targetId), metadata })
  try {
    switch (op) {
      case 'campaign.save': {
        const saved = await saveCampaign(body, idOf(body.id) || undefined)
        await audit('campaign.save', saved.id, { name: saved.name })
        return ok({ id: saved.id })
      }
      case 'campaign.status': {
        await setCampaignStatus(idOf(body.id), String(body.status || ''), { reason: String(body.reason || '') })
        await audit('campaign.status', idOf(body.id), { status: body.status, reason: body.reason || '' })
        return ok({ ok: true })
      }
      case 'campaign.delete': { await deleteCampaign(idOf(body.id)); await audit('campaign.delete', idOf(body.id)); return ok({ ok: true }) }
      case 'creative.save': {
        const saved = await saveCreative(idOf(body.campaignId), body, { admin: true }, idOf(body.id) || undefined)
        await audit('creative.save', saved.id, { campaignId: saved.campaignId, kind: saved.kind })
        return ok({ id: saved.id })
      }
      case 'creative.delete': { await deleteCreative(idOf(body.campaignId), idOf(body.id)); await audit('creative.delete', idOf(body.id)); return ok({ ok: true }) }
      case 'placement.save': { const saved = await savePlacement(body, idOf(body.id) || undefined); await audit('placement.save', saved.key); return ok({ id: saved.id }) }
      case 'placement.delete': { await deletePlacement(idOf(body.id)); await audit('placement.delete', idOf(body.id)); return ok({ ok: true }) }
      case 'advertiser.save': { const saved = await saveAdvertiser(body, idOf(body.id) || undefined); await audit('advertiser.save', saved.id, { name: saved.name }); return ok({ id: saved.id }) }
      case 'package.save': { const saved = await savePackage(body, idOf(body.id) || undefined); await audit('package.save', saved.id, { name: saved.name }); return ok({ id: saved.id }) }
      case 'package.delete': { await deletePackage(idOf(body.id)); await audit('package.delete', idOf(body.id)); return ok({ ok: true }) }
      case 'settings': { const settings = await saveAdsConfig(body.settings || {}); await audit('settings', 'ads', { enabled: settings.enabled, hideFor: settings.hideFor, selfServe: settings.selfServe, player: settings.player }); return ok({ settings }) }
      case 'flush': return ok({ ended: await flushAdStats() })
      default: return err('عملیات نامعتبر است', 400)
    }
  } catch (error) { return failure(error) }
}
