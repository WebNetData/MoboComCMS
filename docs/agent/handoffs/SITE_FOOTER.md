# Shared site footer — 2026-10-15

## Owner requirement and current source

The owner requested a modern, polished footer and explicitly corrected the initial inset/card draft: **the footer must be wide**. The final MoboCom/default footer is edge-to-edge at the viewport width, with responsive inner padding and no maximum-width shell. Preserve that requirement. Keep the site's semantic dark/light colors, current branding, navigation, published page links, account destinations, configured trust seals and plugin slots.

Authoritative source: `.mobocom/autonomous-foundation`, branch `feat/modern-site-footer-2026-10-15`, from merged main `96ffb392` (owner merged PR186). Root product checkout contains unrelated owner work. Do not restart or replace the footer/theme registry.

## Existing owners extended

- `src/components/site/default-theme/DefaultSiteFooter.tsx` remains the public default footer composition. Its private `footer/` folder owns scoped CSS, semantic navigation and back-to-top behavior.
- The existing MoboCom code theme delegates to `DefaultThemeFooter` through the existing theme client SDK. Its header remains intact. Other themes' own footers and explicit builder footer overrides retain their existing selection/lifecycle behavior.
- Existing Admin owners remain authoritative: site brand/tagline/copyright, logo/wordmark and dark wordmark, navigation/footer links, public navigation pages and TrustSeals. No parallel footer configuration, search, support, certification or newsletter system was added.
- Search is a normal GET to the canonical search page, hidden by the existing search-module hook. It does not register a second global search shortcut/dialog. Links use the existing alias-aware platform Link.
- `SiteConfig.footerYear` is a runtime-only label, computed from the UTC year in the server root layout and serialized once; it is not stored or recomputed during client hydration.
- Back-to-top honors reduced motion and returns keyboard focus to the header brand (or main fallback). Scoped footer spacing reserves room for the existing floating translation/support controls. Decorative glow/rings/wordmark do not intercept pointer events or become announced content.

## Executed evidence

- Original footer inspected before edits; the initial inset draft was replaced following the owner's width correction. Local `initial-inset-draft-*` images are that rejected draft, not the original baseline.
- Actual PostgreSQL-backed localhost browser: footer and its shell reach both viewport edges at1920,1440,768,390,320; light/dark desktop/mobile; scoped axe passes; reduced motion, back-to-top/focus, in-page discovery and real search navigation pass; no runtime/hydration errors in the final run.
- A separate actual browser pass confirmed the1920px footer width on `/`, `/blog`, `/music`, `/products`, `/games`, `/cinema`, `/software`, `/forum`, `/businesses` (all HTTP200). The existing global main/header content is outside this presentation slice.
- At320px, the Homepage already overflows to364px even with the footer hidden (header actions/product shelf). The footer itself does not overflow; this is a recorded pre-existing protected-surface limitation, not a whole-page no-overflow claim.
- Linux UID1000:36 brand/navigation/packages/site unit tests passed; `tsc --noEmit --incremental false`, `arch:check`, `source:check` (1861 TS/TSX), `security:check` passed.
- Installed React Doctor: explicit three footer component files and a changed-scope review against `origin/main` of the four changed tracked files both exit0/no issues, telemetry/supply-chain scan disabled. Initial nested-label and index-key warnings were fixed without suppressions.
- Production `next build` exit0 in the existing owned Linux UID1000/no-.env build workspace after refreshing all product source, with matching PostgreSQL client and `NODE_OPTIONS=--max-old-space-size=4096`. Existing unrelated Autoprefixer compatibility warnings remain. No whole release-stack or compiled-runtime browser claim.
- Local root evidence: `.mobocom/footer-evidence` (component screenshots, real bottom-of-viewport screenshots, section-widths.json, build.log). Component-only captures hide unrelated floating chrome only for the image; actual click/a11y checks keep it present.

Repeat browser scenarios using `scripts/footer.browser.cjs` with `E2E_BASE_URL=http://localhost:3000`, an evidence output directory, and the installed axe path in `E2E_AXE_PATH`. It reads existing public state without changing settings or creating database records. No dependencies, database schema, stored site configuration, permission rules or public addresses changed. No Actions dispatch, push, PR, merge or deployment was performed for this footer batch.
