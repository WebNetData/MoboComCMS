# PWA invitation placement — 2026-10-26

Authoritative checkout: `.mobocom/autonomous-foundation`, branch
`fix/pwa-prompt-placement-2026-10-26`, continuing `c05311aa` and the owner's
six untouched pending CSS files. The first finding in the
[remaining-work audit](../audits/2026-10-26-remaining-work.md) is resolved locally.

## Owner and behavior

- `src/components/pwa/PwaClient.tsx` retains install/push eligibility, module
  guards, fourteen-day dismissal, permission requests and existing actions.
- Its local `usePromptPlacement.ts` measures the invitation and existing
  Livechat, translation, fallback support, comparison, music/queue and Forum
  dock elements. It yields space above horizontally intersecting visible
  widgets; no fixed assumptions about their text or height are required.
- If there is insufficient visible viewport space (including full-screen
  mobile chat), the invitation is temporarily invisible and inert. Closing
  the obstruction restores it without dismissing it or changing preferences.
- One animation frame batches geometry reads before style writes. Observers
  and viewport listeners exist only while an invitation is present and are
  disconnected on cleanup. There is no polling or new floating-widget service.
- `src/app/engage.css` retains existing SDS/MoboCom colors, typography and
  appearance, adds safe-area spacing and removes the old assumed compare height.

No new entity, permission, API, queue, dependency, migration or Admin setting.
Existing plugin/section placement settings remain authoritative. Collision
avoidance is layout correctness, not a new configurable business policy.

## Executed validation

- Docker app restarted from the current checkout; readiness returned HTTP 200
  with `database: ready`. An actual Prisma `Setting.count()` read also passed
  against connected local PostgreSQL, without changing settings/data.
- Linux UID 1000: full TypeScript check passed with `--noEmit --incremental false`;
  architecture boundaries and source syntax/import check (2094 files) passed;
  existing `site.test.cjs` + `livechat.test.cjs`: 18 passed, zero skips/failures.
- Maintained `e2e/tests/pwa-placement.spec.ts`: **4 passed in 36.7 seconds** on
  actual localhost:3000, Edge, MoboCom theme, light/dark, 1440/390, Persian RTL.
  Real third visits, support open/close, mobile defer/inert/return, language
  open/Escape, unoccluded buttons, keyboard dismissal/reload persistence and
  no horizontal overflow passed. Active and dismissed invitation axe scans
  found zero WCAG 2A/AA/2.1AA violations; no page errors or push/chat writes.
- Variable-height comparison/player elements are **layout fixtures**, not
  music playback/compare-domain evidence. An emulated install event exercised
  the actual component and dismiss action, not native OS installation. Neither
  notification permission nor a subscription/message was requested.
- Screenshots of mobile light/closed, desktop dark/chat-open and mobile
  dark/chat-open were visually inspected. Other themes and real mobile OS
  keyboard/notch behavior were not independently certified.
- React Doctor: two source files, telemetry/supply-chain off, blocking error,
  exit 0; zero errors, five existing PwaClient warnings. Reviewed unchanged
  push-key status handling/analytics effect/export and two nonmodal-dialog
  suggestions; no suppressions or unrelated behavior changes. New hook: none.
- Graphify offline source-only incremental refresh passed in 12.451 seconds;
  status current, zero semantic extraction tokens. No token-savings claim.
- Six owner CSS SHA256 values still match the pre-fix snapshot exactly.

Earlier harness attempts are not passes: typecheck ran during the restart's
source-copy phase and hit missing paths/read-only buildinfo; a subsequent type
error was corrected. The first browser fixture sent install events before
hydration; waiting for the actual client widget corrected the test. Final
checks above ran after readiness. No full production build, hosted Actions,
push, PR or deployment was performed for this slice.

Private raw reports/screenshots: `.mobocom/pwa-placement-20261026/`;
the four earlier reproduction probes were rerun with zero overlap after the fix.

To repeat the maintained browser checks, set `E2E_BASE_URL` to the local target,
`E2E_PWA_PROMPTS=1`, `E2E_AXE_PATH` to installed `axe-core/axe.min.js`, and
`PLAYWRIGHT_CHROMIUM_PATH` if using installed Edge. Run Playwright Test with
`e2e/tests/pwa-placement.spec.ts`. It requires existing web-push, translation
and store Livechat enabled; it never enables them or changes Admin settings.

## Continuation / rollback

Next: canonical block-body edit proposals through the existing Editor and
PostEditProposal owners, then public Library `/files/` image renditions and
deployment-data/provider evidence. Do not reopen the fixed Journal races.

Rollback needs only the three PWA/CSS source files from the preceding commit;
there is no data rollback. Preserve the six unrelated owner CSS files. The
owner requests publication/merges; no hosted workflow dispatch is authorized.
