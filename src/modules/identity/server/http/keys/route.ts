// Self-service API keys for the public REST API (/api/v1).
import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { err, ok } from '@/platform/http/response'
import { requireUser } from '@/modules/identity/server/access'
import { generateApiKey } from '@/modules/public-api/server/api-keys'
import { canManagePersonalApiKeys } from '@/modules/public-api/server/key-management-access'
import { mutationOrigin } from '@/platform/http/origin-policy'
import { JsonBodyError, readJsonObject } from '@/platform/http/read-json'

const keySelect = { id: true, name: true, prefix: true, active: true, requests: true, lastUsedAt: true, createdAt: true } as const

function privateResponse(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

async function keyOwner(req: NextRequest) {
  const user = await requireUser(req)
  if (!user || !await canManagePersonalApiKeys(user.id)) return null
  return user
}

function permitsWrite(req: NextRequest) {
  return mutationOrigin({
    origin: req.headers.get('origin'), secFetchSite: req.headers.get('sec-fetch-site'),
    referer: req.headers.get('referer'), hasCookies: Boolean(req.headers.get('cookie')),
    hosts: [req.nextUrl.host, URL.canParse(process.env.NEXTAUTH_URL || '') ? new URL(process.env.NEXTAUTH_URL!).host : null],
  }) === 'allow'
}

export async function GET(req: NextRequest) {
  const user = await keyOwner(req)
  if (!user) return privateResponse(err('not found', 404))
  const keys = await db.apiKey.findMany({ where: { userId: user.id }, orderBy: { id: 'desc' }, select: keySelect })
  return privateResponse(ok({ keys }))
}

export async function POST(req: NextRequest) {
  const user = await keyOwner(req)
  if (!user) return privateResponse(err('not found', 404))
  if (!permitsWrite(req)) return privateResponse(err('origin required', 403))
  let body: Record<string, unknown>
  try { body = await readJsonObject(req, 2048) }
  catch (error) {
    if (error instanceof JsonBodyError) return privateResponse(err(error.message, error.status))
    throw error
  }
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 80)) return privateResponse(err('invalid key name'))
  const name = typeof body.name === 'string' && body.name.trim() || 'default'
  const { token, hash, prefix } = generateApiKey()
  try {
    const row = await db.$transaction(async tx => {
      if (await tx.apiKey.count({ where: { userId: user.id, active: true } }) >= 10) return null
      return tx.apiKey.create({ data: { userId: user.id, name, token: hash, prefix }, select: keySelect })
    }, { isolationLevel: 'Serializable' })
    if (!row) return privateResponse(err('you already have 10 active keys — revoke one first', 400))
    return privateResponse(ok({ key: { ...row, token } }, 201))
  } catch (error) {
    if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2034') return privateResponse(err('keys changed, retry', 409))
    throw error
  }
}

export async function DELETE(req: NextRequest) {
  // A holder who loses issuance access can still revoke an existing key.
  const user = await requireUser(req)
  if (!user) return privateResponse(err('not found', 404))
  if (!permitsWrite(req)) return privateResponse(err('origin required', 403))
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) return privateResponse(err('invalid id'))
  const changed = await db.apiKey.updateMany({ where: { id, userId: user.id, active: true }, data: { active: false, revokedAt: new Date() } })
  if (!changed.count && !await db.apiKey.findFirst({ where: { id, userId: user.id }, select: { id: true } })) return privateResponse(err('not found', 404))
  return privateResponse(ok({ revoked: true, id }))
}
