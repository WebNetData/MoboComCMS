# Organized media, variant profit, publish choice and full AI fields — 2026-11-10

Branch `feat/store-media-publish-ai-2026-11-10` from main `a56b5a2a`. Four owner requests, one commit each.
Owner merges/deploys.

## 1. Pictures filed under their item (Media)

- `downloads/domain/organization.ts` (existing owner of organized paths) adds `shop` → `shop/product/<category>/<slug>`,
  `blog` → `blog/<category>/<slug>`, `pages` → `pages/<slug>` for images; readable role names
  (`cover.webp`, `gallery-1.webp`, `poster.webp`, `content-1.webp`…, never overwritten: `cover-2.webp`);
  `parseOrganization` keeps only known short text fields — the path is always computed on the server.
- `media/server/library/organized-image.ts` stores through the same encoder as the flat store
  (`encodeCoverImage`: signature check, EXIF, 2400px, WebP), writes with `wx` into the public file tree
  (`/files/...`), and registers the asset in the matching Library folder (`ensureOrganizationFolders`).
- `POST /api/admin/media` (staff only, creator known) uses it when the form carries `organization`; members'
  uploads, ads and marketplace keep the flat `/api/media/covers/<uuid>.webp` store. Old URLs never move.
- Editors: `CoverField` and the classic editor read the existing `OrganizationScope`; store product editor
  (category = main category nameEn → slug → name), posts/pages (`AdminCrud`), media sections (`MediaCrud`
  roles by field) and AI production pictures. Product gallery gets direct uploads (`GalleryUpload`).
- `/shop/product/...` itself is not used: `/shop/[slug]` is the store's page route, so files live at
  `/files/shop/product/...`.
- Watermark: organized images get a `files/<path>` usage key and flat cache stem; `/files` serves them
  through `watermarkedImage` like the cover route.

## 2. Profit per foreign-currency variant (Store/FX)

Additive migration `20270228120000_variant_fx_markup` (`ProductVariant.markupBps Int?`, `markupFixedMinor BigInt?`,
null = product's), unreleased. `fxProductPrices().variant(cost, own)` prices it at save and in `repriceProducts`;
values accepted only from the FX step (`variantMarkupInput`). Editor: two boxes beside each variant's cost with
the product's values as placeholders and the live price.

## 3. Draft or live chosen at save

AI production save takes `publish` (only `true` publishes): active product / published post or page; a row with
a blocking quality finding can only be a draft; audited (`published`). Store product editor states its publish
state as a radio choice; other sections already had status selects. AI operations already publish only when asked.

## 4. AI fills every field

Store product autofill: SKU, kind, price/FX cost, list price, stock (source only), every category specification
(`spec<i>`), priced variants with variant attributes (`a<i>`), English description. Media sections: date-time,
picklist/chips, system requirements; games: requirements and play times. AI production products: model's SKU,
category-checked specifications (batch's fixed values win), priced variants with free SKUs, FAQs, SEO — shown in
the review; unfit parts are dropped instead of failing the save. Publish decision, access and media stay human.

## Evidence (local)

- `content-controls` 98 → new organization cases; `fx` 13; `ai` 105; full `tsc` clean; both schemas validate;
  `release-migrations check` OK.
- API: organized upload → `/files/shop/product/Virtual/telegram-premium/cover.webp`, second → `cover-2.webp`,
  Library folders shop › product › Virtual › telegram-premium; `?w=320` served; flat upload unchanged.
- FX product at USD 264,200: variant 50% → 3,963,000; cost 20 + fixed 5,000 → 6,346,000 (DB and editor).
- Browser: variant profit boxes and prices, gallery upload to `gallery-1.webp`, publish radio desktop/phone,
  no overflow or page errors. Test rows, files and folders removed.
- Not run: live watermark on an organized image, a real AI production run with product fields, connected suites.

## Continuation — every section (2026-11-10, branch `feat/store-publish-pricing-media-2026-11-10`)

Owner asked for the four rules "in every section". Survey of current main: draft/live is already chosen at save in
every editor (media sections, posts/pages, games, prompts, businesses, products); per-variant profit is Store-only by
nature. Remaining gaps were filled:

- **Media.** `FileUpload` (shared file button) now files a JPG/PNG/WebP picture of ≤15 MB through
  `POST /api/admin/media` with the surrounding `OrganizationScope` and a role; no scope, other files, larger files or a
  403 keep the old chunked upload. Scopes added: game editor (`download/Game/<first genre>/<English name>/images`,
  `poster.webp` / `backdrop.webp`, also its rich editor and links), music artist (`avatar` / `cover` under
  `download/music/<artist>/image`), cinema person (`download/cinema/images/<actors|director>/<name>/avatar.webp`;
  director only when every credit is directing) and celebrity (new `celebrities/<slug>` root: address, else name).
  `celebrities` is added to the organized-path validator, the watermark key and the `/files` watermark branch.
- **AI fields.** `AiAutofill` added to the cinema person (name, bio), music artist (name, nameEn, bio), celebrity
  (name, nameEn, bio, every switched-on profile field as `fact<i>`; the slug follows the English name unless typed)
  and business editor (name, slug while new, website for outside businesses, field, description ≤2000).
  `AUTOFILL_SECTIONS` gains `cinema-people`, `celebrities`, `businesses`; `content.autofill` accepts `businesses.manage`.
  Not offered: brands, studios, franchises and store settings (taxonomy/configuration, not content items).

Evidence (local, Linux container): `content-controls` 99/99 and `ai-autofill` (103 together) pass; full `tsc` clean;
`source`, `security`, `audit`, `extensions` checks pass. `arch:check` fails on `src/shared/site/section-names.ts`,
identical on plain `origin/main` c7dec8e7 (not this branch). Browser (separate dev container on 3100, owner's DB, no
owner preview change; `.mobocom/claude-tools/pw-item-media.cjs`): game poster/backdrop at
`/files/download/Game/Uncategorized/Test Game …/images/{poster,backdrop}.webp` served 200; celebrity, person and artist
photos at the paths above; mocked AI answers fill the profile and business forms (no model call); celebrity and artist
editors 390px without horizontal overflow; no page errors. 13 test Library rows and 19 empty test folders removed;
no profile/game/business was saved. Not run: a real AI model call, live watermark on an organized photo, Doctor.
