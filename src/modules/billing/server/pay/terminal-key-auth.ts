import { createHash, randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { clientIp, rateLimitStrict } from '@/platform/http/rate-limit'
import { PayError } from '@/modules/billing/domain/pay'

const prefix = 'mcpterm_'
const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex')

export type TerminalKeyAuthority = { id: string; terminalId: string; keyHash: string }

export function mintTerminalKey() {
  const token = prefix + randomBytes(32).toString('hex')
  return { token, keyHash: fingerprint(token), prefix: token.slice(0, prefix.length + 8) }
}

export function terminalBearer(req: NextRequest) {
  const value = req.headers.get('authorization') || ''
  const token = value.match(/^Bearer (.*)$/i)?.[1]?.trim()
  return token?.startsWith(prefix) ? token : undefined
}

const invalid = () => new PayError('کلید پایانه معتبر یا فعال نیست', 401, 'PAY_TERMINAL_KEY_INVALID')
const activeKey = {
  revokedAt: null,
  terminal: { active: true, merchant: { status: 'ACTIVE', user: { status: 'ACTIVE', erasedAt: null } } },
} satisfies Prisma.PayTerminalApiKeyWhereInput

export async function resolveTerminalKey(req: NextRequest, token: string) {
  if (!(await rateLimitStrict('pay-terminal-key:ip:' + clientIp(req.headers), 240, 60_000)).ok) {
    throw new PayError('تعداد درخواست زیاد است', 429)
  }
  if (!/^mcpterm_[0-9a-f]{64}$/.test(token)) throw invalid()
  const keyHash = fingerprint(token)
  const key = await db.payTerminalApiKey.findFirst({ where: { ...activeKey, keyHash }, select: {
    id: true, terminalId: true, terminal: { select: { merchant: { select: { user: { select: { id: true, email: true } } } } } },
  } })
  if (!key) throw invalid()
  return { user: key.terminal.merchant.user, terminalKey: { id: key.id, terminalId: key.terminalId, keyHash } satisfies TerminalKeyAuthority }
}

export async function assertTerminalKey(reader: Prisma.TransactionClient, userId: number, key: TerminalKeyAuthority) {
  const count = await reader.payTerminalApiKey.count({ where: {
    ...activeKey, id: key.id, terminalId: key.terminalId, keyHash: key.keyHash,
    terminal: { ...activeKey.terminal, merchant: { ...activeKey.terminal.merchant, userId } },
  } })
  if (count !== 1 || (await reader.setting.findUnique({ where: { key: 'publicApiEnabled' } }))?.value !== 'true') throw invalid()
}
