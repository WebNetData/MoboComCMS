# Separate subtitle and audio files

Owner: `media` (links) for the cinema section. One additive column, `MediaLink.language`; `kind` gains `SUBTITLE` and `AUDIO`.

## Rules
- A track goes with a film or an episode instead of being it. It has a language from `TRACK_LANGUAGES` (Persian first), no dub/original side and no "has subtitles" mark; a release has no language. An unknown kind is saved as a download, an unknown language as none.
- Shown under the releases in two groups, subtitles then audio, each in the order of the language list, unfiled last; the language stands where a release shows its quality.
- Fetched through the protected link route like every file: page tokens, VIP locks, own prices and "report a problem" apply. It does not count towards the daily download limit and is not logged as a download of the film.
- Never offered to the in-site player and never what "continue watching" opens, whatever its file extension.
- The link editor offers the two kinds for films and episodes; games and software keep download and stream.

## Acceptance
`scripts/media-tracks.connected.cjs` in `npm run test:pg`: saved through the admin save path, read through the public read path and the continue-watching list. Nine deliberate breaks fail it. Unit: `scripts/builder.test.cjs`.

## Not included
Loading a subtitle into the site's own player, a member's playback preferences (preferred audio, quality, subtitle language), subtitles for music videos.

## Added: subtitles in the site's own player (2026-10-07)
- Offered: the subtitle files of the same film or episode, not taken down, WebVTT or SubRip by their extension, that this viewer may open (own price, VIP). Persian first. Not for embedded players or game trailers.
- Served at `/api/media/subtitle/<id>?t=<page token>` as `text/vtt`: module on, owner published, not taken down, price or VIP, page token when download protection asks for one. Refusals answer 401/402/403/404; nothing is fetched for a refused request.
- The server reads the file (public addresses only, at most 2 MB), reads it as UTF-8 or else Windows-1256, and writes WebVTT: SubRip's decimal comma and cue numbers go, of markup only italics, bold and underline stay, a WebVTT header block is not passed on. No timed cue: 502, so an error page is never shown as a subtitle.
- The player turns on the track in the viewer's language (Persian unless they chose another or turned subtitles off) and remembers the choice on the device.
- Acceptance: `scripts/player-subtitles.connected.cjs`; sixteen deliberate breaks fail it.
- Still not included: ASS styling, separate audio in the player, preferences kept with the account.
