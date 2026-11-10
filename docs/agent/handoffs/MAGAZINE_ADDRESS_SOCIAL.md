# Renamed section addresses and the auto-publishing desk — 2026-11-10

Branch `fix/magazine-path-social-autopost-2026-11-10` from main `5c19e6d5`. Owner merges/deploys.

## Renamed sections (journal published as /magazine)

- Breadcrumbs on the journal listing/category and article pages use `sectionName('journal')`: new journal section
  settings `section.name` / `section.name_en` (default مجله / Magazine), instead of the fixed «وبلاگ».
- Links that leave the site use the public address: social announcements (`toPublicPath(item.url)` after loading
  routing state), IndexNow submissions, breadcrumb JSON-LD. Sitemap and feeds already did. In-app links were
  already converted by `Link`; push/inbox paths still redirect once (unchanged).
- Bug found while testing: setting `/blog → /magazine` stored `/blog` in alias history; reverting kept it there, so
  `/blog` 308-redirected to itself. The save now drops the current address from history and the resolver ignores a
  history entry equal to the current address (heals stored data) and never redirects to the same path.

## Auto-publishing desk (Admin › انتشار در تلگرام و اینستاگرام)

- Channel cards (status dot, target, sent/failed/queued from `socialStats`), tabs, filterable log (`channel`,
  `status` query), Telegram/Instagram editors with a live preview rendered by the sender's own `renderPost` from a
  real recent item (`socialSample`), presets, cursor-inserted variables, platform length counters, push preview,
  unsaved-changes bar with revert. Styles `src/app/admin/social/social.css`, prefix `apx-` (`sp-` collided with
  server panel/media CSS). No settings contract change.

## Evidence (local)

- `routes` 18, `seo` 6, `site` 17, `engagement` 16, `journal-scheduling` 10, `social-proxy` 12; full `tsc` clean.
- With `/blog → magazine`: category and article breadcrumbs «مجله» → `/magazine…`, JSON-LD `/magazine…`; custom
  name «مجلهٔ فناوری» shown; social sample link `/magazine/…`. Set/revert cycle: history holds only the old address,
  `/blog` 200 after revert. Local alias, name and history restored.
- Browser 1440 light/dark and 390: all four tabs without overflow or console errors; preset, variable insert,
  dirty bar and revert work.
- Not run: a real Telegram/Instagram send, React Doctor.
