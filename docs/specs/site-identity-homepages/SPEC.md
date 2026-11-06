# Site identity and specialist homepages — 2026-11-06

Owner wants configurable favicon/all site identity and selectable specialist
homepages for hosting/domains/servers, news, store, music, cinema/series, software
and games. Preserve the approved current home as the default; configure one
platform for specialist businesses, never fork it or enable modules implicitly.
Base merged PR365/main45e93260; R3 shared-settings/public-rendering change.

Evidence: SiteConfig + /admin/branding already own brand and three logo slots;
Studio owns tagline/copyright/contact and SEO owns titles/descriptions/share cards.
Root metadata still hardcodes favicon; PWA has generated-logo icons. Theme Builder
already owns free page templates, home placement and the ordinary visual document.
Seven specialist whole-home presets are absent; software is absent from builder
media sources. Reuse these owners, not a second homepage/theme/settings system.

Identity: extend SiteConfig with typed optional icon/installed-app identity fields;
keep existing names/tagline/copyright. One branding screen edits them with a
sparse strict Settings CAS/history/audit mutation. Reject unsafe icon URLs and
malformed colours; stale/failed reads never overwrite defaults. Connect root
metadata/viewport/manifest and generated app icon fallback; keep SEO/contact
controls linked to their canonical screens instead of duplicating their fields.

Home: add seven editable ordinary builder presets to the existing bundled
registry, and a dedicated Admin selection desk over existing theme templates.
Create draft, preview/edit, then explicit publish/select at /. Switching retains
every document; default removes home placement and restores existing home
builder/default. Claim the template-index value and commit document/history/
placement/audit atomically. Existing template mutations must not lose a concurrent
selection. Settings permission + existing page-template permission govern changes;
Origin/module guards remain. Missing/corrupt index and stale selection fail closed.

New designs have different section rhythm, live owner feeds and bounded effects
from the existing builder. No fake prices, testimonials or service guarantees.
Software extends the current media feed; hosting uses public hosting owner data.
Published/audience/maintenance/module rules remain authoritative; module-off
preserves stored templates and never prevents Core from rendering. Presets are
starting points, not business-rule owners. Menus/modules remain explicitly
configurable through the existing Studio/extension manager.

No schema/dependency/public URL change or automatic conversion of existing home.
Acceptance: pure icon/identity/preset validation; native PostgreSQL sparse/stale/
first-write/concurrent template changes, audit rollback, public feed isolation,
default restoration and authorization; deliberate breaks of key invariants;
actual branding/icon/manifest + all seven public homepage browser paths, responsive
light/dark/RTL/keyboard/axe/reduced motion; types/architecture/security/Doctor.
Run focused checks once on final source, no redundant full release stack. Rollback
chooses original home, keeps documents and Settings/history; owner merges/deploys.
