# Livechat placement — 2026-10-15

## Implemented scope

Continue from `fix/queue-selects-chat` in `.mobocom/autonomous-foundation`. The owner's queue/select styling is separate pending work; preserve it. Existing Livechat/Settings/Identity/Admin/plugin owners are retained.

In `/admin/chat` → «تنظیمات دستیار و ساعات کاری», the owner chooses all pages or selected sections, with a «فقط فروشگاه» shortcut. Multiple sections are supported and at least one is required in selected mode. Legacy settings without `places` retain all-page behavior. Store includes products/vendor shop/cart/checkout/payment/invoice/tracking URLs. All matching is at exact segment boundaries; query/hash/trailing slash are handled. Existing alias-aware `usePathname` resolves section aliases first.

Canonical `livechat.v1` stores the selection. `saveChatSettings` composes existing `updateJsonSetting`: fresh transactional merge/claim/retry preserves omitted placement and unknown fields and concurrent independent updates. Invalid payloads return400 instead of resetting settings; existing Admin permissions and module guards remain. No schema migration, parallel settings registry or new auth hierarchy.

`readJsonSetting` now accepts an optional current storage reader; existing callers retain caching. Chat supplies its canonical database reader so a just-saved placement does not come from a stale route cache and remain wrong until another navigation. This was reproduced in the actual browser before correction.

The public visitor projection includes places. The client uses the public extension SDK facade `src/extensions/sdk/livechat.ts` to call canonical `chatShownOn`; plugins must not directly import private module internals. The widget hides and its SSE/fallback polling stops outside selected sections. Chat records are retained. Placement controls visibility, not an alternate authorization scheme or closure of historical chat APIs. Explicitly disabling the module remains the global off control.

Settings loading aborts stale initial requests so a late response cannot overwrite a new selection; errors are visible rather than a permanent loading skeleton.

## Executed checks

- Linux UID1000:7 livechat unit tests passed, including path boundaries/store/multiple/all/home and legacy settings.
- Registered `scripts/livechat-placement.connected.cjs`: actual PostgreSQL, canonical Settings/application/visitor functions, selection persistence, omitted fields, unknown-field retention and concurrent independent patches passed. Original settings restored in finally.
- An in-memory omitted-field regression was detected by assertions; running source files were never mutated. Original native checks then passed again. Evidence: root `.mobocom/chat-placement-{unit,postgres,architecture,probe}.log`.
- TypeScript passed with `--noEmit --incremental false`. Source syntax/import check passed1854 files;3 existing Settings lease tests also passed. Architecture initially rejected a private plugin import; fixed via the explicit SDK facade and the gate then passed.
- Actual local browser test: store-only shown on products and hidden on music/blog; selected store+music shown correctly, games excluded; reload persistence and all-page compatibility;1440 light/dark and390 dark; scoped axe (actual local axe-core supplied), screenshots inspected. Admin guest403 and invalid-payload400 are included in final browser scenario. Runner captures/restores original settings and removes its owned actor/role fixtures. No test chat messages or customer records are created.
- Changed-scope React Doctor passed with telemetry/supply-chain scanning off: `.mobocom/chat-placement-doctor-changed.json`. Full-file review retains three pre-existing blocking findings plus warnings in unrelated existing logic; no clean full-file score is claimed.

Earlier browser attempts exposed stale initial form fetches and stale placement cache; fixed and final scenario passed. One hot-reload run also reported a products-page hydration mismatch outside the chat subtree; a subsequent steady-state run passed without page errors. No claim of a full Store audit or production-build verification is made.

Browser evidence: `.mobocom/chat-placement-browser.log` and `.mobocom/chat-placement-evidence/`; script `scripts/livechat-placement.browser.cjs`. Host runner/fixture preparation stays under root ignored `.mobocom/`. The current site remains on localhost3000; original configuration is restored after tests so the owner chooses the desired sections. No production build, hosted Actions, PR or deployment is claimed for this batch.
