# Current remaining work — 2026-10-26

Follow-up: item 1 is **resolved locally** on
`fix/pwa-prompt-placement-2026-10-26`; see the
[implementation, actual checks and next slice](../handoffs/PWA_PROMPT_PLACEMENT.md).
The observations below describe the pre-fix audit, not current open defects.

Item 2 is also resolved locally in the subsequent
[canonical body/editor implementation](../handoffs/JOURNAL_BLOCK_PROPOSALS.md).
Items 3–4 are the remaining bounded follow-ups.

Source: `fix/journal-review-reliability-2026-10-26`, commit `c05311aa`, plus
the owner's six pending CSS files. The two prior Journal defects are fixed;
continue their [recorded implementation](../handoffs/JOURNAL_REVIEW_RELIABILITY.md).
This pass reviews current follow-ups, not every capability in the old roadmap.

## New actual browser evidence

Nine public routes: `/`, `/blog`, `/music`, `/cinema`, `/games`, `/software`,
`/products`, `/forum`, `/forum/search`; each at1440/390 and light/dark.
All36 views of the current **mobocom** theme returned200, reached network idle,
matched the requested theme and had no pageerror, horizontal overflow or axe
WCAG2A/AA/2.1AA violations. There were48 rendered `.btn-primary` instances.
Representative store/film/forum screenshots were visually inspected. This does
not claim Clean/other themes, authenticated views or all interaction states.

Four additional state probes visited home → magazine → store, triggering the
real third-visit push invitation. In both themes and widths, it overlapped the
online-support button; elementFromPoint confirmed Livechat on top. Intersection
was8270px² at1440 and2496px² at390. After pressing only «بعداً», axe still found
zero violations. No notification permission was requested, subscription/message
sent, Admin setting changed or user account created.

Private base evidence: `.mobocom/remaining-audit-20261026/results.json` and
screenshots; helpers `.mobocom/remaining-{audit-20261026,floating-probe}.cjs`.
The floating helper was rerun after implementation; `floating-results.json`
now records zero overlap rather than the original reproduction values above.

## Current bounded queue

| Order | Status / next work | Current evidence | Acceptance / reuse |
| --- | --- | --- | --- |
| 1 | RESOLVED locally: coordinate push/install invitations with online support | Original four probes found the same-corner collision; the existing PWA owner now measures visible widget rectangles and yields space | [Implementation and bounded verification](../handoffs/PWA_PROMPT_PLACEMENT.md). Four maintained browser cases passed; tray/player tests are layout fixtures, other themes/real mobile OS remain unassessed. |
| 2 | RESOLVED locally: propose the canonical block body of a published article | Existing PostEditProposal and Editor now share canonical validation, exact base/proposal tokens, metadata/body preservation and manager-only full comparison | [Source, native/browser evidence and limits](../handoffs/JOURNAL_BLOCK_PROPOSALS.md). Apply/history/intents remain with existing owners; no generated HTML source or second workflow. |
| 3 | PARTIAL: responsive derivatives for public Library images served under `/files/` | `src/shared/media/image.ts` sizes only owned cover/profile API addresses; other addresses remain unchanged. The prior public-quality handoff records the Cinema limitation; no fresh byte benchmark in this pass | Reuse existing Media/Downloads image ownership, cache and authorization. Preserve originals/URLs; bounded allowed sizes, private-file exclusion, actual image/network measurements. Do not promise universal video/file optimization. |
| 4 | UNVERIFIED on deployment data: search/load and operational release checks | Current search evidence is245 local documents/20 recorded local queries, not production traffic. No named destination/provider execution was supplied to this pass | Keep existing search cap/index and release/backup/Monitoring owners. Measure an isolated deployment-sized copy; verify the destination's configured payment/message providers and restore/rollback without claiming local tests certify that server. |

The current changes also need an owner-requested consolidated PR/merge. The six
CSS files remain untouched/uncommitted; the36-view pass validates the active
theme's sampled surfaces, not every installed theme or the floating overlap.

No product source was changed, full check/build repeated, hosted workflow run,
PR opened or production deployment performed by this pass. No new backend defect
was established here; unassessed areas remain unverified rather than missing.
