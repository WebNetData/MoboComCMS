// Puts the pointers to docs/agent/PLATFORM_DECISIONS.md back into the agent documents.
//
// Reinstalling the MoboCom dev stack overwrites docs/agent/MASTER_PROMPT.md, SESSION_BOOTSTRAP.md, the
// mobocom-* skills, AGENTS.md and CLAUDE.md with the pack's copies. MOBOCOM_MAP.md, CAPABILITY_LEDGER.md and
// PLATFORM_DECISIONS.md are left alone by the installer. Run this afterwards, from the project root:
//
//   node scripts/reapply-platform-decisions.cjs
//
// It is safe to run at any time: a document that already carries its addition is skipped. When a decision
// changes, change docs/agent/PLATFORM_DECISIONS.md first, then the matching lines here.
const fs = require('fs')
const read = (file) => fs.readFileSync(file, 'utf8')
const nlOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n')
let changed = 0

/** Inserts `addition` (which ends with `anchor`) in place of `anchor`; skipped when its first line is already there. */
function insertBefore(file, anchor, addition) {
  if (!fs.existsSync(file)) return console.log('absent  ', file)
  const text = read(file), nl = nlOf(text)
  if (text.includes(addition.split('\n')[0])) return console.log('in place', file)
  const from = anchor.split('\n').join(nl)
  if (text.split(from).length !== 2) throw new Error(`${file}: the place for the addition was not found: ${anchor.slice(0, 60)}`)
  fs.writeFileSync(file, text.replace(from, addition.split('\n').join(nl)))
  changed += 1; console.log('added   ', file)
}
function append(file, marker, addition) {
  if (!fs.existsSync(file)) return console.log('absent  ', file)
  const text = read(file), nl = nlOf(text)
  if (text.includes(marker)) return console.log('in place', file)
  fs.writeFileSync(file, text.replace(/\s*$/, '') + nl + nl + addition.split('\n').join(nl) + nl)
  changed += 1; console.log('added   ', file)
}
if (!fs.existsSync('docs/agent/PLATFORM_DECISIONS.md')) throw new Error('docs/agent/PLATFORM_DECISIONS.md is missing: restore it from git before pointing documents at it')

// ---------------------------------------------------------------- session bootstrap
insertBefore('docs/agent/SESSION_BOOTSTRAP.md', 'Core constraints:', [
  'Read `docs/agent/PLATFORM_DECISIONS.md` first when the task touches access, staff, the forum or the workflow: it holds what the owner decided after this prompt was written, and where each decision lives in the code.',
  '',
  'Core constraints:',
].join('\n'))
append('docs/agent/SESSION_BOOTSTRAP.md', 'Decisions in force', [
  'Decisions in force (details and guards in `docs/agent/PLATFORM_DECISIONS.md`):',
  '- Focus: Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN, resellers and the marketplace are set aside and switchable off.',
  '- One permission per section; `cms.posts` is the magazine only. Never add a shared content permission.',
  '- Staff standing changes only through the staff guard; an account is never left as staff without a role (that is full access).',
  '- Section managers come from `/admin/section-managers`; forum ranks (admin, deputy, forum moderator) from the forum admin\'s team tab.',
  '- Forum: section → forum → subforum, sections take no topics, moderation is scoped with `inCategory`, the social side is composed from identity, community and reviews, never re-implemented.',
  '- The forum is not a protected visual surface. Homepage, Magazine, Music, Games, Movies and TV Series still are.',
  '- History: before launch a rule that changes a stored number is applied to everything already stored; after launch no update ignores or resets the past (recount from the stored events, or a data-safe backfill).',
  '- Every pull request targets `main`; the owner merges and deploys. A slice is done when a connected PostgreSQL check and, for anything visible, a browser check have actually run.',
  '- Security floor: a limit that guards a secret is `rateLimitStrict`; a write to `/api` must show where it was made (a session cookie alone never writes; a tool sends `Origin`); scripts run by nonce, so an inline `<script>` takes `nonce` from `x-nonce` and inline event handlers do not run.',
  '- Money rows (orders, invoices, payments, wallet, fulfilment, returns): the database holds their states and amounts. Change a state with a claim (`updateMany` on the state it was decided on, then the count), never an unconditional `update`; a new state or wallet row type needs a migration that widens the constraint.',
  '- Content is written in the block editor (plugin `block-editor`, on by default) for pages and magazine articles. What is stored is the MoboCom document (`src/modules/editor/domain`), never an editing engine\'s output; `@wordpress/*` is imported only under `src/components/editor/gutenberg`; a new block is a registry definition, not editor code. With the plugin off the forms are the old editor again and every body is kept.',
  '- The site is written in one language; translation is Google Translate\'s. No English title, excerpt or body fields on the pages and articles forms (the columns are kept).',
  '- A section can be put in maintenance by itself (`/admin/maintenance`): visitors get the owner\'s notice, only full access and that section\'s managers see it. A new section with public pages joins `MAINTENANCE_SECTIONS`.',
  '- Every migration is listed in `prisma/release-manifest.json`; every pull request passes `.github/workflows/checks.yml` and the browser suite. A test must pass with no `.env`, on an empty database and as a user who is not root.',
  '- A module past a few hundred lines is a folder of parts behind the same address; other modules import the address, never a part.',
].join('\n'))

// ---------------------------------------------------------------- master prompt
insertBefore('docs/agent/MASTER_PROMPT.md', '## 28. Final principle', [
  '## 27B. Decisions adopted in this repository',
  '',
  'The sections above are the platform\'s principles. What the owner has since decided, and the rules that came out of building it, are recorded in **`docs/agent/PLATFORM_DECISIONS.md`** and bind work in this repository exactly as this prompt does. Where the two seem to differ, the decisions file is the newer and more specific statement; raise the difference instead of choosing silently.',
  '',
  'In short, as of 2026-10-07:',
  '',
  '1. **Focus surfaces** are Store, Magazine, Games, Movies and TV Series, Music and Forum. VPN, resellers and the marketplace are optional modules, set aside, and must stay switchable off without data loss (§6).',
  '2. **Authorization is one permission per section** (§5 Platform Core, §21). No permission opens two sections; `cms.posts` is the magazine only. A new section declares its own permission in its manifest and uses only that.',
  '3. **Staff standing is guarded centrally.** Giving roles needs `roles.manage`; full access is given and changed only by full access; standing and role change together; nobody changes their own. Any route that changes a user\'s role, status or password calls the guard.',
  '4. **Delegation is by section and by forum.** The owner names a manager for each site section from one page; the forum has three ranks (forum admin, deputy, forum moderator), each a name for access that already exists. Neither adds an authorization system (§2 rule: no parallel shared systems).',
  '5. **Management is reachable from the public page** for those who hold the section\'s permission. The link decides what to show; the server decides what is allowed.',
  '6. **The forum is an Invision-class board with the social layer built in**: sections, forums and subforums; a section takes no topics; moderation is scoped to a forum and what is under it; leaderboard, activity stream, member directory, groups, clubs. It composes Identity (follow, block, privacy), the feed and reviews from their owner modules (§19).',
  '7. **Protected visual areas (§3) are unchanged.** The forum is not one of them and is built on the site\'s tokens.',
  '8. **Evidence and delivery** (§26, §27): a slice is done when a connected PostgreSQL check that asks the page\'s own functions as several viewers has run, its rules have been proven by deliberate breaks, and anything visible has been opened in a browser. Every pull request targets `main`; the owner merges and deploys. Data migrations preserve existing access and are safe to repeat.',
  '9. **A security floor every change keeps** (§24): limits that guard a secret are counted atomically (`rateLimitStrict`); a write to `/api` must show where it was made, a session cookie alone never writes; scripts run by nonce and inline handlers do not run; the server panel follows links before it decides and checks an archive before unpacking it.',
  '10. **The database holds the states and amounts of money rows** (§5, §22): declared states, non-negative money, and triggers that refuse to unsettle what is settled. Code changes such a state with a claim.',
  '11. **Content is a MoboCom document** (§7): the block editor (a plugin, on by default) is the editor of pages and magazine articles; the stored format belongs to MoboCom, an editing engine is replaceable, and a block is a registry definition. An unknown block is kept, never dropped.',
  '12. **One language.** The site is written in one language and translated by Google Translate; forms carry no English fields.',
  '13. **A section can be in maintenance by itself**: visitors get the owner\'s notice, only full access and that section\'s managers see it.',
  '14. **Delivery is gated** (§26, §27): every migration belongs to one release (`prisma/release-manifest.json`); every pull request passes the checks workflow (static checks and unit suites, a first deploy on an empty PostgreSQL with the connected checks, the production build) and the browser suite; a test passes without a `.env`, on an empty database and as a user who is not root.',
  '',
  '## 28. Final principle',
].join('\n'))

// ---------------------------------------------------------------- skills (Claude and Codex copies)
const SKILLS = {
  'mobocom-audit': [
    '## This repository',
    '- Start from `docs/agent/PLATFORM_DECISIONS.md` (what was decided and where it lives), then `MOBOCOM_MAP.md` and `CAPABILITY_LEDGER.md`.',
    '- Access questions: read `src/modules/identity/rbac.ts`, `server/access.ts`, `server/staff-guard.ts`, `domain/sections.ts` before concluding anything. `scripts/account-security.test.cjs` lists every file allowed to name `cms.posts`; a guard that accepts a permission of another section is a finding (`WEAK_SECURITY`).',
    '- Forum questions: who moderates is `viewer.moderator` (everywhere) or `viewer.moderates` (assigned forums) through `inCategory`; a check of `viewer.moderator` on a topic or post that skips it is a finding.',
    '- After an audit, update the ledger row and the map line; if a decision changed, change its entry in PLATFORM_DECISIONS instead of appending.',
    '- Since 2026-10-07 also findings: a secret-guarding limit on `rateLimitHit` instead of `rateLimitStrict`; an unconditional `update` of a money row\'s state; `@wordpress/` imported outside `src/components/editor/gutenberg`; an inline `<script>` without the nonce or an inline event handler; a file operation of the server panel that skips `guard`; a test that passes only with a `.env`, a busy database or root.',
  ],
  'mobocom-spec': [
    '## This repository',
    '- Specs live in `docs/specs/<feature>/SPEC.md`, from `docs/specs/_TEMPLATE.md`. A feature built in slices keeps one spec with a section per slice (see `docs/specs/forum-invision/SPEC.md`).',
    '- "Actors & authorization" names the exact permission from `src/modules/identity/rbac.ts`; one section, one permission. For the forum, say which of the three ranks may do it and whether it is scoped to a forum.',
    '- "Acceptance verification" names the connected PostgreSQL script and the deliberate breaks that must fail it.',
    '- When the owner makes a decision the spec depends on, record it in `docs/agent/PLATFORM_DECISIONS.md` as well.',
    '- Page or article content in a spec means the block editor and the MoboCom document (`docs/editor/ARCHITECTURE.md`): name the block types involved, their fields and, for a dynamic block, the question it stores. A feature that changes a money state names the claim it makes and the database rule it relies on.',
  ],
  'mobocom-develop': [
    '## This repository',
    'Read `docs/agent/PLATFORM_DECISIONS.md` when the task touches access, staff, the forum or delivery. The rules that most often matter:',
    '- **Access:** guard with the section\'s own permission (`requirePerm` / `adminGuard`); never accept `cms.posts` outside the magazine. A route that changes a user\'s role, status or password calls `accountChangeRefusal`. Staff standing and role change in the same write.',
    '- **Forum:** walk categories with `categoryTree` / `categoryFamily` / `categoryPath`; limit everything public with `visibleCategories(viewer)`; decide moderation with `inCategory` / `moderatesCategory`; compose follow, feed and reviews from identity, community and reviews. New forum styles are an appended block in `src/app/forum.css` under their own prefix.',
    '- **Public item pages** carry a `ManageBar` with the section\'s permission; shared admin editors honour `?edit=<id>`.',
    '- **Taxonomies:** a new way of filing content is a new taxonomy with one kind of item (see PLATFORM_DECISIONS §6A); name it in every branch on the taxonomy, never rely on an `else`.',
    '- **Evidence:** add `scripts/<name>.connected.cjs` (same functions as the page, several viewers, cleanup in `finally`), register it in `scripts/run-pg-checks.cjs`, then break each rule on purpose and see it fail (back the file up and copy it back). Unit tests go into a file already in `test:site`. Open visible changes in a browser at 1440 light/dark and 390.',
    '- **Local site:** `docker compose -f docker-compose.local.yml`; restart the app container after every change. Host scripts reach PostgreSQL on `127.0.0.1:5435`.',
    '- **Delivery:** branch from fresh `main`; the pull request targets `main`; do not merge. Leave the owner\'s four unstaged files (`.gitignore`, `next-env.d.ts`, `package.json`, `package-lock.json`) out of commits.',
    '- **Security floor:** limits that guard a secret use `await rateLimitStrict(...)`; a mutating `/api` call from a test or script sends `Origin`; an inline `<script>` in a component takes `nonce` from the `x-nonce` request header, and nothing uses inline event handlers (`src/platform/http/{rate-limit,origin-policy,csp}.ts`).',
    '- **Money rows:** change a state with `updateMany({ where: { id, status: <decided on> } })` and check the count; answer 409 when it is 0. The database refuses the rest (migration `20261216120000_money_state_rules`); a new state or wallet row type widens the constraint in a new migration.',
    '- **Block editor:** content of pages and articles is a MoboCom document saved through `saveDocument` (`src/modules/editor/server/documents.ts`), checked on the server and saved against `updatedAt`. A new block is a definition in the registry (fields, parents, children, version, migrations) plus its case in `domain/render.ts`; it needs no editor component. Never store HTML from a browser; never import `@wordpress/*` outside `src/components/editor/gutenberg`.',
    '- **One language:** do not add `…En` fields to forms. **Maintenance:** a section\'s public pages are closed by `/admin/maintenance`, enforced in `src/proxy.ts`; do not add a second switch.',
    '- **Large files:** past a few hundred lines, split by concern into `<name>/<concern>.ts` behind the same address; tests that read source read all the parts.',
    '- **Tests that travel:** no dependence on `.env`, on rows that happen to exist, on ids 1 and 2, or on being root; run unit tests in Linux as a non-root user before pushing (`docker run -u 1000:1000 …`).',
  ],
  'mobocom-contracts': [
    '## This repository',
    '- Stable request shapes added outside the public API so far: `POST /api/admin/section-managers { email | userId, sections[] }`, `POST /api/admin/forum { section: \'team\', action, username, categoryId? }`, `POST /api/forum/clubs`, `?edit=<id>` on the shared admin editors. They are same-process contracts: typed and covered by connected tests, no Pact.',
    '- `AuthorView.rank` (`admin` | `deputy` | `moderator`) and `Viewer.moderates` are part of the forum\'s internal contract; a client must treat an unknown rank as none.',
    '- A future app or Messenger reads standing from the same Identity and the same permissions (`docs/agent/PLATFORM_DECISIONS.md` §2–§4); do not mint a second notion of role for it.',
    '- Added 2026-10-07 (same-process, typed, covered by checks): `GET/PUT /api/admin/editor/:entity/:id` with `entity` `pages` | `posts`, body `{ document, updatedAt }`, answers 409 `CHANGED`, 422 `DOCUMENT_INVALID` with `issues`, 404 `EDITOR_OFF`; `GET /api/admin/editor` `{ enabled }`; `GET/PUT /api/admin/maintenance` `{ section, enabled?, title?, message? }`. The document format is versioned (`version: 1`, each block its own `version`); a client keeps blocks it does not know and sends them back unchanged.',
    '- A page of a section in maintenance answers 503 with `Retry-After`; a client treats it as "come back later", not as an error of its own.',
  ],
  'mobocom-extensions': [
    '## This repository',
    '- A plugin is `src/plugins/<id>/manifest.json`; run `npm run extensions:generate` after changing one. `requires` makes a module effectively off when what it needs is off.',
    '- A plugin that adds a section declares **its own** permission and uses only that in its guards and admin menu. It never lists `cms.posts` unless it is the magazine (a unit test fails otherwise). To make the section delegable, add it to `SITE_SECTIONS` (`src/modules/identity/domain/sections.ts`); if its editors upload pictures, to `CONTENT_EDIT_PERMISSIONS`.',
    '- Wrap admin APIs of an optional module with `whenModuleOn(id, handler)`; pages with `requireModule(id)`; compositions with `isModuleEnabled(id)`. Tell notifications which module an event belongs to (`notifications/domain/event-modules.ts`).',
    '- VPN, reseller and marketplace are set aside by the owner: keep them working behind their switches, do not extend them unasked.',
    '- The block editor is the plugin `block-editor` (on by default); off, the forms fall back to the old editor and documents are kept. A module adds block types with `registerModuleBlocks` (`src/modules/editor/server/documents.ts`); a block of a module that is off is kept in the document and shown as unsupported, never dropped.',
    '- A plugin that adds a section with public pages adds it to `MAINTENANCE_SECTIONS` (`src/modules/site/domain/maintenance.ts`) so it can be put in maintenance by itself.',
  ],
  'mobocom-release': [
    '## This repository',
    '- Deploy step for the owner: `npm run deploy:migrate`. Migrations added since 2026-10-06: `20261129120000` and `20261130120000` (cinema calendar and episode alerts), `20261201120000` (digital codes), `20261202120000` (forum moderators), `20261203120000` (data only: roles holding `cms.posts` keep what it used to open), `20261204120000` (clubs), `20261205120000` (data only: the first four music languages), `20261206120000` (a delivered code can be taken back), `20261207120000` (film release day), `20261208120000` (forum reputation, set from the reactions already stored), `20261209120000` (language of subtitle and audio files), `20261210120000` (collections written by staff), `20261211120000` (playback preferences), `20261212120000` (moderation cases), `20261213120000` (people of films and series; filled by a worker step after deploy), `20261214120000` (versions of edited items), `20261215120000` (saved admin views). All additive or data-preserving.',
    '- Migrations and releases: a migration is added to `unreleased` in `prisma/release-manifest.json` by the pull request that adds it; `node scripts/release-migrations.cjs list` shows what the next release will run; at release, `node scripts/release-migrations.cjs seal <version>` closes them, after which they are never edited. `npm run release:migrations` (in `npm run check`) fails on any disagreement.',
    '- Pull request gate: `.github/workflows/checks.yml` runs `npm run check`, a first deploy on an empty PostgreSQL (`deploy:migrate`, `deploy:seed`) with `test:pg` and `test:redis`, and the production build. A release is not cut from a commit whose checks are red.',
    '- Server settings still needed: `STORE_DELIVERY_KEY` for digital codes; SMTP or SMS for password recovery.',
    '- After deploy: arrange forum categories into sections, and narrow any role that held `cms.posts` if it should be the magazine alone (`/admin/section-managers`).',
    '- SQLite installs have no migration runner here: a data migration must be repeated by hand there.',
    '- Before calling `main` verified: `tsc`, `arch:check`, `source:check`, `schema:check`, `security:check`, `test:site` on Linux, `test:pg`, and the GitHub "Browser tests" run. Check that merged branches really reached `main` (`git merge-base --is-ancestor`).',
    '- Migrations added 2026-10-07: `20261214120000` (content revisions), `20261215120000` (admin saved views), `20261216120000` (money state rules: validates stored rows and stops with the constraint\'s name if one breaks a rule), `20261217120000` and `20261218120000` (document columns on pages and articles). All additive.',
    '- New since then: the plugin `block-editor` (GPL-2.0-or-later `@wordpress/*` packages, private use), the setting `site.maintenance.v1`, `npm run test:redis`. The production build needs a 4 GB heap on Node 22 (`NODE_OPTIONS=--max-old-space-size=4096`); the browser suite\'s development server needs more (`e2e.yml`).',
  ],
}
for (const root of ['.claude/skills', '.agents/skills']) for (const [name, lines] of Object.entries(SKILLS)) append(`${root}/${name}/SKILL.md`, '## This repository', lines.join('\n'))

// ---------------------------------------------------------------- root instructions (both agents)
for (const file of ['AGENTS.md', 'CLAUDE.md']) insertBefore(file, '## Tool routing', [
  '## Decisions in force',
  'Decided by the owner after the v4 prompt; full text, code locations and guards in `docs/agent/PLATFORM_DECISIONS.md`.',
  '- Focus: Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN, resellers and the marketplace are set aside and stay switchable off.',
  '- One permission per section; `cms.posts` is the magazine only. No shared content permission, no second authorization system.',
  '- Staff standing changes only through the staff guard; standing and role change together; staff without a role is full access.',
  '- Managers per site section come from `/admin/section-managers`; forum ranks (admin, deputy, forum moderator) name access that already exists.',
  '- Forum: section → forum → subforum; a section takes no topics; moderation is scoped with `inCategory`; follow, feed and reviews are composed from their owner modules. The forum is not a protected visual surface.',
  '- History: before launch a rule that changes a stored number is applied to everything already stored; after launch no update ignores or resets the past (recount from the stored events, or a data-safe backfill).',
  '- Every pull request targets `main`; the owner merges and deploys. Done means a connected PostgreSQL check and, for anything visible, a browser check actually ran.',
  '- Security floor: a limit that guards a secret is `rateLimitStrict`; a write to `/api` must show where it was made (a session cookie alone never writes; a tool sends `Origin`); scripts run by nonce, so an inline `<script>` takes `nonce` from `x-nonce` and inline event handlers do not run.',
  '- Money rows (orders, invoices, payments, wallet, fulfilment, returns): the database holds their states and amounts. Change a state with a claim (`updateMany` on the state it was decided on, then the count), never an unconditional `update`; a new state or wallet row type needs a migration that widens the constraint.',
  '- Content is written in the block editor (plugin `block-editor`, on by default) for pages and magazine articles. What is stored is the MoboCom document (`src/modules/editor/domain`), never an editing engine\'s output; `@wordpress/*` is imported only under `src/components/editor/gutenberg`; a new block is a registry definition, not editor code. With the plugin off the forms are the old editor again and every body is kept.',
  '- The site is written in one language; translation is Google Translate\'s. No English title, excerpt or body fields on the pages and articles forms (the columns are kept).',
  '- A section can be put in maintenance by itself (`/admin/maintenance`): visitors get the owner\'s notice, only full access and that section\'s managers see it. A new section with public pages joins `MAINTENANCE_SECTIONS`.',
  '- Every migration is listed in `prisma/release-manifest.json`; every pull request passes `.github/workflows/checks.yml` and the browser suite. A test must pass with no `.env`, on an empty database and as a user who is not root.',
  '- A module past a few hundred lines is a folder of parts behind the same address; other modules import the address, never a part.',
  '',
  '## Tool routing',
].join('\n'))

console.log(changed ? `${changed} document(s) updated` : 'everything was already in place')
