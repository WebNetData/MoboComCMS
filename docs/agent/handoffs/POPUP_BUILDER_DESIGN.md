# Builder-designed popups — 2026-11-09

## Campaign designs continuation — owner2026-11-15

Checkout `.mobocom/sms-platform`, branch `feat/popup-campaign-designs-2026-11-15`,
stacked on local visual-consistency commit `9e44b764`; fetched main `aa20d05a`
after owner merged PR478. This slice is local implementation, not a new PR,
release or production deployment. The earlier builder evidence below remains
historical. [Scenario](../../specs/popup-campaign-designs/SPEC.md).

Popups keeps its existing identity, audiences, scheduling, frequency, counters,
permissions, module guard, builder frame and route. New `domain/campaigns.ts`
owns three typed presentation presets (red gift, blue ticket, gold membership)
and bounded plain-text badge/highlight/label/detail/code/footnote normalization.
`CampaignGallery` creates editable drafts only; `CampaignContent`, isolated CSS
and local decorative `CampaignArtwork` extend the same native dialog. Optional
Media image failures fall back to artwork. Existing Admin form edits all copy,
image and action, includes a full-size preview and retains keyboard spaces while
typing. Preview actions do not navigate away. Unique dialog title IDs and focus
restoration also cover the existing designs. Effects run once, respect reduced
motion, and contain no invented timer or commercial discount rule. Coupon copy
is presentation; real discount validity belongs to Commerce.

Both Prisma schemas add `SitePopup.presentation` TEXT with `{}` default through
registered migration `20270324120000_popup_campaign_presentation`. Existing
`popups.manage`/`settings.manage`, Origin/write guards and disable behavior remain
authoritative. No new module registry, shared service, dependency or theme fork.

Executed local evidence:

- Fresh isolated PostgreSQL `mobocom_popup_campaign_test_20261115`: all207
  migrations, own generated client, UID1000, no `.env`. `site-popups.connected.cjs`
  passed two-connection campaign round trips/clear/pause plus existing audiences,
  frequency, expiry, groups and concurrent claims. Deliberately dropping served
  presentation failed that test; source was restored exactly. Four popup unit
  cases passed (`node --test --test-name-pattern=popup scripts/popup-builder.cases.cjs
  scripts/content-controls.test.cjs`). The former manual domain test loader and
  incomplete generated-catalog mock were corrected for the real dependencies.
- TypeScript, `check-source.mjs`, `check-architecture.mjs`, schema parity and
  release-migration checks passed. Final Admin raw-input correction was copied
  into the isolated source and TypeScript passed again.
- Actual Edge/Playwright:17 scoped views with axe0, no horizontal overflow or
  page errors: gallery desktop-dark/mobile-light; three full-size previews; all
  three actual public dialogs at1440/390 in both themes. Real Admin draft save,
  reload, selection, Escape/focus restoration and copy success/failure feedback
  passed. Clipboard is a controlled browser stub, not OS clipboard certification.
  Member direct Admin request403, popup-only editor200 and unrelated settings403.
  Actual module-off public/Admin APIs404 and no public dialog; original setting
  restored by a claim after testing.
- Seven additional real public cases passed axe/overflow: long text/40-character
  mixed code, broken-image fallback, own local image, required confirmation
  (Escape retained dialog), nonmodal corner, legacy seal and normal-motion reveal.
  Actual CTA navigated to `/products`, incremented click and guest-view counters.
  Final six new fields received sequential Persian keyboard text with spaces,
  saved as a real draft and reloaded unchanged; preview Escape passed again.
- React Doctor0.9.17: five affected files,0 errors/13 reviewed advisories; final
  Admin-only rerun0 errors/8 advisories. Remaining existing lookup/complexity,
  duplicate JSX, repeat-radio names and native-dialog click/callback diagnostics
  were not suppressed. New composition complexity is bounded and browser checked.
  Independent read-only reviewer found no remaining actionable defect.
- Scoped Semgrep:4 popup files/1 local dynamic-code rule,0 findings. This is
  limited static analysis, not a complete security certification.

Failed attempts retained honestly: the broad content-controls run was99/102
before fixing the popup loader; unrelated missing `network-earth.webp` test
fixture and existing RepairWorkPanel source assertion remain outside this slice.
The accepted popup-only run is4/4, not a claimed full-suite pass. Initial browser
checks exposed CSS specificity/import ordering and focus restoration; both fixed
before accepted runs. A synthetic editor role initially used JSON instead of the
existing CSV contract; only the fixture was corrected. The synthetic public page
rule initially used its visible permalink, while current SitePopups compares
canonical `/p/<slug>`; corrected the fixture, leaving routing semantics unchanged.
Serena initial-instructions retry stalled; manual was already loaded earlier and
bounded exact-source/diff review continued. First Semgrep config path failed;
the actual root-local configuration rerun passed.

Local adoption: private source/container/PostgreSQL backups were taken before
normal restart applied migration207 on existing `mobocom-app`/port3000. Image,
storage, env and readonly `/src` bind are preserved. Pre/post old-popup fingerprint
matched, but this local database had **zero existing popup rows**, so populated
popup-upgrade proof is not claimed. Native tests exercise legacy empty inputs.
Owned synthetic campaigns, page, users, role and audit rows were removed; exact
prior Popups setting restored transactionally. Ignored `var/popup-campaigns`
contains screenshots/nonsecret receipts/private backup; never publish private
cookies, database dump or generated environment files.

Rollback: pause the affected campaigns or disable Popups without deleting data.
Older compatible code ignores the additive presentation column; keep it and all
stored copy. Restore only reviewed source after preserving subsequent edits;
the private database backup is recovery material, never an automatic whole-data
reset. No real commercial campaign, provider message, hosted workflow, production
build, PR, merge or external deployment was performed. Future publishing should
retain the local UI parent commit and target main; owner merges/deploys.

Final local adoption receipt: all18 changed runtime/schema/test/generated-source
files match exact source hashes in both `/src` and `/app` after normal restart.
Same container ID, image, port bindings and mounts confirmed;207 completed
migrations, zero synthetic users/pages. Final guest browser home200/no popup,
readiness `/api/health/ready`200, session200/empty, public list200/empty and direct
Admin API403 passed. First smoke used nonexistent `/api/health` (404), then assumed
anonymous401 instead of existing403; corrected harness expectations, not guards.
Gitleaks8.30.1 scanned the23 reviewed source/doc files with redaction,0 leaks.
Canonical14-document AI knowledge refreshed and checked; diff whitespace clean.
The exact isolated test database was dropped only after confirming no sessions
and a different running DB; its private environment and host/container fixture
cookies were removed. Private pre-change recovery backups remain ignored.
No additional feature work is pending in this slice; next operator action is
reviewing templates in `/admin/popups`, customizing a draft, and publishing only
a real campaign with valid commercial conditions. Future PR must include its
local UI parent; this request did not publish one.

Branch `feat/popup-builder-design-2026-11-09`, stacked on PR400 → PR399 → PR398. Completes slice 5 of the
MoboCom "Elementor Pro" request. Owner merges/deploys.

## Boundary

- Popups owner keeps audience, schedule, frequency, pages and counters. New design `builder` stores a saved
  builder template id in additive column `SitePopup.templateId` (both schemas; migration
  `20270226120000_site_popup_builder_design`, registered unreleased). `normalizePopup` requires a valid id for
  this design and stores none for others.
- The browser keeps receiving JSON. A builder popup's dialog frames `/popup-design/<id>?r=<revision>`: a
  server page that reads the session, rechecks the popup is live, `builder` and that the viewer is in its
  audience (`builderPopupDesign`), then renders the saved template with `BuilderRenderer` (noindex). Member-
  or manager-only designs never reach other viewers.
- `PopupDesignBridge` inside the frame posts its design height and link clicks to the same-origin parent;
  the dialog sizes the frame (≤80vh), counts the click and navigates the main window (other origins open in
  a new tab). `SitePopups` and site custom code never run inside `/popup-design`.
- Admin: «طراحی با صفحه‌ساز» shows a picker of saved templates (listed in the admin popups response). The
  admin preview shows a note instead of the frame.

## Evidence (local)

- 277 related cases incl. 2 new popup cases; schema parity and release migrations OK; full `tsc` clean.
- Migration applied to the local preview database (additive; older code ignores the column).
- Browser 1280/390 as guest: the home page opened the builder popup with the saved design, the frame fit its
  content (268px), no nested popup, the button navigated the main window to /products, no page errors.
- HTTP: after switching to members-only, a guest received no design, a member did; unknown ids return none.
  Fixture template and popup removed; saved templates restored byte-equal.
- Not run: the admin form in the browser; e2e.
