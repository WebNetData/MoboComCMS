import type { NextRequest } from 'next/server'
import { requirePerm } from '@/modules/identity/server/access'
import { err, ok } from '@/platform/http/response'
import { readCatalogQuality } from '@/modules/catalog/server/quality'

export async function GET(req: NextRequest) {
  if (!await requirePerm(req, 'cms.products')) return err('forbidden', 403)
  const params = req.nextUrl.searchParams
  const afterRaw = params.get('after') ?? '0'
  const throughRaw = params.get('through')
  if (!/^\d+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) return err('invalid cursor', 400)
  if (throughRaw !== null && (!/^\d+$/.test(throughRaw) || !Number.isSafeInteger(Number(throughRaw)))) return err('invalid cursor', 400)
  const after = Number(afterRaw), through = throughRaw === null ? undefined : Number(throughRaw)
  if (after > 2_147_483_647 || (through !== undefined && through > 2_147_483_647)) return err('invalid cursor', 400)
  if (through !== undefined && after > through) return err('invalid cursor', 400)
  return ok(await readCatalogQuality(after, through))
}
