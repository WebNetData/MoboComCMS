import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm, requireUser } from '@/modules/identity/server/access'
import { TransferError } from '@/modules/billing/domain/card-transfer'
import { receiptImage, submitReceipt } from '@/modules/billing/server/card-transfer'

/** POST multipart (fields + image) — the customer's transfer receipt for an invoice. */
export async function POST_receipt(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('برای ارسال رسید وارد شوید', 401)
  const { number } = await params
  try {
    const receipt = await submitReceipt(req, user.id, decodeURIComponent(number))
    return ok({ id: receipt.id, status: receipt.status })
  } catch (error) {
    if (error instanceof TransferError) return err(error.message, error.status)
    throw error
  }
}

/** The receipt image, for its owner or staff with invoices.manage. Never cached, sandboxed. */
export async function GET_image(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  if (!user) return err('unauthorized', 401)
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id <= 0) return err('not found', 404)
  const staff = user.role === 'ADMIN' && Boolean(await requirePerm(req, 'invoices.manage'))
  const file = await receiptImage(id, { id: user.id, staff })
  if (!file) return err('not found', 404)
  return new Response(new Uint8Array(file.bytes), { headers: {
    'content-type': file.type, 'content-length': String(file.bytes.length), 'content-disposition': 'inline',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
  } })
}
