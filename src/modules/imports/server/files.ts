import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/platform/config/env'
import { ImportFileError, parseFile, type Parsed } from '@/modules/imports/domain/parse'
import { LIMITS } from '@/modules/imports/domain/types'

/**
 * Uploaded import files live outside the public folders (storage/imports),
 * under a random name; the original name is only shown in the history.
 * Parsed files are cached briefly so the wizard's steps do not re-read them.
 */

export const importsRoot = () => path.resolve(env('IMPORTS_ROOT') || path.join(process.cwd(), 'storage', 'imports'))
const KEY = /^[0-9a-f-]{36}\.(json|csv|xlsx)$/

export async function saveUpload(name: string, bytes: Uint8Array) {
  if (bytes.length > LIMITS.uploadBytes) throw new ImportFileError(`حجم فایل بیش از ${LIMITS.uploadBytes / 1024 / 1024} مگابایت است`)
  const parsed = parseFile(name, bytes) // validates before anything is kept
  const fileKey = `${randomUUID()}.${parsed.format}`
  await fs.mkdir(importsRoot(), { recursive: true })
  await fs.writeFile(path.join(importsRoot(), fileKey), bytes, { flag: 'wx', mode: 0o600 })
  const hash = createHash('sha256').update(bytes).digest('hex')
  remember(fileKey, '', parsed)
  return { fileKey, hash, parsed }
}

const cache = new Map<string, Parsed>()
function remember(fileKey: string, sheet: string, parsed: Parsed) {
  cache.set(`${fileKey}|${sheet}`, parsed)
  while (cache.size > 4) cache.delete(cache.keys().next().value as string)
}

export async function loadParsed(fileKey: string, fileName: string, sheet = ''): Promise<Parsed> {
  if (!KEY.test(fileKey)) throw new ImportFileError('فایل ورودی پیدا نشد')
  const hit = cache.get(`${fileKey}|${sheet}`)
  if (hit) return hit
  const bytes = await fs.readFile(path.join(importsRoot(), fileKey)).catch(() => null)
  if (!bytes) throw new ImportFileError('فایل ورودی روی سرور پیدا نشد؛ دوباره بارگذاری کنید')
  const parsed = parseFile(fileName || fileKey, bytes, sheet)
  remember(fileKey, sheet, parsed)
  return parsed
}

export async function deleteUpload(fileKey: string) {
  if (!KEY.test(fileKey)) return
  cache.forEach((_value, key) => { if (key.startsWith(`${fileKey}|`)) cache.delete(key) })
  await fs.rm(path.join(importsRoot(), fileKey), { force: true })
}
