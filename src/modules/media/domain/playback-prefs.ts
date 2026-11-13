import { TRACK_LANGUAGES } from '@/modules/media/domain/media'

// How a member likes to watch: kept with the account, so it follows them to every device and, later, app.

/** How subtitles look in the site's player (not an ASS track shown with its own styles). */
export type SubtitleStyle = {
  size: 'XS' | 'S' | 'M' | 'L' | 'XL'
  color: 'WHITE' | 'YELLOW' | 'CYAN' | 'GREEN' | 'ORANGE'
  background: 'NONE' | 'DIM' | 'SOLID'
  edge: 'SHADOW' | 'OUTLINE' | 'NONE'
  /** Distance from the bottom of the picture, in percent of its height. */
  position: number
}
export const SUBTITLE_SIZES = { XS: 'خیلی کوچک', S: 'کوچک', M: 'متوسط', L: 'بزرگ', XL: 'خیلی بزرگ' } as const
export const SUBTITLE_COLORS = { WHITE: { label: 'سفید', value: '#ffffff' }, YELLOW: { label: 'زرد', value: '#ffe14d' }, CYAN: { label: 'فیروزه‌ای', value: '#7fe3ff' }, GREEN: { label: 'سبز', value: '#8cf08c' }, ORANGE: { label: 'نارنجی', value: '#ffb347' } } as const
export const SUBTITLE_BACKGROUNDS = { NONE: 'بی‌رنگ', DIM: 'تیرهٔ کم‌رنگ', SOLID: 'مشکی' } as const
export const SUBTITLE_EDGES = { SHADOW: 'سایه', OUTLINE: 'دورخط', NONE: 'بدون' } as const
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { size: 'M', color: 'WHITE', background: 'NONE', edge: 'SHADOW', position: 8 }
const pick = <T extends string>(value: unknown, allowed: Record<T, unknown>, fallback: T): T => typeof value === 'string' && value in allowed ? value as T : fallback

/** A known look for every field; what is missing or unknown comes from `fallback`. */
export function normalizeSubtitleStyle(input: unknown, fallback: SubtitleStyle = DEFAULT_SUBTITLE_STYLE): SubtitleStyle {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const position = Number(value.position)
  return {
    size: pick(value.size, SUBTITLE_SIZES, fallback.size),
    color: pick(value.color, SUBTITLE_COLORS, fallback.color),
    background: pick(value.background, SUBTITLE_BACKGROUNDS, fallback.background),
    edge: pick(value.edge, SUBTITLE_EDGES, fallback.edge),
    position: Number.isFinite(position) ? Math.min(40, Math.max(2, Math.round(position))) : fallback.position,
  }
}

export type PlaybackPrefs = {
  /** Which releases come first: the Persian dub, the original audio, or no preference. */
  audio: '' | 'DUBBED' | 'ORIGINAL'
  /** The subtitle the player turns on: a language code, 'off' for none, or '' when the member never chose. */
  subtitle: string
  /** How the member's subtitles look; null until they choose (the site's default from Admin applies). */
  subtitleStyle: SubtitleStyle | null
}

export const NO_PLAYBACK_PREFS: PlaybackPrefs = { audio: '', subtitle: '', subtitleStyle: null }

/** Keeps a known audio side and a known subtitle language (or 'off'); anything else is "never chose". */
export function normalizePlaybackPrefs(input: unknown): PlaybackPrefs {
  let raw = input
  if (typeof raw === 'string') { try { raw = JSON.parse(raw || '{}') } catch { raw = {} } }
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const subtitle = String(value.subtitle ?? '')
  return {
    audio: value.audio === 'DUBBED' || value.audio === 'ORIGINAL' ? value.audio : '',
    subtitle: subtitle === 'off' || subtitle in TRACK_LANGUAGES ? subtitle : '',
    subtitleStyle: value.subtitleStyle && typeof value.subtitleStyle === 'object' ? normalizeSubtitleStyle(value.subtitleStyle) : null,
  }
}

/** A change to some of the preferences, laid over what is stored. A field that is not sent is kept. */
export function mergePlaybackPrefs(current: PlaybackPrefs, patch: unknown): PlaybackPrefs {
  const value = patch && typeof patch === 'object' ? patch as Record<string, unknown> : {}
  return normalizePlaybackPrefs({ audio: 'audio' in value ? value.audio : current.audio, subtitle: 'subtitle' in value ? value.subtitle : current.subtitle, subtitleStyle: 'subtitleStyle' in value ? value.subtitleStyle : current.subtitleStyle })
}

/**
 * The order the release groups are shown in: the member's side first when they have one (dubs by default), then the
 * other audio of the site's list in its order, then links with no audio side. `codes`: the owner's audio list, in
 * order; a code starting with DUBBED is a dub and with ORIGINAL the original audio.
 */
export function audioOrder(prefs: PlaybackPrefs, codes: readonly string[] = ['DUBBED', 'ORIGINAL']): string[] {
  const side = prefs.audio || 'DUBBED'
  return [...codes.filter((code) => code.startsWith(side)), ...codes.filter((code) => !code.startsWith(side)), '']
}
