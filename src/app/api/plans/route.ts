import { getPublicPlans } from '@/modules/catalog/server/public-plans'
import { err, ok } from '@/platform/http/response'

export async function GET() {
  return ok(await getPublicPlans())
}

export async function POST(req: Request) {
  // simple admin guard-less creation is NOT allowed; admin uses /api/admin/*
  return err('Method not allowed', 405)
}
