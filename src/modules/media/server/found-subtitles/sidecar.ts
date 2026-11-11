import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchRemoteBytes } from '@/modules/downloads/server/files'
import { MAX_SUBTITLE_BYTES, assToWebVtt, decodeSubtitle, subtitleFormat, toWebVtt } from '@/modules/media/domain/media'
import { MAX_FOUND_PER_ORIGIN, foundLabel, listingFileNames, sidecarGuesses, sidecarMatch, type FoundFormat } from '@/modules/media/domain/found-subtitles'
import { subtitleBytes } from '@/modules/media/server/subtitle-files'
import type { VideoSource } from './source'

export type Found = { origin: 'SIDECAR' | 'EMBEDDED'; source: string; language: string; label: string; format: FoundFormat; content: string }

/** A file's text when it really is a subtitle the player can show; '' for an error page or an empty file. */
export function subtitleText(bytes: Uint8Array, format: FoundFormat): string {
  const text = decodeSubtitle(bytes)
  const usable = format === 'ass' ? assToWebVtt(text) : toWebVtt(text, format)
  return usable ? text : ''
}

const nameOf = (url: string) => { try { return decodeURIComponent(new URL(url, 'https://local.invalid').pathname.split('/').pop() || '') } catch { return '' } }

/**
 * Subtitle files of the same name next to the video: listed from its Library folder, or from the download
 * server's directory index, or — when that server shows no index — asked for by the usual names.
 * `skip` holds addresses already added by hand as subtitle links of the same film or episode.
 */
export async function sidecarSubtitles(source: VideoSource, skip: Set<string>, notes: string[]): Promise<Found[]> {
  const videoName = nameOf(source.url)
  if (!videoName) return []
  const candidates: { url: string; name: string; read: () => Promise<Uint8Array> }[] = []
  if (source.kind === 'local') {
    const folderUrl = source.url.split(/[?#]/, 1)[0].replace(/[^/]*$/, '')
    const entries = await fs.readdir(path.dirname(source.file), { withFileTypes: true }).catch(() => [])
    for (const entry of entries.slice(0, 5000)) {
      if (!entry.isFile() || entry.name.startsWith('.') || !sidecarMatch(videoName, entry.name)) continue
      const url = folderUrl + encodeURIComponent(entry.name)
      candidates.push({ url, name: entry.name, read: () => subtitleBytes(url, '', MAX_SUBTITLE_BYTES) })
    }
  } else {
    const folder = new URL('./', source.url)
    folder.search = ''; folder.hash = ''
    let names: string[] | null = null
    try { names = listingFileNames(new TextDecoder().decode(await fetchRemoteBytes(source.sign(folder.toString()), 1024 * 1024, { timeoutMs: 15000 })), folder.toString()) } catch { names = null }
    // An index that lists other files but no subtitle is an answer too; guess only when there is no index.
    const pick = names === null ? sidecarGuesses(videoName) : names.filter(name => sidecarMatch(videoName, name))
    for (const name of pick) {
      const url = new URL(encodeURIComponent(name), folder).toString()
      candidates.push({ url, name, read: () => fetchRemoteBytes(source.sign(url), MAX_SUBTITLE_BYTES, { timeoutMs: 15000 }) })
    }
    if (names === null) notes.push('سرور دانلود فهرست پوشه را نشان نمی‌دهد؛ فقط نام‌های رایج زیرنویس امتحان شد')
  }
  const found: Found[] = []
  for (const candidate of candidates) {
    if (found.length >= MAX_FOUND_PER_ORIGIN) break
    if (skip.has(candidate.url)) continue
    const format = subtitleFormat(candidate.url)
    const match = sidecarMatch(videoName, candidate.name)
    if (!format || !match) continue
    const content = await candidate.read().then(bytes => subtitleText(bytes, format), () => '')
    if (content) found.push({ origin: 'SIDECAR', source: candidate.url, language: match.language, label: foundLabel(match), format, content })
  }
  return found
}
