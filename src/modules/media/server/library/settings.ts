import { db } from '@/platform/database/prisma'
import { LibraryError } from '@/modules/media/domain/library'
export const MEDIA_SETTINGS_KEY = 'media.library.v1'
export type MediaSettings = { enabled: boolean; organize: boolean; maxFileMB: number; timeoutSeconds: number }
export function normalizeMediaSettings(raw: Record<string, unknown>): MediaSettings {
  return { enabled: raw.enabled !== false, organize: raw.organize !== false, maxFileMB: Math.min(4096, Math.max(1, Number(raw.maxFileMB) || 512)), timeoutSeconds: Math.min(480, Math.max(10, Number(raw.timeoutSeconds) || 120)) }
}
export async function mediaSettings() {
  const row = await db.setting.findUnique({ where: { key: MEDIA_SETTINGS_KEY } })
  try { return { value: normalizeMediaSettings(JSON.parse(row?.value || '{}')), stamp: row?.value || null } }
  catch { throw new LibraryError('تنظیمات انتقال در دسترس نیست', 503) }
}
