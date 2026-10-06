# Feature: music by language or dialect

## Outcome
A visitor can listen to songs in Mazandarani, Lori, Turkish, Persian or any language the site adds; the owner files each song under its language and manages the list of languages from the admin.

## Existing evidence
- A shared taxonomy system exists (`TaxonomyTerm`, `TaxonomyAssignment`, `src/modules/taxonomy`): one tree of terms per content section, with admin management, in-menu flags, counts and public archive pages.
- Music already uses it once: taxonomy `music`, whose items are **albums** (`/music/category/...`). Songs had only a free-text `genre`.
- Assignments are keyed by `(termId, ownerId)` with the taxonomy as a column; an item's kind is implied by the taxonomy.

## Canonical ownership
The taxonomy module owns terms and assignments. Music owns which of its items a taxonomy files and where the archive is shown. No new table, no schema change.

## Actors & authorization
- Visitor: reads the index and archives.
- Staff with `music.manage`: manages the languages (the taxonomy's module is `music`) and files songs.

## Scenarios
### Happy path
Admin → Categories → «زبان و گویش موزیک»: add «گیلکی». Admin → Music → Songs → a song → «زبان و گویش»: tick it. The song appears at `/music/language/<slug>`, its page links to its language, and the language shows in the music menu and on the browse page.

### Failure / empty / loading / disabled-module paths
- A language without songs is an empty page, not an error. An unknown path is 404.
- A draft song, or one not yet due, is neither counted nor listed.
- A dialect is a term under its language; the language's page includes its dialects' songs.
- "Build from old fields" is not offered for this taxonomy and is refused by the server: there is no old field.
- Music module off: the pages are gone with the section.

## Data invariants
- One taxonomy files one kind of item: `music` albums, `music-language` songs. An album and a song with the same id never appear in each other's taxonomy.
- A term of one taxonomy cannot be assigned through the other.

## Admin settings / feature flags
None. Each language's "in menu" flag decides whether it shows in the music menu.

## Contracts
- `TAXONOMIES` gains `music-language` (base `/music/language`, module `music`). `/api/admin/taxonomy?tax=music-language`.
- `/api/admin/media-library?type=music-tracks` accepts and returns `terms { ids, primary }`.

## Unified identity impact
None.

## UI
Music is a protected surface: the new pages reuse its shell, term header, song list and tokens; the menu gains one entry and the browse page one row of links.

## Security/privacy
Nothing new is exposed: only published songs are listed.

## Migration & compatibility
Migration `20261205120000_music_language_terms` (data only) inserts فارسی، ترکی، لری، مازندرانی where they do not exist. Existing albums, categories and songs are untouched; songs start without a language.

## Not in this slice
- A language for an album as a whole (a song inside an album is filed song by song), and filing many songs at once.
- A language filter combined with genre on the browse page (the row links to the language's own page).

## Acceptance verification
- `scripts/music-language.connected.cjs` in `npm run test:pg`; four deliberate breaks fail it (languages counting albums, drafts listed, import with nothing to import, wrong public address).
- Browser: the admin tab and song form, the index, a language page, the song page link, the browse row, the menu entry, 404, and 390 px.
