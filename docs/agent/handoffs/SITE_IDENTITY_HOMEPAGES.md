# Site identity and specialist homepages — 2026-11-06

Branch `feat/site-identity-specialist-homes-2026-11-06`, from owner-merged
PR365/main `45e93260`. [Scenario](../../specs/site-identity-homepages/SPEC.md),
[Persian operator guide](../../SITE-IDENTITY-HOMEPAGES-FA.md).

## Ownership and behaviour

Existing SiteConfig/Settings/history/Audit owns identity. Optional typed
`identity` fields cover favicon, Apple/app/maskable icons, short name and browser/
app colours. `/admin/branding` also edits the existing name, tagline, copyright
and three logo slots. SEO, contact, menus, fonts and theme colours stay in their
existing owners, linked from that screen. Root metadata, viewport and manifest
consume these fields; empty values retain existing generated/default assets.
Custom app icons do not silently inherit a maskable icon with another identity.

New internal PATCH `/api/admin/site` requires current settings.manage, explicit
same-site Origin, bounded JSON and If-Match. Sparse root updates preserve other
SiteConfig properties, including unknown owner metadata. Strict stored reads,
canonical Settings CAS/Serializable transaction, revision/history and strict
audit prevent stale overwrites or partially committed saves. Invalid icons/
colours return422; stale writes409; failed strict reads/audit503. Safe icon
addresses are root-relative or HTTPS, without credentials/control characters.
Existing GET/PUT contracts remain available.

Brand upload uses the existing Library/LogoEditor pipeline, not a second upload
endpoint. A real delayed-upload browser scenario found a stale callback losing
the image when text changed concurrently: functional state updates now preserve
both. The global save locks its fields and waits for the image editor to close;
native file inputs remain keyboard focusable. Final actual upload produced and
served the canonical WebP cover URL.

Existing Theme Builder owns all seven homes: Hosting/servers/domains, Journal,
Store, Music, Cinema/series, Software and Games. `specialist-homes.ts` extends
the bundled page-template registry with ordinary editable documents. Reused
builder effects provide grid/dots/mesh/aurora, reveal and hover treatments;
existing reduced-motion behaviour remains. No fabricated products, prices,
guarantees, testimonials or statistics are embedded.

`/admin/homepage` and internal GET/POST/PUT `/api/admin/homepage` require both
settings.manage and cms.pages plus enabled page-builder. Create makes a private
draft without changing `/`; edit and preview use the existing builder. Explicit
version-bound selection publishes/places one page at home. Other placements
cannot be stolen: copy those templates first. Default restoration clears home
placement, preserving all templates and the original home-builder document.
Module activation, menus, staff rights and content are never changed implicitly.

`theme-index.ts` extends the existing array-format Settings index with strict
reads and claimed Serializable mutations. Existing create/update/delete callers
share that owner; creation/document/history and homepage selection/audit commit
atomically. First-write conflicts and transaction conflicts retry boundedly.
Corrupt indexes fail closed instead of replacing them with an empty list.
Optional validated `solution` metadata survives duplication. Disabled/maintenance
solution modules retain the selected document and fall back to original home;
Admin explains that fallback. Preview shares the solution marker and scoped CSS.

Journal/Catalog/Media supply public lists. Software extends the canonical media
feed and uses its existing SoftwareCard; Hosting reads only public active plans
and canonical minor-unit prices, linking to the existing ordering routes. The
new widgets participate in existing module/maintenance visibility and inspector/
palette controls. No provider credentials or provisioning actions enter a home.

Single-Journal testing also exposed a warm MegaBar retaining a Store link after
Store shutdown. Navigation's existing cache now includes runtime availability
and the mirrored Store/public-API switches, in addition to menu revision. The
regression verifies removal without waiting for cache expiry. Stored menus and
protected section designs remain intact.

## Executed evidence

Ignored `.mobocom/site-homes/`: owned Node22/Linux UID1000/no-.env runtime,
native PostgreSQL `mobocom_site_homes_check`, synthetic accounts/content/images.
The existing app/database services and owner uploads were not used as fixtures.

- Final61 focused builder/SEO/navigation tests passed, zero skipped. New cases
  are registered through the existing builder test entry point.
- Registered native site-identity-homepages passed on final source: sparse/
  stale/parallel identity CAS, unknown-field preservation, strict audit rollback,
  concurrent first index creation, concurrent template edits/selection, retained
  original home, selection/reversal, current permissions, module-off denial,
  corrupt-index refusal, warmed navigation cache and canonical public software.
  Existing builder-history also passed earlier in this slice.
- All173 existing migrations applied to the disposable empty database. This
  slice adds no migration, schema, dependency or new shared settings system.
- Three deliberate faults in isolated source copies/empty databases were caught
  at the intended assertions: omitted identity revision, omitted page permission
  and omitted availability cache key. Actual source stayed intact; fault
  databases were dropped. The unmodified final connected check passed.
- Actual browser created/selected all seven homes with real synthetic public
  records, excluded hidden records, preserved draft/live separation and restored
  the default. Public main scopes were checked at1440/390 in light/dark; final
  Games views were repeated with asserted SSR theme cookies after visual review
  found a dev navigation had reset the earlier DOM-selected dark screenshot.
- Final loaded Admin gallery and Branding each passed four SSR-themed responsive
  views, scoped WCAG2A/AA/2.1AA axe0, no overflow and no page errors. Gallery
  readiness includes all seven creation controls and retained-template list;
  loading-state captures were replaced. Public desktop/mobile captures and final
  Admin captures were visually inspected.
- Actual persisted icons/title/Apple/theme metadata and manifest fields passed;
  real upload/keyboard file focus, delayed upload plus simultaneous typing,
  disabled inputs during delayed save and publicly served favicon200 passed.
  Invalid/malformed input, missing Origin, anonymous, insufficient permissions
  and stale revision denials passed. Actual Hosting editor iframe and private
  draft preview passed; Games dark private preview passed scoped axe0.
- Selected-module-off fallback retained its chosen template. Actual single-
  Journal site excluded the disabled sections' root navigation links and kept
  Journal content. The resumed final probe passed these phases; its end-only
  receipt was interrupted by a dev navigation. Final view receipts are separate
  successful runs, not a claim that the interrupted whole script passed.
- Final TypeScript, architecture, source syntax/import2513, security, audit and
  money-UI2515 gates passed. Scoped Semgrep32 source files/two local unsafe-code/
  unsafe-SQL rules found0; redacted changed-source Gitleaks found0. These are
  bounded checks, not a full security certification.
- React Doctor0 errors/45 reviewed warnings: existing renderer/inspector/layout
  index keys, label compositions, complexity, sequencing and routing; Branding
  revision state is updated with rendered config, error JSON is deliberately
  parsed before the status branch, and its inherited initial fetch remains
  effect-based. Home inherits root metadata. No warning suppression/baseline
  change. Graphify local refresh succeeded with zero semantic/provider tokens.
- All39 final source/script hashes matched the tested copy after LF
  normalization. Original mixed file endings were preserved without changing
  content. The owned runtime/database and ephemeral cookie were removed;
  original app/database services remained running and sessionHTTP200 passed.

Early test/harness failures are not passes: incorrect preview/save-state
selectors were corrected against actual controls; the single-section fixture
was corrected to update the real mirrored Store flag; dev refresh interruptions
were resumed at the affected phases. Contrast findings in branding and the
Games home link were corrected in scoped styles and verified in the browser.

## Limits, operation and rollback

No production build/release, hosted workflow, deployment, live hosting provider
or physical PWA installation was run. Browser/OS installed-icon caching remains
device-dependent; use a new asset URL after replacement. These presets are
editable starting points; additional specialist variants use the same registry/
builder. Setting up a single-section business still requires explicit module,
menu, branding and content configuration in their existing Admin screens.

Owner merges/deploys. For immediate display rollback choose the original home
in `/admin/homepage`, restore a prior Site settings revision or clear custom icon
fields. Data and documents remain. Code rollback has no schema reversal;
back up Settings first, because an older validator may not recognise new hosting
widgets or solution metadata. Keep specialist documents for a later re-enable.
