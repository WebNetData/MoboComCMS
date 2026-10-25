# Cinema formats (film, series, anime, documentary…)

## Outcome and owner

The owner manages the kinds of title instead of a fixed film/series choice (owner, 2026-10-25: "in the type I want a free hand, e.g. add anime or documentary"). `/admin/cinema/formats` lists the formats with their title counts. A format has a name, plural, English name, emoji, order, an active flag and a fixed English slug (`/cinema/browse?format=anime`). Each format has a **structure**: one work (`MOVIE`: links on the title, release day) or seasons and episodes (`SERIES`). Owner: the cinema module (`src/modules/cinema/{domain,server}/formats.ts`).

## Access and contracts

- Writes (POST create, PATCH `id` in body, DELETE `?id=`) need `cinema.manage` through `adminGuard`, a same-site origin, a strict rate limit and an audit row written in the same transaction (`cinema.format.created|updated|deleted`).
- GET `/api/admin/cinema/formats` is read through `requireContentScope('cinema.manage', 'cinema.author')`. A section author fills the title form's type list with it. Formats are not anyone's own items. The file is listed in the account-security allowlist with that reason.
- The public site reads active formats on the server (browse filter, labels); there is no public formats API.

## Data and compatibility

- Additive migration `20270114120000_cinema_formats`:
  - creates the `CinemaFormat` table with a database `CHECK` on `structure IN ('MOVIE','SERIES')`;
  - seeds `movie` (🎬 فیلم سینمایی) and `series` (📺 سریال);
  - adds `CinemaTitle.formatId` with a `RESTRICT` foreign key and backfills every title from its kind.
- `CinemaTitle.kind` stays and always equals the format's structure. Every existing reader (calendars, episode alerts, notifications, compare, imports, JSON-LD, home shelves) keeps working unchanged.
- How a title's format and kind are set (`resolveTitleFormat`, in the save transaction):
  - a chosen format sets the kind;
  - a kind alone (imports, IMDb data, older clients) keeps a fitting format, otherwise it takes the first active format of that kind;
  - a save that names neither changes nothing.
- An inactive format is refused for a new choice but kept by titles that already have it.
- A format in use cannot change its structure (409) and cannot be deleted (409 in the service, `RESTRICT` in the database). The last format of a structure cannot be deleted.
- The slug cannot change after creation, so filter addresses stay stable.

## UI

- **Types page:** a list of cards showing the emoji, the name, a structure badge, the title count and the address, with edit, activate/deactivate and delete buttons. Delete is disabled while titles use the type. Add and edit share one editor card, with a two-choice structure picker that explains each choice.
- **Title form:** "نوع" lists the formats (inactive ones marked). The first choice, "automatic", uses the IMDb kind. Choosing a format shows the film or series fields by its structure. The list column shows the type as a tag.
- **Public site:**
  - the browse "نوع اثر" filter lists the active formats; the old `?kind=` still works;
  - the active-filter chip and the browse title use the format's name and plural;
  - cards, the home hero and the title page breadcrumb name the format, and the breadcrumb links to `?format=`.

## Home shelves (2026-10-25)

- A format can have its own shelf on the cinema home: the "home shelf" checkbox on the types page sets `CinemaFormat.homeShelf` (additive migration `20270118120000_cinema_format_shelves`; off for every format until the owner ticks it).
- Ticked active formats appear in the new `formatShelves` rail ("قفسهٔ انواع"). The owner places or hides the rail with the other rails in the home settings. Each shelf shows the format's newest live titles under its plural name and links to `?format=`.
- An inactive format has no shelf. Film and series keep their own rails.
- `cinema-formats.connected.cjs` checks: no shelf until ticked, a ticked shelf has its title, no shelf when inactive, no shelf when unticked. A deliberate break (ignoring the tick) fails it. The browser test `pw-format-shelf.cjs` ticks the series format, sees its shelf on the home and unticks it.

## Acceptance

- **`scripts/cinema-formats.connected.cjs`** (real PostgreSQL, registered in `run-pg-checks`) checks:
  - the seeded formats, and that every stored title matches its format's structure;
  - the database refuses an unknown structure;
  - validation and duplicate slugs;
  - a format sets the kind; a kind alone keeps a fitting format or takes that kind's default; a save without either keeps the format;
  - an unknown format is refused;
  - an inactive format is refused for new choices but kept by its titles;
  - the structure of a format in use cannot change, and the slug cannot change;
  - deleting a format in use is refused by both the service and the database, and an unused one is deleted;
  - browse by format works, and an invalid format value is ignored;
  - each audit is written inside the transaction.
- **Deliberate breaks, each failing the script:**
  - letting a sent kind override the format;
  - dropping the in-use delete guard;
  - accepting an inactive format.
- **Browser tests (`.mobocom/claude-tools/pw-cinema-formats.cjs`, `pw-cinema-form.cjs`):**
  - add anime, see it in the title form (it shows seasons and episodes) and in the public filter;
  - browse by format, follow the title page breadcrumb;
  - delete an unused type; delete is disabled for a type in use;
  - the title form test passes 19/19 with the new type list.
