import { createHash } from 'node:crypto'
import { enqueue } from '@/modules/operations/server/enqueue'
import { readScan } from '@/modules/media/domain/found-subtitles'

/** Film and episode files whose subtitles are looked for; the address decides, so a changed address is looked at again. */
export const FOUND_OWNERS = ['title', 'episode'] as const
export const FOUND_KINDS = ['DOWNLOAD', 'STREAM'] as const
export const scanKey = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 16)
export const scanDedupe = (linkId: number, key: string) => `media-subtitles:${linkId}:${key}`

/** Queues one look at a video file when its current address has not been looked at; light enough for a page view. */
export async function requestSubtitleScan(link: { id: number; url: string; subtitleScan: string }) {
  const key = scanKey(link.url)
  if (readScan(link.subtitleScan)?.key === key) return null
  return enqueue('media.subtitle-scan', { linkId: link.id, key }, { dedupeKey: scanDedupe(link.id, key) })
}
