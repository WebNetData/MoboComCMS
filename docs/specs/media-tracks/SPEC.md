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
