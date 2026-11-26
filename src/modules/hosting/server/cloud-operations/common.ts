import { randomUUID, createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { encryptPanelCredential, decryptPanelCredential } from '@/modules/providers/server/panel-credentials'
import { auditSystemStrict } from '@/platform/audit/server'
import { enqueue } from '@/modules/operations/server/enqueue'
import type { DriverConnection } from '@/modules/hosting/server/drivers/contract'
import type { CloudOperationInput } from '@/modules/hosting/server/drivers/operations'
import { HostingError } from '@/modules/hosting/domain/catalog'
export type Snapshot = {
  input: CloudOperationInput
  connection: DriverConnection
  binding: string
  ownerId: number
  expected: string
  expectedDue?: string
  actorId?: number
  actor: 'SYSTEM' | 'STAFF' | 'CUSTOMER'
}
export const live = ['QUEUED', 'RUNNING', 'PENDING', 'UNKNOWN', 'BLOCKED']
export const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export const config = (v: string): Record<string, unknown> => {
  try {
    const c = JSON.parse(v)
    if (c && typeof c === 'object' && !Array.isArray(c)) return c
  } catch {}
  return {}
}
export const binding = (p: { driver: string; url: string; username: string; secret: string; config: string }) =>
  hash([p.driver, p.url, p.username, p.secret, p.config])
export const decode = (text: string) => JSON.parse(decryptPanelCredential(text)) as Snapshot
export const encode = (s: Snapshot) => encryptPanelCredential(JSON.stringify(s))
export const uid = () => randomUUID()
export async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let n = 0; ; n++)
    try {
      return await db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 })
    } catch (e) {
      if (n < 3 && ['P2034', 'P2002'].includes(String((e as { code?: string }).code))) continue
      throw e
    }
}
export async function audit(tx: Prisma.TransactionClient, id: string, code: string) {
  const row = await tx.hostingOperation.findUniqueOrThrow({ where: { id }, select: { snapshot: true } }),
    snapshot = decode(row.snapshot)
  await auditSystemStrict(
    {
      actor: { id: snapshot.actorId || snapshot.ownerId, email: '' },
      action: 'hosting.operation.' + code,
      targetType: 'hosting-operation',
      targetId: id,
    },
    tx,
  )
}
export async function schedule(tx: Prisma.TransactionClient, id: string, version: number, delay = 0) {
  await enqueue(
    'hosting.operation',
    { id },
    { dedupeKey: 'hosting-operation:' + id + ':' + version, runAt: new Date(Date.now() + delay) },
    tx,
  )
}
export function refusal(message: string): never {
  throw new HostingError(message)
}
