# Managed lists of every section

## Outcome and owner

The owner manages the values each section had fixed in code (owner, 2026-10-25: full management of every section, extensible). This is one shared system owned by `src/modules/vocabulary`:

- one table, `Vocabulary`;
- one service, `vocabulary/server/vocabulary.ts`;
- one API, `/api/admin/vocabulary?section=`;
- one admin component, `admin/cms/VocabularyManager.tsx`;
- one form hook, `admin/cms/useSectionLists.ts`.

Each section declares its lists in its own domain:

- **games** (`games/domain/vocabulary.ts`): platforms, official stores, play modes, Persian localisations. Managed at `/admin/games/vocabulary`.
- **software** (`software/domain/vocabulary.ts`): licence types. Managed at `/admin/software/licenses`.
- **media**, shared by the download and stream links of every section (`media/domain/vocabulary.ts`): the audio of a release, and suggested qualities. Managed at `/admin/cinema/link-lists` by `settings.manage` or `cinema.manage`; every section's managers and authors may read it.

`vocabulary/domain/registry.ts` names, for each section, its module, manager permission, author permission (read only) and lists. Each section counts its own uses: `games/server/vocabulary.ts` and `software/server/vocabulary.ts`. A new list is a definition with seeds plus a seed row migration; a new section adds a registry entry and a usage counter.

## Rules

- An entry's `code` is what an item stores and never changes:
  - name lists keep the name itself (`PS5`, `Steam`);
  - code lists use upper case with underscores (`COOP`, `FA_DUB`, `OPEN_SOURCE`).
- The name shown, English name, emoji, order and the active flag are the owner's.
- The database checks:
  - section and list names have the right shape;
  - a code has no comma (items keep codes in comma lists);
  - non-name lists use upper-case codes;
  - `(section, list, code)` is unique.
- An entry belongs to one section: a change or delete through another section is not found.
- **Saving an item:**
  - A game's modes and localisations keep only known codes. A code that is inactive now stays on a game that had it, but is not added to another. Order follows the list.
  - A software title's licence must be known. An unknown or inactive one keeps the licence the title had; a new title gets the free licence, as before.
  - Game platforms and store names stay free text, so imports keep working. The forms offer the lists plus whatever an item already has.
- **Deleting:** an entry an item uses is not deleted (409). The owner deactivates it instead. Game uses include per-platform release dates and store links.
- **Public site:**
  - the game filters and the software licence chips list the active entries;
  - game pages, software cards, the software page, the dashboard share and compare show the owner's names, including for inactive entries;
  - the game mode and localisation filters accept any well-formed code and match it as a whole item. Before, they used a fixed regex and `contains`.
- **Fallback:** without the table, the old fixed values are shown.

## Links (section `media`)

- A link's audio is a code of the AUDIO list, seeded with the dub and the original audio.
  - Every writer of links (titles, episodes, games, game updates, software, software releases, revision restore) passes them through `knownLinkAudio`.
  - A known code is kept, even if inactive. An unknown code becomes no audio side.
- A member's preference (dub first or original first) moves every code starting with `DUBBED` (or `ORIGINAL`) to the front. The other sides follow in the list's order, and links with no side come last.
- The site names and orders the release groups from the list (emoji and name). A side the order does not name comes before links without one.
- A quality stays free text, because games and software use it for PC, EXE and so on. The QUALITY list is a name list that feeds the suggestions of the link form.
- Migration `20270117120000_link_vocabulary` allows name codes for the quality list and seeds both lists.

## Access

- Writes need the section's manage permission through `adminGuard`, plus a same-site origin, a strict rate limit and an audit row in the same transaction (`vocabulary.created|updated|deleted`).
- GET is read through `requireContentScope(manage, author)`. A section author reads the lists for the item form. The lists are nobody's own items, and the registry is listed in the account-security allowlist with that reason.

## Data

Additive migrations:

- `20270115120000_game_vocabulary`: the games lists, seeded with 10 platforms, 9 stores, 4 modes and 3 localisations.
- `20270116120000_section_vocabulary`: renames that table to the shared `Vocabulary`, adds `section`, generalises the checks, and seeds the five software licences.

No item table changes.

## Acceptance

- **`scripts/vocabulary.connected.cjs`** (real PostgreSQL, registered) checks:
  - the seeds of every declared list, in order;
  - the database shape checks;
  - validation, duplicates, a fixed code, and scoping by section;
  - games keep known codes, with inactive ones kept or refused as above;
  - licences: known, unknown and inactive;
  - usage counts match whole items;
  - deleting an entry in use is refused and an unused one is deleted;
  - the whole-code public filters, and licence names on software cards;
  - exactly one audit per change.
- The script also covers the links: unknown and inactive audio sides on a saved film, the audio order with and without a list, and grouping an unnamed side.
- **Deliberate breaks, each failing the script:**
  - allowing inactive codes;
  - ignoring per-platform release dates in usage;
  - `contains` matching;
  - dropping the in-use guard;
  - dropping section scoping;
  - accepting an unknown licence;
  - keeping unknown link audio;
  - the old fixed audio order;
  - grouping an unnamed side first;
  - a link writer that skips the check.
- **Browser test** (`.mobocom/claude-tools/pw-managed-lists.cjs`):
  - games: the tabs; adding a mode shows it in the game editor and the public filter;
  - software: the seeded licences, no tabs for a single list; adding a licence shows it in the software form and the public chips; cards show names;
  - both test entries are deleted afterwards.
