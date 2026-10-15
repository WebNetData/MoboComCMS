# Queue, select menus and chat — owner continuation, 2026-10-15

## Current source

The owner's latest work is in `.mobocom/autonomous-foundation`, branch `fix/queue-selects-chat`, HEAD `ecc9254ef5f6e205a85add32e4e4ea69196bbca0` (merged PR184). Fetched origin/main matched that revision during this inspection. The project root is a different, older worktree at `b98b40cd` with many unrelated local changes; do not reset it, copy its sources over the active worktree, or resume from the obsolete business feature branch.

Owner's latest stated tasks: tidy the music play queue and fix the open select menus across the site. These changes currently exist as an uncommitted working diff; inspect Git before editing or staging. Preserve `.serena/` and untracked demo assets separately.

## Source evidence inspected

- `src/app/media-design.css`: queue header close-button sizing, title/count wrapping, playing equalizer, row metadata layout and artwork/VIP sizing. Existing player owner remains `src/components/media/MusicPlayer.tsx`; no replacement queue/player.
- `src/app/selects.css` (untracked): light/dark color-scheme; progressive `appearance: base-select` styling for single selects, native fallback, themed options/picker, disabled/selected states and reduced motion. Imported globally by the modified `src/app/layout.tsx`. Preserve approved section designs and native keyboard/form behavior.
- Livechat placement was initially partial at this inspection. It is now completed through the existing Settings/Admin/client owners, with the public SDK facade, fresh placement reads, safe setting merge and actual PostgreSQL/browser evidence. Continue from [CHAT_PLACEMENT](CHAT_PLACEMENT.md) for the final implementation and exact scope; queue/select styling remains separate owner work.

## Verification and next steps

PR preparation on2026-10-15: owner queue/select changes are now included after actual verification. Three `music-dashboard.test.cjs` tests passed as Linux UID1000. `scripts/queue-selects.browser.cjs` passed1440 light/dark and390 dark against the local PostgreSQL-backed app: restored queue UI/header dimensions/metadata layout/close action, actual Admin native select opening and keyboard selection. This Chromium supports base-select; no other-browser result or audio playback claim is made. An initial dimension assertion saw the queue's entrance scaling; verification uses the actual computed control dimensions. Root `.mobocom/queue-selects-browser.log` retains evidence. Chat placement and translator-overlap evidence live in their own linked handoffs. No hosted browser dispatch.

This inspection was read-only for product sources. No unit, PostgreSQL, build, browser, React Doctor or a11y checks were executed for these latest owner changes. Previous business-section evidence does not validate this batch.

Before a PR: review the current diff, verify queue interactions/close button/playing row, open selects and keyboard selection across public/account/Admin pages in light/dark/mobile and relevant browsers, and run the affected tests/Doctor/a11y under FRONTEND_QUALITY. Complete chat placement only if included in the next implementation slice. Test unknown/stored/empty placement values, public path handling and existing Admin configuration; do not add another settings owner.

Business experiences continue from their existing handoff and current merged code. PR150 is already in main (merge `b28763c6`); do not recreate its original implementation or re-open the old branch.
