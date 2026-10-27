# Navigation and category control

Owner request: manage categories, descendants, site/header/footer menus and section megamenus, including add, remove, hide, order and icons.

## Existing owners and boundaries

- `site.config.v1` owns header/footer links in Site Studio; extend these links with optional children, visibility and icons. Existing flat documents retain their meaning.
- `site.megamenu.v1` owns section bars and their presentation. Extend this configuration with custom trees and category presentation overrides; do not copy category records into a second taxonomy.
- Magazine `PostCategory`, Store `ProductCategory`, specialist `TaxonomyTerm` and Forum categories retain their existing CRUD, parent validation, permissions and public addresses. Link to those editors from navigation management.
- Menu hiding is presentation only: it never deletes content, changes publication or grants access. A hidden ancestor hides its descendants. Deleted category records are never recreated from settings.
- Forum menus use the canonical guest visibility resolver. Optional module/store/API filters apply recursively, including custom links.

## Behavior and safety

Site administrators with `settings.manage` edit navigation; section managers keep their own category permissions. Authors gain no taxonomy/settings rights. Existing page `showInNav` remains the owner of automatic page links. Explicit empty icon means no icon; absent icon retains the theme default. Menus have bounded depth/size and safe URLs, without HTML/SVG input. Reparenting is bounded and cannot introduce a cycle. Persist settings with a revision claim and transactional audit; stale writes return 409 and do not overwrite unrelated branding/content changes. No schema replacement or destructive migration.

RTL Admin uses existing SDS/MoboCom surfaces, accessible named controls, keyboard actions and loading/error/empty/pending feedback. Existing public layout, responsive overflow behavior, footer width and theme identity remain protected. New child menus support keyboard/Escape/outside dismissal and mobile browsing.

## Acceptance

Domain checks cover old documents, unsafe links, limits, hidden ancestors, nested disabled modules and icon removal. Connected PostgreSQL checks cover persisted round trips, conflicts, audit rollback and existing category ownership. Real local browser checks cover create/edit/reorder/hide/delete, children, icon changes, header/footer/section rendering at desktop light/dark and mobile, direct forbidden API calls and existing public visuals. Run affected TypeScript, navigation/site tests, React Doctor and scoped architecture/security checks. Record commands and limitations in the handoff and capability ledger; do not dispatch hosted browser workflows.
## Slice — section presets, company pages and player light theme (2026-10-27)

Owner requests full existing header/navbar/mega-menu control, one-click complete
section insertion, header + section navigation for Celebrities/Businesses, Home
about/contact links, attractive managed company pages and a light music player.

Audit: tree/icon/display/order/visibility and stale-save/audit/history already
exist. Preserve them. Missing: section insertion recipe, Home/Celebrities/
Businesses in the existing section-bar registry, managed company contacts/map,
and light styling of the globally mounted player/queue. Existing about is a
legacy CMS Page; contact is absent. Do not replace custom stored page content.

- Extend existing Navigation section registry and section-owned public sources.
  Presets import actual public category/link trees into an editable draft, merge
  missing links without overwriting custom values, keep stable IDs and reject
  existing 120-node/five-level limits without silently truncating. No second menu
  database, taxonomy or permission system. A hidden menu is not authorization.
- SiteConfig gains optional typed public contact fields (address, phone, email,
  Telegram/Instagram/X, hours, coordinate pair, map switch/zoom). Existing Studio
  save/CAS/audit/history owns them. User explicitly requires Admin control, not
  hardcoded contact values. Empty channels stay absent publicly. Pasting a Google
  link extracts the selected marker before the camera center; no server fetch,
  arbitrary HTML/iframe input, API key or invented coordinates/contact details.
- Existing CMS Page bodies/URLs/editor and per-page layout own about/contact.
  Add an optional company-panel layout setting and a themed public contact/map
  composition. Seed contact only if absent; preserve custom about content and
  existing pages. No competing page/editor store. Settings need settings.manage;
  page writes keep cms.pages. Initial requested local menu configuration is a
  separate explicit saved change, not a rendering-time mutation.
- Map iframe is generated from validated coordinates for OpenStreetMap's public
  embed (with attribution), with a matching Google directions link. CSP permits
  only its explicit host on relevant page/Admin paths. Missing/disabled maps
  render no fake marker. Provider failure retains an ordinary directions link.
- Light CSS scopes to the existing global player, queue and controls;
  no player replacement, playback/identity/permissions change or dark redesign.
- Acceptance: pure menu/coordinate/schema tests; extend the registered native PG
  navigation-control and execute existing builder-history; stale/permission/
  Origin/rollback and non-destructive preset tests, deliberate source faults;
  real browser Admin/public/keyboard/persistence plus 1440/390 light/dark/axe;
  real player/queue light/dark checks, Doctor, scoped security/types/build.
  No hosted Actions, deployment or external-message delivery claim.
- Backward-compatible optional JSON fields; no schema migration. Rollback leaves
  existing settings/pages in place. Old readers ignore the company panel; do not
  delete stored content/configuration to roll back presentation.

