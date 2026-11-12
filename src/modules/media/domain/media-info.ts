import { trackLanguage } from './media'
import { subtitleLanguage } from './found-subtitles'

/**
 * What a film file holds, read from its own track list when its subtitles are looked for (found-subtitles), and kept
 * on the link with that look. Shown beside the link before anyone presses play (owner 2026-11-12), so a viewer knows
 * whether the browser will play it whole or the file is for KMPlayer / VLC.
 */
export type MediaInfo = { video: string; audio: { codec: string; language: string }[]; subtitles: string[] }

const VIDEO: Record<string, string> = { 'V_MPEGH/ISO/HEVC': 'HEVC', 'V_MPEG4/ISO/AVC': 'H.264', V_AV1: 'AV1', V_VP9: 'VP9', V_VP8: 'VP8', 'V_MPEG4/ISO/ASP': 'MPEG-4' }
const AUDIO: Record<string, string> = { A_AAC: 'AAC', A_AC3: 'AC3', A_EAC3: 'E-AC3', A_DTS: 'DTS', A_TRUEHD: 'TrueHD', A_OPUS: 'Opus', A_VORBIS: 'Vorbis', A_FLAC: 'FLAC', 'A_MPEG/L3': 'MP3', 'A_MPEG/L2': 'MP2' }
/** Sound a desktop or Android browser does not decode (Edge on Windows and Safari play AC3/E-AC3; Chrome and Firefox do not). */
const UNPLAYABLE_AUDIO = new Set(['AC3', 'E-AC3', 'DTS', 'TrueHD', 'MP2'])
/** Picture some browsers cannot decode (HEVC only with a hardware decoder). */
const UNSURE_VIDEO = new Set(['HEVC'])

const codecName = (table: Record<string, string>, codec: string) => table[codec] || (codec.startsWith('A_AAC') ? 'AAC' : codec.startsWith('A_DTS') ? 'DTS' : codec.replace(/^[AV]_/, '').split('/')[0].slice(0, 12))
/** A track's language (per, eng, fa-IR…) as one of the site's track languages, '' when unknown. */
const language = (value: string) => subtitleLanguage(String(value || ''))

/** From a Matroska track list (TrackType 1 video, 2 audio, 0x11 subtitle): the first video, every audio and text subtitle. */
export function mediaInfo(tracks: { type: number; codec: string; language: string }[], subtitleLanguages: string[]): MediaInfo {
  const video = tracks.find(track => track.type === 1)
  return {
    video: video ? codecName(VIDEO, video.codec) : '',
    audio: tracks.filter(track => track.type === 2).slice(0, 8).map(track => ({ codec: codecName(AUDIO, track.codec), language: language(track.language) })),
    subtitles: [...new Set(subtitleLanguages.map(language))].slice(0, 8),
  }
}

/** A stored value made safe to show: strings bounded, unknown shapes dropped. */
export function readMediaInfo(value: unknown): MediaInfo | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const text = (v: unknown, max: number) => String(v ?? '').replace(/[^\w.+ -]/g, '').slice(0, max)
  return {
    video: text(raw.video, 12),
    audio: Array.isArray(raw.audio) ? raw.audio.slice(0, 8).map(a => ({ codec: text((a as Record<string, unknown>)?.codec, 12), language: text((a as Record<string, unknown>)?.language, 8) })) : [],
    subtitles: Array.isArray(raw.subtitles) ? raw.subtitles.slice(0, 8).map(s => text(s, 8)).filter(Boolean) : [],
  }
}

export type MediaNote = { text: string; warn?: boolean }
/** Short notes for the link row, most useful first: sound the browser will not play, picture it may not, then what is inside. */
export function mediaNotes(info: MediaInfo, fa = true): MediaNote[] {
  const notes: MediaNote[] = []
  const unplayable = info.audio.filter(a => UNPLAYABLE_AUDIO.has(a.codec))
  if (info.audio.length && unplayable.length === info.audio.length) notes.push({ warn: true, text: fa ? `صدای ${unplayable[0].codec}: در مرورگر پخش نمی‌شود؛ با KMPlayer یا VLC` : `${unplayable[0].codec} sound: not in browsers; use KMPlayer or VLC` })
  if (UNSURE_VIDEO.has(info.video)) notes.push({ warn: true, text: fa ? 'HEVC (x265): همهٔ مرورگرها پخش نمی‌کنند' : 'HEVC (x265): not every browser plays it' })
  const voices = [...new Set(info.audio.map(a => trackLanguage(a.language, fa)).filter(Boolean))]
  if (voices.length > 1) notes.push({ text: fa ? `صدا: ${voices.join('، ')}` : `Audio: ${voices.join(', ')}` })
  const subtitles = [...new Set(info.subtitles.map(code => trackLanguage(code, fa)).filter(Boolean))]
  if (subtitles.length) notes.push({ text: fa ? `زیرنویس داخل فایل: ${subtitles.join('، ')}` : `Subtitles inside: ${subtitles.join(', ')}` })
  return notes
}
