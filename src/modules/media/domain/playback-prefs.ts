import { TRACK_LANGUAGES } from '@/modules/media/domain/media'

// How a member likes to watch: kept with the account, so it follows them to every device and, later, app.

export type PlaybackPrefs = {
  /** Which releases come first: the Persian dub, the original audio, or no preference. */
  audio: '' | 'DUBBED' | 'ORIGINAL'
  /** The subtitle the player turns on: a language code, 'off' for none, or '' when the member never chose. */
  subtitle: string
}

export const NO_PLAYBACK_PREFS: PlaybackPrefs = { audio: '', subtitle: '' }

/** Keeps a known audio side and a known subtitle language (or 'off'); anything else is "never chose". */
export function normalizePlaybackPrefs(input: unknown): PlaybackPrefs {
  let raw = input
  if (typeof raw === 'string') { try { raw = JSON.parse(raw || '{}') } catch { raw = {} } }
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const subtitle = String(value.subtitle ?? '')
  return {
    audio: value.audio === 'DUBBED' || value.audio === 'ORIGINAL' ? value.audio : '',
    subtitle: subtitle === 'off' || subtitle in TRACK_LANGUAGES ? subtitle : '',
  }
}

/** A change to some of the preferences, laid over what is stored. A field that is not sent is kept. */
export function mergePlaybackPrefs(current: PlaybackPrefs, patch: unknown): PlaybackPrefs {
  const value = patch && typeof patch === 'object' ? patch as Record<string, unknown> : {}
  return normalizePlaybackPrefs({ audio: 'audio' in value ? value.audio : current.audio, subtitle: 'subtitle' in value ? value.subtitle : current.subtitle })
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
