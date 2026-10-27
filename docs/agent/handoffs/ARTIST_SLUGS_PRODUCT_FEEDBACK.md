# Artist URLs and product-feedback filters — 2026-10-27

Authoritative checkout: `.mobocom/autonomous-foundation`, branch
`fix/artist-slugs-product-feedback-2026-10-27`, from main `3a773eb9`.
Continue the owner's central artist/profile and light-theme work; do not rebuild it.

## Contract and owners

- Celebrities remains the single artist-page owner, composing existing Cinema
  and Music profiles. The existing editor now exposes `slug`, an LTR preview and
  an explicit “ساخت از نام انگلیسی” action. A new English name suggests a bounded
  lowercase ASCII URL; manual typing stops automatic replacement. Existing
  URLs stay fixed until explicitly edited. English remains optional; old clients
  without `slug` retain the numbered fallback / free-name suffix behavior.
- Admin POST accepts optional `slug` and `expectedSlug`. Malformed slugs return
  422; occupied current/previous URLs or stale editor tokens return 409. Existing
  dual Music/Cinema manager guards, Origin policy and strict limit stay in force.
  Known collisions are refused before source-profile writes.
- `CelebritySlugAlias`, additive migration
  `20270130120000_celebrity_slug_aliases`, keeps previous URLs reserved against
  reuse. Canonical rename and alias swap are one Serializable transaction;
  aliases follow the retained identity when profiles are joined. Public lookup
  retains the same public-work visibility predicate. The public page uses a
  permanent redirect and current canonical metadata, without redirect chains.
- Source-profile commands moved behind the same public server address into
  `server/celebrities/profile.ts`; validation and Music/Cinema save owners stay.
  Renaming the central URL does not change existing MusicArtist slugs, IDs,
  works or follow targets. No automatic bulk rewrite of legacy URLs.
- Same-process Admin contracts: strict types plus native/browser evidence;
  no new public API, shared identity/routing service, permission or dependency.
  Existing section profile saves are still separate owner transactions; this
  slice does not claim global atomicity across all profile metadata writes.

## Product-feedback Admin

Existing Catalog GET/PATCH and `cms.products` own the records and moderation.
Only `/admin/product-feedback` presentation/client loading changed: visible
labels, bounded responsive fields and scoped native `appearance: auto` pickers
avoid relying on partially supported customizable selects. The global select
styles and protected public designs are unchanged. Loading, failed load/retry
and actual empty results have distinct feedback. Aborted/obsolete filter reads
cannot display a previous kind; actions stay bound to the visible kind.
Question answer fields have explicit stable labels after persisted reload.

The reported blank popup was not reproduced in installed Edge: baseline options
were readable, but fields stretched across the page and failed reads were
silently shown as empty. Native picker compatibility is a focused mitigation,
not evidence of testing every OS/browser. Scoped artist form ghost-button text
also fixes the actually observed light-theme 3.16:1 Library-button contrast.

## Executed local validation

- Linux UID1000, owned fresh PostgreSQL, current migrations, no `.env`:
  full `npm run check` passed **721 + 53 + 4 + 10 = 788 tests**, no failures/skips,
  full types and existing architecture/source/schema/security/migration gates.
- Native `celebrity-profile` (now registered), `celebrities`,
  `cinema-people-admin`, `music-artist-profiles` passed. Coverage includes shared
  profile/IDs, English/custom URLs, invalid/occupied/reserved addresses, stable
  name-only edits, stale tokens, rename/reclaim, public-only alias lookup,
  join/alias transfer and existing section ownership/concurrency/audit behavior.
  Two isolated deliberate faults (lost prior URL, removed stale-token check)
  failed their intended assertions; restored source passed.
- Production build passed: **96/96** static pages, compilation **59s**. Existing
  **43 build warnings** remain; no baseline/suppression change or deployment claim.
- Maintained `e2e/tests/artist-slug-feedback.spec.ts` passed two real localhost
  cases in the final **16.4s** run (zero skips/retries):
  new suggestion/manual/reset/invalid/persist/reopen/rename,
  real public old-URL redirect/canonical, section-only save denial, native keyboard
  filters/all statuses, actual persisted question answer, injected failed read
  and retry, an explicitly observed delayed obsolete response, visitor denial.
  Artist and feedback forms each passed light/dark 1440/390: no page errors,
  overflow or scoped axe WCAG2A/AA/2.1AA violations. Screenshots inspected.
- React Doctor: three affected TSX, telemetry/supply-chain off, blocking error,
  exit0, **0 errors / 6 reviewed warnings**. Three complexity diagnostics,
  existing private editor bootstrap/JSON error parsing, and guarded async state
  in the feedback effect remain. The editor is keyed by ID; feedback reads have
  AbortController guards. No suppressions or blanket UI certification.
- Scoped existing local Semgrep rule: eight production files, zero findings/
  errors. Redacted Gitleaks on selected changed source/tests/schema/SQL: zero.
  Offline code-only Graphify refreshed; graph relationships are discovery evidence.
- Additive migration also ran on the existing local database. Before/after
  fingerprints verified all existing Celebrity IDs/addresses/source relations
  unchanged and the new alias table empty before browser fixtures.
- Owned browser identities, profiles/aliases, product/feedback, track release,
  search, history and audit fixtures were removed and independently checked in
  PostgreSQL. Private JWT files and failed-run browser traces were removed.
  The isolated source/dependency copy and fresh test database were removed after
  retaining ten native/check/build/migration/generation/fault logs privately.
  The running local app matches all ten changed production source/style files;
  `/api/health/ready` returns 200/database ready on port 3000.

Early runs are not passes: isolated Prisma generation initially refused a shared
root-owned dependency tree (resolved with an owned dependency copy); a native
expectation confused the separate music/canonical URL namespaces; browser checks
found the contrast issue and a textarea-label lookup issue. Later test harness
errors targeted the upload endpoint instead of media-library and matched Next's
route announcer as an extra alert; corrected before final passing browser runs.
Private evidence: `.mobocom/artist-feedback-evidence/`. No hosted Actions/PR/deploy.

## Repeat and rollout

Run `node scripts/run-pg-checks.cjs celebrity-profile` on an owned migrated PG
database. Browser cases need an explicitly owned localhost
`E2E_ARTIST_FEEDBACK_FIXTURE`; `E2E_AXE_PATH` enables recorded accessibility checks.
Never substitute owner accounts/products. Native source faults belong only in
an isolated source copy, restored in `finally`.

Deploy the additive migration with `npm run deploy:migrate` and generate the
matching Prisma client before this code. For older SQLite installs, use their
existing schema-update process; no SQLite migration rehearsal is claimed.
An old binary tolerates the extra table, but does not resolve aliases: retain
this resolver when rolling back after a URL change. No aliases or live data
should be purged for rollback. Other themes, Firefox/Safari and native mobile OS
pickers were not independently tested.
