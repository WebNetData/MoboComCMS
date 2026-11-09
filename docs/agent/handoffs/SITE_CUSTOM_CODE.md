# Site-wide custom code — 2026-11-09

Branch `feat/site-custom-code-2026-11-09`, stacked on PR396 (builder custom CSS) and PR395. Third slice of
the MoboCom "Elementor Pro" request. Owner merges/deploys.

## Boundary

- Site owner: `site/domain/site-code.ts` (normalize, conditions, protected paths) and
  `site/server/site-code.ts` on the existing `createSectionSettingsHistory` (key `site.code.v1`, entity
  `settings-site-code`): revision/If-Match, strict audit and history; no table or migration.
- Up to 30 snippets: name, kind html|css|js (CSS always in head), location head|body-start|body-end,
  enabled, include/exclude path prefixes (`/blog/*` wildcard), audience all|guests|members; 60k each.
- Master switch in settings; `SITE_CODE_DISABLED=1` on the server overrides everything for recovery.
- Never runs on `/admin`, `/api`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/install`,
  `/builder-preview`, `/maintenance`, so Admin can always switch a broken snippet off.
- `GET/PUT /api/admin/site-code` require `SCRIPT_PERMISSION` (`settings.manage`); PUT same-origin, 30/min,
  64-hex If-Match (428 missing, 409 stale keeps the form).
- Root layout reads live snippets once per render (`react` cache) and mounts `SiteCode` beside SitePopups.
  Conditions are evaluated in the browser on every client navigation. CSS/HTML mount and unmount by path;
  scripts (js snippets and scripts inside HTML) run at most once per page load. Dynamically created scripts
  follow the existing nonce + strict-dynamic CSP, like the builder's advanced code.
- Admin «ظاهر سایت → ظاهر و برند → کد سفارشی سایت» (`/admin/custom-code`): master switch, list with quick
  toggle/delete, editor with conditions and the AI code panel (API or Chat web; result folded into one
  snippet).

## Evidence (local)

- 210/210 AI, builder, navigation, routes, account-security and brand cases incl. a new site-code case;
  full `tsc` clean (LF copy in the preview container).
- Real API: save with revision, stale revision 409, limited staff 403.
- Browser: home ran the home-only HTML badge (with its inner script) and the all-pages JS once; client
  navigation to /vip removed the badge and did not re-run JS; /login and /admin ran nothing; no page errors.
  React dev double-mount initially ran JS twice — fixed by the once-per-load rule. Test setting deleted.
- Not run: real analytics/chat vendor snippets, AI against a real provider, e2e.
