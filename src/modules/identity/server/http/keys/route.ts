// Self-service API keys for the public REST API (/api/v1).
import { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { generateApiKey } from '@/modules/public-api/server/api-keys'
import { isPublicApiEnabled } from '@/modules/public-api/server/availability'


function serialize(k: any, reveal?: string) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix || (k.token ? k.token.slice(0, 11) : ''),
    active: k.active,
    requests: k.requests,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
    /** only returned once, on creation */
    token: reveal,
  }
}

export async function GET(req: NextRequest) {
  if (!await isPublicApiEnabled()) return err('not found', 404)
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const keys = await db.apiKey.findMany({ where: { userId: user.id }, orderBy: { id: 'desc' } })
  return ok({ keys: keys.map((k) => serialize(k)) })
}

export async function POST(req: NextRequest) {
  if (!await isPublicApiEnabled()) return err('not found', 404)
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)

  const body = await req.json().catch(() => null)
  const name = String(body?.name || '').trim() || 'default'

  const active = await db.apiKey.count({ where: { userId: user.id, active: true } })
  if (active >= 10) return err('you already have 10 active keys — revoke one first', 400)

  const { token, hash, prefix } = generateApiKey()
  const row = await db.apiKey.create({ data: { userId: user.id, name, token: hash, prefix } })
  // the raw token is shown exactly once — only its hash is stored
  return ok({ key: serialize(row, token) }, 201)
}

export async function DELETE(req: NextRequest) {
  if (!await isPublicApiEnabled()) return err('not found', 404)
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return err('invalid id')
  const row = await db.apiKey.findUnique({ where: { id } })
  if (!row || row.userId !== user.id) return err('not found', 404)
  await db.apiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() } })
  return ok({ revoked: true, id })
}
