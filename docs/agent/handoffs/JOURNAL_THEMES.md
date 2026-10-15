# Magazine light edition — 2026-10-15

Owner requested a working light/white version of the existing magazine. Continue the current authoritative `.mobocom/autonomous-foundation`; this extends the existing Liona composition, not a new theme or page implementation.

## Ownership and behavior

- `src/app/journal-liona.css`: explicit `html[data-theme="light"] .journal-lh` semantic surface/text/border tokens; readable cyan accent, pale category/panel colors, white hero list and light photographic hero/archive washes. Image-overlay story cards retain their cinematic treatment. Existing dark declarations, geometry, content ordering and interactions remain unchanged.
- `src/app/journal-design.css`: light article canvas uses existing `--card`; cinematic article cover and syntax/code treatment remain. Existing site theme control/cookie and Admin semantic colors are authoritative; no parallel toggle/settings/theme registry.
- No source React, API, permissions, data, schema, public URL or package changes. Existing section navigation/search/listing and shared header/footer are retained.

## Executed evidence

- Real localhost PostgreSQL-backed browser before/after1440 and390, light/dark: original light magazine background18/19/28 was reproduced; final light255/255/255 with dark text, original dark colors retained. Final light landing scoped axe has zero violations at both widths; no page overflow.
- Actual independent desktop/mobile contexts: theme control light→dark→light, category navigation, search/empty state, existing article navigation/white canvas and article contrast passed; final runtime/hydration errors empty. The harness waits for actual rendered styles across theme reloads; early mixed-context/transition/hidden-input selector attempts were corrected and are not passing evidence.
- Article mobile code block has a pre-existing `scrollable-region-focusable` finding on `pre`, reproduced in light and dark and recorded separately. Existing dark landing has white-on-cyan badge contrast findings; the light edition fixes its own badges. Do not claim whole-magazine WCAG compliance. These untouched legacy issues are follow-up candidates.
- Linux UID1000:10 existing journal picker/scheduling tests passed; their legacy revision mocks log errors while tests pass. Native read-only PostgreSQL version/Settings query passed; no rows written by this batch.
- Installed React Doctor on unchanged `LionaHome.tsx`: exit0, one existing required section-export warning, no blocking errors. No suppression or clean-file claim. CRLF-aware owned diff whitespace check passed. No full TypeScript/build/release/hosted Actions rerun for this CSS-only slice.

Root ignored evidence: `.mobocom/journal-theme-evidence` (before/after screenshots/colors, landing axe files, `acceptance.json`, separate article legacy finding). `dark-article-existing-scroll-check-390.png` is explicitly the dark comparison; final `light-article-390.png` / `light-article-reading-390.png` are fresh actual light captures. Desktop landing and mobile article screenshots visually inspected. No push/PR/deploy in this batch.

## Article width, reading tools and category breadcrumb — 2026-10-15

Continue the same implementation and branch. The owner requested wider articles, a reading percentage that stays visible beneath the sticky magazine navigation, and a styled topic-page breadcrumb.

- `journal-design.css`: article shell follows the existing MoboCom `--mb-chrome` width; the reading rail clears the section bar and its lower veil in the MoboCom design. Other designs retain their existing rail offset. The existing progress calculation, sharing controls and mobile rail visibility are unchanged.
- `journal-liona.css` and the existing blog page: semantic ordered-list breadcrumb with shared portal icons, current-page marker, focus styles and wrapping; theme-aware category heading panel/count. Existing URLs, category/search logic, permissions and data owners are unchanged. No schema, settings or package changes.
- Reproduced before: article shell1280px at1440/1920 while header1408/1888; the reading meter could sit at107px under the section bar ending144px, with hit-testing reaching navigation. After: shell1408/1888 (mobile390 shell366), meter187px/rail176px, and hit-testing reaches the meter itself. Actual down/up scrolling updates the existing percentage.
- Actual PostgreSQL-backed browser checks passed light/dark1440, light1920 and light390: rail clearance, wide shell, no page overflow, category current marker, breadcrumb navigation and scoped category-heading axe0; final runtime/hydration errors empty. Desktop category and scrolled article screenshots visually inspected. Root ignored evidence: `.mobocom/journal-layout-evidence` (`before.json`, `after.json`, screenshots).
- Native read-only PostgreSQL version/Settings query and architecture check passed. Scoped React Doctor exit0 with three existing warnings (route-owned metadata, complexity, sequential awaits), no blocking errors or suppressions. Initial TypeScript check caught an unsupported icon name; replaced it with the existing typed `grid` icon before final verification. See the final gate entry below for the rerun result.
- Existing dark badge contrast/mobile article code-block keyboard findings from the light-edition handoff remain outside this slice. No whole-magazine accessibility, full build, hosted Actions, push, PR or deployment claim.

Final gate: after using the supported icon and restarting the app from the authoritative source, full Linux UID1000 TypeScript (`tsc --noEmit --incremental false`) passed, and all four browser variants above passed again. CRLF-aware owned diff whitespace check passed. No additional unit suite was run for this layout/markup slice.
