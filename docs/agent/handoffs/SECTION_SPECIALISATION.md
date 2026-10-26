# Specialised sections — 2026-10-26

The owner wants every section to be managed the way the cinema is. That example has three principles:

- **Pick, don't type.** People and companies are chosen from managed lists, so search and profile pages find each item.
- **Fields follow the type.** A film does not show series fields, and a series does not show film fields.
- **The owner manages the types.** Anime and documentary are added without code.

This handoff records where each section stands against those principles and continues slice by slice.

## Audit (2026-10-26, current main)

| Section | Pick from lists | Fields by type | Owner's types and lists | Gaps |
|---|---|---|---|---|
| Cinema | People (`PeoplePicker`) | By format structure (film or series) | Formats (`CinemaFormat`) | Reference; done. |
| Games | Platforms, stores, modes, localisation (lists). Developer and publisher: **this slice** | Release per platform | Lists (`GAME_LISTS`) | Engine and genres are free text. |
| Software | Licence. Platforms, app stores, developer and publisher: **this slice** | Desktop or mobile, by platform family: **this slice** | Licence, platform, app store | — |
| Music | Artist and album. Credits from the artists: **slice 2** | Release type per album: **slice 2** | Genre, release type, credit role: **slice 2** | — |
| Magazine | Categories, items linked to a post | — | — | No post format (news, review, interview, video, guide), so no format-specific fields. |
| Store | Brand, category | Physical or virtual, attribute groups by category | Attribute groups, kinds | Mature. |

## This slice: software specialised (branch `feat/software-specialised-2026-10-26`)

- **Managed lists.** Software gets two more lists:
  - **Platforms**, in a name list. Each entry has a **family**: desktop, mobile or web. `Vocabulary.family` is generic; a list opts in with `families`, and the server refuses a family the list does not declare.
  - **App stores**: Google Play, App Store, Cafe Bazaar and Myket, which the owner can extend.

  The lists page is titled «فهرست‌ها». The family is chosen in the entry form and shown on each entry.
- **Fields follow the platforms.**
  - Platforms are toggles (`ChipPicker`).
  - A desktop platform shows system requirements, install guide and archive password.
  - A mobile platform shows the package or bundle id, the oldest system version and the store pages.
  - Until a known platform is chosen, both sets show. A hidden field keeps its value.
- **Studios are picked, not typed.** `StudioPicker` covers the developer and publisher in the software form and in the games form.
  - It searches the shared studios, shows how many games and programs each has, and offers to add a new name.
  - The value stays a name, which `resolveStudioId` already links to the studio.
  - Suggestions come from `GET /api/admin/studios/suggest`, through the content-scope guard (games or software, manager or author). It only reads; changing a studio's profile still needs `/api/admin/studios`.
- **Data.**
  - Migration `20270120120000_software_specialised` is additive:
    - it adds `Vocabulary.family` with its check;
    - it widens the code check to allow the two name lists;
    - it adds `SoftwareTitle.packageId`, `minOs` and `appStores`;
    - it seeds the two new lists;
    - it adds every platform name the titles already use to the platform list.
  - On save, the stores are checked against the list. A store the title already had stays even when it is inactive.
  - The package id must look like `com.example.app`. Store addresses must be http or https.
- **Public page.** A mobile app shows «دریافت … از فروشگاه‌ها» with one button per store, by the store's Persian name, plus the oldest system and the package id. The JSON-LD lists the store pages in `sameAs`.
- **Readability fixes in the admin form (light mode):**
  - the upload button and «+ افزودن لینک» take the readable admin accent;
  - the category picker's list keeps its list semantics.

## Checks

- TypeScript passes with 0 errors.
- `npm run check` passes except the six known environment-only update-script tests.
- New unit tests cover the package id, oldest system, store pages and platform families.
- The author-permission allowlist names the suggestion handler.
- The architecture check passes.
- The PostgreSQL test `vocabulary.connected.cjs`, run after the migration on the check database, covers:
  - families on create and update, refused where the list has none;
  - the database's family check;
  - stores filtered by the list, with an inactive store kept;
  - usage counts, and refusal to delete an entry in use;
  - the public page's facts.
- One deliberate break (stores saved unfiltered) failed that test; restored, it passed.
- Browser test `.mobocom/claude-tools/pw-software-specialised.cjs` passes 23/23:
  - toggles, and switching desktop ↔ mobile;
  - studio suggestions, picking one, and adding a new one;
  - save, the stored values and the studio links;
  - the public store button and facts;
  - the lists page with families;
  - the games form's studio picker;
  - the phone form;
  - axe 0 on the form (dark and light), the public page and the lists page;
  - no page errors; fixtures removed.

## Slice 2: music specialised (branch `feat/music-specialised-2026-10-26`, stacked on slice 1)

- **Three managed lists** (`MUSIC_LISTS`, tab «فهرست‌ها» in the music admin):
  - genres (a name list, as songs already store them);
  - release types: album, EP, single, compilation, live, soundtrack;
  - credit roles: featuring, composer, lyricist, arranger, mixing, producer.
- **Genres** are chips on songs and albums. On save, only listed names are kept, plus names the item already had.
- **Release type.** `MusicAlbum.albumType` is chosen from the list; an unknown type keeps the album's own type (a new album: album). The album page names it.
- **Credits** (`MusicCredit`: song, artist, role, order). A song lists who else made it, as role + artist from the artists list. `saveMusicCredits` replaces them as a whole and keeps:
  - listed roles, or roles the song already had;
  - existing artists, a merged profile counting as the one it was merged into;
  - no repeats.

  Merging artists moves their credits without repeating one the target already has.
- **Public pages:**
  - the song page shows featured artists beside the singer and a «عوامل آهنگ» panel grouped by role, in the list's order;
  - an artist's page shows «… در آهنگ‌های دیگران» per role.
- **Migration** `20270121120000_music_specialised` is additive. It widens the code check for the music genre name list, adds `albumType`, and creates `MusicCredit` with its role check. It seeds the three lists and adopts the genre names already used.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 705/6 (the six known environment-only tests).
  - Unit tests cover `cleanCredits` and the list shapes.
  - The PostgreSQL test `vocabulary.connected.cjs` covers genres, release type, credits, deactivated roles, usage counts, merging and the public pages. Two deliberate breaks (no role check; credits left behind on merge) each failed it.
  - Browser test `pw-music-specialised` passes 18/18. It covers the form, save, the song page, the credited artist page, the album type, the lists page, phone width, and axe 0.
  - Fixed on the way: the upload field's address input now has its label (every upload field of the shared form).

## Next slices (in order)

1. **Magazine.** A post format becomes a managed list with format-specific fields: a review's score, pros and cons; a video's address; a news item's source; an interview's guest.
2. **Games.** The engine and genres become managed lists.
