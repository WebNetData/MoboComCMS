import type { NextRequest } from 'next/server'
import { preparePrivateImage, PrivateImageError, privateImageDirectory, removePrivateImages, savePrivateImages, type PrivateImage } from '@/shared/files/private-images'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_FILES = 3
const MAX_REQUEST_BYTES = 16 * 1024 * 1024

export type TicketFile = PrivateImage

export class TicketUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export function ticketFileDirectory() { return privateImageDirectory('tickets') }


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
    try { files.push(await preparePrivateImage(upload)) }
    catch (error) { if (error instanceof PrivateImageError) throw new TicketUploadError(error.message, error.status); throw error }
  }
  return { body, files }
}

export async function saveTicketFiles(files: TicketFile[]) {
  await savePrivateImages('tickets', files)
}

export async function removeTicketFiles(files: TicketFile[]) {
  await removePrivateImages('tickets', files)
}

export function ticketAttachmentRows(files: TicketFile[]) {
  return files.map(({ filename, originalName, mimeType, size }) => ({ filename, originalName, mimeType, size }))
}
