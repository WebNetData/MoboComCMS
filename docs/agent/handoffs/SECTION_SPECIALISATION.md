# Specialised sections — 2026-10-26

The owner wants every section to be managed the way the cinema is. That example has three principles:

- **Pick, don't type.** People and companies are chosen from managed lists, so search and profile pages find each item.
- **Fields follow the type.** A film does not show series fields, and a series does not show film fields.
- **The owner manages the types.** Anime and documentary are added without code.

This handoff records where each section stands against those principles and continues slice by slice.

## Audit (2026-10-26, current main)

| Section | Pick from lists | Fields by type | Owner's types and lists | Gaps |
|---|---|---|---|---|
| Cinema | People (`PeoplePicker`); genres, countries, languages (**slice 5**) | By format structure (film or series) | Formats (`CinemaFormat`), genre/country/language lists | — |
| Games | Platforms, stores, modes, localisation; developer and publisher (slice 1); genres and engine (**slice 4**) | Release per platform | Lists (`GAME_LISTS`) | — |
| Software | Licence. Platforms, app stores, developer and publisher: **this slice** | Desktop or mobile, by platform family: **this slice** | Licence, platform, app store | — |
| Music | Artist and album. Credits from the artists: **slice 2** | Release type per album: **slice 2** | Genre, release type, credit role: **slice 2** | — |
| Magazine | Categories, items linked to a post | By the format's family: **slice 3** | Post formats: **slice 3** | — |
| Store | Brand, category | Physical or virtual, attribute groups by category | Attribute groups, kinds | Mature. |
| Businesses | Seller from the active sellers; field of activity (**slice 6**) | External (website) or site seller | Fields of activity (slice 6) | — |
| VIP | Plan perk lines from the perks list (**slice 8**) | — | Plans; perk lines (slice 8) | — |

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

## Slice 3: magazine post formats (branch `feat/magazine-formats-2026-10-26`, stacked on slice 2)

- **Post formats.** They are a managed list (`JOURNAL_LISTS`, a «قالب‌ها» tab in the magazine admin): article, news, review, video, interview and guide, plus the owner's own.
- **Families.** Each format has a family, like a software platform; a «product review» format is just another review-family format. The family decides the post's facts, kept as validated JSON in `Post.formatData` (`journal/domain/formats.ts`):
  - a review's score (0–10, Persian digits accepted), verdict, pros and cons;
  - a video's address;
  - a news item's source and its address;
  - an interview's guest and their role.

  The form edits the facts as flat `fmt*` fields. Only the chosen family's fields show, and a hidden fact keeps its value.
- **Saving.** `postFormatInput` normalises the save once, for both the direct save and an author's proposal:
  - the format must be in the list (or already on the post; a new post: article);
  - the facts merge into those stored.
- **Proposals.** `format` and `formatData` are proposal fields: while review is on, an author's format change waits as a proposal. The panel names the facts in words, and applying it writes them.
- **History.** Revisions snapshot the new columns like the rest of the post.
- **Article page.** A video plays above the body (YouTube or Aparat embedded, a file in a player), and an interview's guest card sits above it too. A review summary (score, verdict, pros and cons) and a news source sit below the body.
- **Migration** `20270122120000_post_formats` is additive: every existing post is an article. It adds a format code check and an index, and seeds the six formats.
- **Shared admin form** (`AdminCrud`):
  - fields can carry a hint and a placeholder;
  - a score takes one decimal;
  - the AI assistant's toggle takes the readable accent.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 706/6.
  - Unit tests cover facts, digits, merging, leniency and proposal fields.
  - The PostgreSQL test `vocabulary.connected.cjs` covers families, a known or kept format, merging, usage, delete refusal and the DB check. One deliberate break (an unchecked format) failed it.
  - The magazine's PostgreSQL tests pass: proposals, block proposals, review, filters, item links, pagination and comments. The dashboard test expected KPIs from before the review counts and was updated. Three others need a dedicated database or a running server here and were not run.
  - Browser test `pw-journal-formats` passes 19/19:
    - fields by family, save and the public review;
    - video switching, with the review facts kept;
    - the formats page;
    - an author's proposal, read in words and applied, then the news source shown;
    - phone, light;
    - axe 0.

    Existing magazine browser tests pass: admin 17/17 (tab count updated), review 13/13, proposals 13/13, polish 17/17.

## Slice 4: games genres and engine (branch `feat/games-lists-2026-10-26`, stacked on slice 3)

- **Two new name lists** on the games lists page: genres and engines.
  - They are seeded with common genres and engines.
  - The names games already use are adopted by migration `20270123120000_game_lists`, which also widens the code check.
- **Game form.** Genres are chips and the engine is a select. A name the game already had stays offered.
- **Saving.** Listed names only. A deactivated name stays on the game that had it; an unknown engine keeps the game's own; the engine can be cleared.
- **Usage.** Uses are counted, and an entry in use is not deleted.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 707/6.
  - New unit tests pass.
  - The PostgreSQL games block in `vocabulary.connected.cjs` passes.
  - Browser test `pw-games-lists` passes 9/9, including axe in dark and light and phone width. `pw-game-vocabulary` passes, updated for six lists.

## Slice 5: cinema genres, countries and languages (branch `feat/cinema-lists-2026-10-27`, stacked on slice 4)

- **Three new name lists** for films and series, on the «ژانر، کشور و زبان» tab: genres, countries and languages.
  - They are seeded with the common ones, each with its English name.
  - Migration `20270124120000_cinema_lists` adopts the names titles already use and widens the code check.
- **The title form** picks all three as chips.
- **Saving uses `knownNames`,** a name matcher shared by all sections:
  - a value matches an entry by its code or its English name, case-insensitive, and is saved as the code. So an IMDb or Cinemeta import that brings «Drama» or «United States» lands on «درام» or «آمریکا». Imports save through the same path.
  - Unknown names are dropped, and a deactivated entry stays only where it already was.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 708/6.
  - A new unit test checks that every seed has a unique English alias.
  - The PostgreSQL cinema block in `vocabulary.connected.cjs` covers English aliases in any case, list order, unknown names dropped and a deactivated entry kept.
  - The existing PostgreSQL cinema suites pass: formats, discovery, people, people-admin.
  - Browser test `pw-cinema-lists` passes 9/9, and `pw-cinema-form` passes.

## Slice 6: business fields of activity (branch `feat/business-categories-2026-10-27`)

- **A managed list** «زمینه‌های فعالیت» (`BUSINESS_LISTS`, page `/admin/businesses/categories`, linked from the businesses admin).
  - It is seeded with ten common fields, each with its English name.
  - Migration `20270125120000_business_categories` adopts what profiles and requests already use.
- **Forms.** The admin business form and the members' suggestion form both pick from the list. The public page receives the active names through the module's public address (`businessCategoryNames`).
- **Saving.** `listedCategory` (`knownNames`) runs both when a profile is saved and when a member suggests a business. Unlisted fields leave the business without one; a deactivated field stays only where it already was. The directory's exact-match category filter now sees one name per field.
- **Lists page (all sections), light mode:** the active tab and the delete action take the admin's readable accent and danger tokens.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 709/6.
  - All five business PostgreSQL tests pass: authority, experiences, trust, and both migrations.
  - The new business block in `vocabulary.connected.cjs` passes.
  - Browser test `pw-business-categories` passes 8/8, with axe on the games and software lists pages in light mode.

## Slice 7: the owner's cinema types in bulk imports (branch `feat/import-cinema-format-2026-10-27`)

- **The new option.** The film and series importers have a «نوع موارد جدید» option. Its choices are the owner's active types of the importer's own structure, loaded through the wizard's existing dynamic choices.
- **New rows only.** New rows take the chosen type; existing titles keep theirs.
- **Wrong structure.** A type of the other structure (or an inactive one) is refused when importing too. Those rows get the structure's default type, with one warning per run.
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 709/6.
  - `imports.integration.cjs` (modules scope, run in the preview container) passes 6/6 with the new scenario: choices of the right structure, the type taken, and a series type refused for films.
  - The wizard UI renders the option generically; its steps were not clicked through.

## Slice 8: VIP plan perks from a list (branch `feat/vip-perks-list-2026-10-27`)

- **A managed list** «متن مزایای پلن‌ها» (`MEMBERSHIP_LISTS`), seeded with what VIP actually unlocks. It is managed at the bottom of the existing «مزایا در هر بخش» page.
- **Plan form.** A perk line either picks an entry (column «از فهرست مزایا») or stays the plan's own free text.
- **Storage.** The stored shape is unchanged (`[{icon, fa, en}]`), plus an optional `code`. `listedPerks` keeps a known code with a snapshot of its text.
- **Reading.** `getVipPlans` resolves listed lines to the entry's current text (`resolvePerks`), so one edit changes every plan. The public shape has no `code`.
- **Validation.** Unknown codes become free lines or go. A deactivated perk stays only on plans that had it.
- **Light mode:** the public savings badge now reads (it was 2.1:1).
- **Checks:**
  - TypeScript passes with 0 errors.
  - `npm run check` is 710/6.
  - Unit tests pass.
  - The PostgreSQL perks block in `vocabulary.connected.cjs` passes.
  - Browser test `pw-vip-perks` passes 9/9. It turns the membership module on for the run, because it is off on the local preview, and restores the exact state afterwards.

## Next

Every section audited here now follows the three principles. What remains is to keep any new section to them. A post format's facts could also feed structured data (review rating), once the owner wants rich results.
