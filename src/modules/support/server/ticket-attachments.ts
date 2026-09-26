import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import type { NextRequest } from 'next/server'
import { sniffImage as imageType } from '@/shared/files/image-type'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_FILES = 3
const MAX_REQUEST_BYTES = 16 * 1024 * 1024

export type TicketFile = { filename: string; originalName: string; mimeType: string; size: number; bytes: Buffer }

export class TicketUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export function ticketFileDirectory() { return join(process.cwd(), 'storage', 'tickets') }


export async function parseTicketSubmission(req: NextRequest): Promise<{ body: any; files: TicketFile[] }> {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) return { body: await req.json().catch(() => null), files: [] }
  if (Number(req.headers.get('content-length')) > MAX_REQUEST_BYTES) throw new TicketUploadError('Attachments exceed the 15 MB request limit / حجم پیوست‌ها بیش از حد مجاز است', 413)
  const reader = req.body?.getReader()
  if (!reader) throw new TicketUploadError('No upload body / فایل دریافت نشد')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    size += part.value.byteLength
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new TicketUploadError('Attachments exceed the 15 MB request limit / حجم پیوست‌ها بیش از حد مجاز است', 413) }
    chunks.push(part.value)
  }
  let form: FormData
  try { form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData() }
  catch { throw new TicketUploadError('Invalid upload form / فرم پیوست معتبر نیست') }
  const payload = form.get('payload')
  if (typeof payload !== 'string') throw new TicketUploadError('Missing ticket details / اطلاعات تیکت ارسال نشد')
  let body: any
  try { body = JSON.parse(payload) } catch { throw new TicketUploadError('Invalid ticket details / اطلاعات تیکت معتبر نیست') }
  const uploads = form.getAll('files').filter(value => typeof value !== 'string' && value.size > 0)
  if (uploads.length > MAX_FILES) throw new TicketUploadError('Up to three images are allowed / حداکثر سه تصویر مجاز است')
  const files: TicketFile[] = []
  for (const upload of uploads) {
    if (typeof upload === 'string') continue
    if (upload.size > MAX_FILE_BYTES) throw new TicketUploadError('Each image must be at most 5 MB / هر تصویر حداکثر ۵ مگابایت است', 413)
    const bytes = Buffer.from(await upload.arrayBuffer())
    const type = imageType(bytes)
    if (!type) throw new TicketUploadError('Only PNG, JPEG and WebP images are allowed / فقط تصویر PNG، JPEG یا WebP مجاز است')
    const originalName = basename(upload.name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 120) || `image.${type.extension}`
    files.push({ filename: `${randomUUID()}.${type.extension}`, originalName, mimeType: type.mimeType, size: bytes.length, bytes })
  }
  return { body, files }
}

export async function saveTicketFiles(files: TicketFile[]) {
  if (!files.length) return
  await mkdir(ticketFileDirectory(), { recursive: true })
  const written: TicketFile[] = []
  try {
    for (const file of files) {
      await writeFile(join(ticketFileDirectory(), file.filename), file.bytes, { flag: 'wx', mode: 0o600 })
      written.push(file)
    }
  } catch (error) {
    await removeTicketFiles(written)
    throw error
  }
}

export async function removeTicketFiles(files: TicketFile[]) {
  await Promise.allSettled(files.map(file => unlink(join(ticketFileDirectory(), file.filename))))
}

export function ticketAttachmentRows(files: TicketFile[]) {
  return files.map(({ filename, originalName, mimeType, size }) => ({ filename, originalName, mimeType, size }))
}
