import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import { err, ok } from '@/platform/http/response'
import { isModuleEnabled } from '@/extensions/server/modules'

export async function GET() {
  // Nothing is on sale while the VPN module is off; callers (the invoice form, the mini app) get an empty list.
  return ok(await isModuleEnabled('vpn') ? await getPublicPlans() : [])
}

export async function POST(req: Request) {
  // simple admin guard-less creation is NOT allowed; admin uses /api/admin/*
  return err('Method not allowed', 405)
}
