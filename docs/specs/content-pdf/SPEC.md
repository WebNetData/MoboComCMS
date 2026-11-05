# Content PDF editions — 2026-11-05

## Outcome and envelope (R4)

Visitors download professionally paginated native Persian PDFs of content they may already read. Admin chooses a dedicated design for each section/type, including separate movie/series, and configures text/image watermarking. Preserve public page identity, URLs, original content, canonical Identity and all current audience, publication, VIP/purchase/drip, forum and maintenance guards.

Existing evidence: Billing already uses PDFKit0.20.2, embedded Vazirmatn, QR and shared visualPieces. Content owns ItemRef/cards; Media has guarded public-image reads; Settings has transactional revisions/CAS; the extension registry owns optional modules/Admin navigation. Those are reused. Billing invoices remain separate. No browser service, external rendering service, schema migration, parallel media store or alternate authorization resolver.

## Contract and sequence

`content-pdf` is a default-on optional content plugin with `content-pdf.manage`; Settings/history remains in Content's PDF owner. Eight immutable typed design presets (editorial, catalogue, cinema, series, music, gaming, technical, minimal), per-kind on/off/template, brand/footer/paper/text size, image/QR inclusion, text or local-image watermark, opacity/size/angle/position and repeated pattern. Setting changes preserve unknown metadata, require Origin and optional If-Match, audit and can restore through existing history.

Public `GET /api/content-pdf/<type:id>` returns an attachment; optional `inline=1` is a preview of the same authorized bytes. Public DTOs contain only editorial text and safe descriptive facts. No original download/stream/digital-code/provider credentials, raw JSON records or private member generations. Support registered content ItemTypes plus published custom pages/playlists and individual visible forum posts; movie/series use separate kinds. A forum topic exports its opening post, explicitly labeled, not hidden replies. Non-editorial profile items export only their public card/profile text.

Authorize before resolving rich blocks or image bytes. Use current standing, effective module state, section maintenance/audience, item audience (including album for tracks), existing paywall/VIP/rule owner, current publication and existing forum category visibility. Private/no-store responses; fresh authorization for every download and no reusable cross-user PDF cache. Limits on body/pages/images, strict rate limit and bounded concurrent generation; reject oversized exports rather than silently truncate.

Semantic content projection retains headings, paragraphs, lists, quotations, code, tables, links and supported images; scripts/forms/embeds become non-executable references. Use actual canonical block HTML and safe legacy HTML. Fonts embedded; mixed Persian/Latin via shared visual-order; selectable text, headings/bookmarks, page numbers, QR/canonical source and vector design effects. Full body pagination and watermark on every page. Unknown/interactive content retains its readable text and online reference.

UI: same public action controls, no page redesign; accessible busy/retry/error download. Admin template cards, actual sample-PDF preview, per-kind assignment and grouped branding/watermark controls in existing MoboCom tokens, RTL, both themes, 1440/390. Never execute administrator-supplied HTML/CSS/JS as a template.

## Proof and rollback

Pure normalization/projection tests; native PostgreSQL permission/publication/module/maintenance/premium/rule/parent-audience/settings-race/audit checks; actual native PDFs for every design, long mixed RTL text, tables and every-page watermark; render via Poppler and inspect PNGs and extracted text. Deliberate access bypass and missing watermark must fail regressions. Actual browser public download/Admin assignment/save/reload/denials in both themes and sizes, scoped axe and React Doctor; local project checks/build and security review. No live production deployment. Disabling the plugin or a kind removes its downloads; settings/content remain. No destructive rollback.
