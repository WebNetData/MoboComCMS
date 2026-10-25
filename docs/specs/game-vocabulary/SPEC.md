# Game lists: platforms, stores, play modes, localisations

## Outcome and owner

The owner manages the four lists the games section had fixed in code (owner, 2026-10-25: full management of every section). `/admin/games/vocabulary` ("پلتفرم‌ها و فهرست‌ها") shows them as tabs: platforms, official stores, play modes and Persian localisations, each entry with the number of games that use it. Owner: the games module (`src/modules/games/{domain,server}/vocabulary.ts`).

## Rules

- An entry's `code` is what a game stores and never changes:
  - a platform or store name (`PS5`, `Steam`);
  - a mode or localisation code (`COOP`, `FA_DUB`), written upper case with underscores.
- The name shown, English name, emoji, order and the active flag are the owner's.
- The database checks:
  - the list is one of the four;
  - a code has no comma (games keep them in comma lists);
  - mode and localisation codes match `^[A-Z0-9_]+$`;
  - `(list, code)` is unique.
- **Saving a game:** its modes and localisations keep only codes the lists know.
  - A code that is inactive now stays on a game that already had it, but is not added to another game.
  - Order follows the list.
  - Platforms and store names stay free text as before, so imports keep working. The editor offers only the lists plus whatever a game already has.
- **Deleting:** an entry a game uses (its platforms, per-platform release dates, store links, modes or localisation) is not deleted (409). The owner deactivates it instead. An unused entry is deleted.
- **Public site:**
  - the browse filters list the active modes and localisations;
  - a game shows the owner's names for its codes, including inactive ones;
  - the mode and localisation filters accept any well-formed code and match it as a whole item of the game's list. Before, they had a fixed regex and used `contains`, so `FA_V` would also find `FA_VX`.
- **Fallback:** without the table (before the migration, or the database unreachable), the old fixed values are shown.

## Access

- Writes need `games.manage` through `adminGuard`, a same-site origin, a strict rate limit and an audit row in the same transaction (`games.vocabulary.*`).
- GET is read through `requireContentScope('games.manage', 'games.author')`. An author reads the lists for the game form. The lists are nobody's own items, and the file is listed in the account-security allowlist with that reason.

## Data

Additive migration `20270115120000_game_vocabulary`: the `GameVocabulary` table, seeded with the previous fixed values (10 platforms, 9 stores, 4 modes, 3 localisations). Nothing on `GameTitle` changes.

## Acceptance

- **`scripts/game-vocabulary.connected.cjs`** (real PostgreSQL, registered in `run-pg-checks`) checks:
  - the seeds and their order, plus the database checks;
  - validation, duplicates, and that a code cannot change;
  - a game keeps only known codes, with inactive ones kept or refused as above;
  - usage counts match whole items, not prefixes;
  - deleting an entry in use is refused, including a platform used only in a per-platform release date, and an unused one is deleted;
  - the public filter matches whole codes and ignores malformed ones;
  - the audit is written in the same transaction.
- **Four deliberate breaks, each failing the script:**
  - allowing inactive codes;
  - ignoring per-platform release dates in usage;
  - `contains` matching;
  - dropping the in-use delete guard.
- **Browser test** (`.mobocom/claude-tools/pw-game-vocabulary.cjs`):
  - the four tabs, with the seeded platforms;
  - adding a mode; the game editor offers it and takes its platforms from the list;
  - the public mode filter lists it;
  - the unused mode is deleted.
