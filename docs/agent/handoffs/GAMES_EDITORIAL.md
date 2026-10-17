# Games latest articles — 2026-10-17

Continue `.mobocom/autonomous-foundation`, branch `fix/games-latest-articles-2026-10-17`, based on `5baa3fa3` (Cinema PR194 was still open when this slice began). Keep this slice separate; resolve PR194's merge state before publication. Preserve owner `.serena/` / `public/demo/` work and the older root checkout.

## Existing ownership and changes

- `/games` → existing `gamesHome().news` → `PostsBlock` in `src/components/games/GamePortal.tsx`. No query, API, permission, schema, dependency, URL or production-data changes. Admin `games.portal.v1` still controls news rail/keywords. Its existing fallback to other published journal articles when gaming matches are scarce remains.
- The old four-card row followed by a full-width image is now one featured story beside a two-column card grid and quick-read sidebar. Each existing new/popular tab has its own lead/supporting stories. Empty input hides the block; one article renders and missing cover/category has presentation fallbacks (source-inspected states, not live fixture claims).
- `src/app/games-posts.css` owns scoped styles/breakpoints and replaces the competing old block in `games-portal.css`; imported next to that file in `layout.tsx`. Existing Games dark stage/purple-red tokens, font and wide container remain in both global themes. Other rails, Magazine and header/footer are preserved.
- Bounded images/lazy loading/dimensions, category/date/views, clamped text, readable lead overlay, hover/focus and reduced-motion support. Supporting images cap at200px. Tablet/sidebar stacking and mobile two-column cards preserve links.
- Existing shared `TabSwitch` gains an optional label and roving focus with direction-aware arrows/Home/End. It retains server-rendered panels, existing classes/caller contracts and default selection; no second primitive or client fetch.

## Executed checks

- Real localhost3000 Playwright: dark/light global themes ×1920/1440/1024/768/390/320 (12 views), loaded covers/no section or page overflow; new/popular changes the lead; actual article navigation; RTL arrows/Home/End/focus/selection passed; runtime errors empty. Games intentionally retains its protected dark stage under either global theme.
- Scoped axe:0 violations at1440/390 in both themes. Initial selected-tab contrast failure was fixed with a darker shade of the same purple token; the full flow passed again. Browser used reduced motion; normal-motion hover and reduced-motion CSS reviewed. Representative captures inspected; Persian browser locale removed an unrelated translation-suggestion overlay from final captures.
- One content sample at1440: section height1028→804px; final lead569px at1440 and587px at1920, beside cards. This is layout evidence, not a performance benchmark.
- 20 existing Games/navigation units and full TypeScript passed in isolated Linux UID1000/no-.env/no-DB/no-Redis. Architecture/source1961/security passed. React Doctor on both components and changed-lines comparison:0 errors/0 warnings. Existing one-rule Semgrep on both components:0 findings. No fresh production build/hosted Actions.
- Disposable PostgreSQL invoked actual `gamesHome` with owned published/draft/future/no-cover fixtures: projection/order/popular ordering, exclusion rules, unchanged source rows and Admin rail disable passed. Fixtures/settings cleaned/restored. Initial runner bypassed canonical Settings writes and saw cached values; using `saveGamesSettings`, as Admin does, passed. No product cache change was needed.

Evidence remains local: root `.mobocom/games-news-evidence`, `games-news-doctor*`; isolated `/tmp/games-news-units.log`, `games-news-types.log`; ignored helpers under `.mobocom`. No existing Storybook stories were found; actual browser checks are the visual evidence. Local validation is not production certification. PRs target main; owner merges/deploys.
