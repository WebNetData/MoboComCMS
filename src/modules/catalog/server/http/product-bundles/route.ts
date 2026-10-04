import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { readProductBundles } from '@/modules/store/server/bundles'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await db.product.findUnique({ where: { slug }, select: { id: true } })
  if (!product) return err('not found', 404)
  const user = await requireUser(req)
  const result = await readProductBundles(product.id, user?.id ?? null)
  const response = result ? ok(result) : err('not found', 404)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
