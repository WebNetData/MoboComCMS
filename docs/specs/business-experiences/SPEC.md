# تجربهٔ خرید از کسب‌وکارها

## Outcome and inspected owners

The owner requests a section where members review purchases and treatment by external websites/businesses. Public directory `/businesses` and business profiles `/businesses/[slug]` provide search, categories, star distribution, dated experiences and helpful votes. Persian UI follows existing MoboCom/SDS tokens and protected public designs.

Existing canonical owners inspected: `reviews/server/reviews.ts`, `reviews/domain/reviews.ts`, `reviews/domain/dimensions.ts`, `content/domain/items.ts`, `content/server/registry.ts`, canonical Identity/member/Admin guards and moderation cases. ItemReview/Score/Helpful/Stat already implement reviews, dimensions, votes and summaries. At the initial audit, item types excluded businesses; the implemented registry now includes business. Existing content ratings intentionally count PENDING stars; business reputation must explicitly use APPROVED-only reviews without changing that legacy behavior.

## Architecture / data

Owner refinement: internal sellers are included, and another agent must be able to resume from durable spec/map/ledger/workstate and executed evidence. Internal `SELLER` profiles bind the existing SellerId/UserId and reuse SellerReview/order eligibility/reply owner; never copy or re-store legacy seller reviews in ItemReview. `SITE` represents MoboCom's own store and earns purchase evidence only from the member's actual paid/delivered order. `EXTERNAL` uses shared ItemReview without inferring a purchase from unrelated MoboCom transactions. Profile kind/seller/domain identities remain immutable; display fields and visibility can change through exact `businesses.manage` guard. Linking a seller does not enable the entire marketplace or change money state.

Add optional `businesses` module for external business profiles and their metadata. Extend the canonical content registry with `business`; reuse ItemReview and its original UserId, vote/moderation/stat mechanisms. No second review store, rating service, identity or notification system. Additive profile/experience metadata and representative/reply records, not changes to historical reviews or purchases. Keep both Prisma schemas and release manifest aligned.

Domain identifies a website by normalized public DNS hostname; www/trailing-dot/case aliases converge. No website fetching, automatic document upload or scraping. Slug is stable and independent of future display-name edits. User suggestions wait for approval and duplicate domains converge on one profile. Existing CRM Contact is not the reviewer identity.

## Actors / admission

- Visitor: approved visible profiles, approved reviews, public rating breakdown and business search.
- Signed-in active member: submit/suggest a business, write/update their own experience, helpful vote, report through existing reporting owner; canonical GLOBAL restrictions and module availability apply.
- Existing `reviews.moderate` remains for its original items and cannot moderate business experiences. Business profiles, experiences, suggestions and representative decisions require current `businesses.manage`; Magazine/Store permissions do not substitute.
- New namespaced `businesses.manage`: profile/category/suggestion and representative administration, connected to section managers/Control Plane; exact current actor/module and strict audit at mutation commit.
- Business representative: reply only for the explicitly verified assigned business. Domain ownership is a reviewed claim, never granted because a user types an email/domain. Cannot hide, delete, edit or approve customer reviews.

## Review / evidence policies

One current review per member/business uses ItemReview's existing unique key. Experiences include star rating, meaningful text, optional date and the canonical business dimensions (quality, support, delivery, value). Edits re-enter review when applicable. Rejected/pending experiences never affect public business scores. Calculate plain disclosed averages/distribution; do not invent a Trustpilot-branded TrustScore or imply certification.

Self-reported purchases have no verified-purchase badge. Private proof uses authenticated delivery and independently reviewed evidence; no public receipt, order number, address or contact information. Automatic verified badge backfill must not infer an external purchase from unrelated MoboCom wallet/orders. Only an explicit valid reviewed fact may supply a badge. Report handling does not automatically delete negative reviews.

### Reports and private purchase proof slice — 2026-10-15

- Audit: CommunityReport is the current post/comment reporting store, not a generic target API. Extend it with explicit business/ItemReview/SellerReview bindings; keep its existing community queue/commands limited to original targets. Business commands alone validate review visibility/source and exact current businesses.manage authority. Reporting never changes review visibility by itself. Duplicate OPEN reports by one member converge; a manager dismisses/resolves with a private reason and can explicitly hide the unchanged reported review through its existing owner. Stale content refuses a hide, preserving an author's later edit. Strict audit and expected-state writes are atomic.
- Extract the existing support private-image persistence into a shared files primitive. Preserve ticket behavior. One proof image (PNG/JPEG/WebP, magic-checked, at most5MiB) is streamed through bounded shared multipart, stored outside public with random filename/exclusive0600 creation, and served only to its author or current businesses.manage staff with private/no-store/nosniff/sandbox headers. Never send uploads to cloud analysis. Ask members to conceal addresses/payment/contact details before submitting.
- BusinessPurchaseProof is evidence workflow metadata, not another review/media catalog. Only the owner of an existing EXTERNAL ItemReview may submit. Keep immutable file metadata and a digest of rating/body/date/dimensions. At most one PENDING proof per review. A different current manager must acknowledge actual review, leave a private decision reason and approve/reject using status claims/strict audit. Approval refuses changed content. Public queries expose only a matching approved-evidence boolean; files, notes, owner/reviewer IDs and paths never become public metadata. Label: «مدرک خرید بررسی‌شده», distinct from a MoboCom recorded purchase. Real edits invalidate the fact; identical retries and representative replies preserve it. Owner withdrawal removes the badge and denies future file reads. Independent staff may revoke approval.
- Existing Admin Control Plane owns allow-reports and allow-purchase-proofs switches; disabled intake hides controls/refuses direct writes, but authorized historical review/withdrawal remain available. A disabled businesses/reviews module denies all associated routes and preserves data.
- UI: existing profile review actions, private activity history and searchable/paginated business Admin, semantic tokens, clear pending/error/decision states, keyboard/native disclosure, Persian RTL and1440 light/dark/390. No dead buttons or automatic verification claims.
- Additive PostgreSQL migration, both Prisma schemas, unreleased manifest; preserve old reports/reviews/orders/files. Connected checks: scripts/business-trust.connected.cjs and scripts/business-trust-migration.connected.cjs; deliberate wrong-authority, public-file and digest-bypass faults must fail. Existing engagement/editor/support tests, schema/type/architecture/security, actual browser multi-actor/disabled/stale-content tests and scoped Doctor/axe provide acceptance. No hosted Actions per edit.

## Control Plane / disabled behavior

Use existing module settings for suggestion availability and moderation policy, validated and audited; default moderated suggestions/reviews. Claim/reply management belongs to verified representative records. Register module routes, maintenance section, permission and Admin navigation through existing registries. Disabled module preserves data and returns404 on its public/API capabilities; Core and existing reviews continue functioning.

## Implementation slices

1. Domain normalization and invariants; additive profile schema/migration; current authorized Admin profile commands; bounded directory/profile registry; reuse existing review writes/reads with business-specific approval aggregation and no false badges; public pages and existing Admin moderation; real PostgreSQL/HTTP/browser evidence.
2. Member suggestions and reports via canonical owners; explicit reviewed representative claims and replies; private proof/reviewed badge path; moderation lifecycle integration and contention tests.

Profile/review/reply commands use `/api/businesses`; current `businesses.manage` moderation/profile commands use `/api/admin/businesses`. These call canonical Reviews/Marketplace owners, rather than adding another review store. Helpful votes retain `/api/engage/review/helpful`. Generic review creation/moderation refuses business targets, keeping the business purchase/representative/permission policy inside its owner. Directory pages are bounded to20 and reviews to10; all filters are reflected in the URL. Existing content/API/URLs remain compatible. Load contracts workflow before exposing new APIs. Do not publish incomplete claims/evidence controls or advertise an unimplemented capability.

## Acceptance

Domain tests: URL credentials/schemes/IP/local hosts/invalid DNS refused, IDN normalization, alias convergence and no network calls. Connected `scripts/business-experiences.connected.cjs`: real PostgreSQL approval/hidden profiles, duplicate domains, same-member review concurrency, APPROVED-only scores, no external verified badge, current actor/module/permission, strict audit rollback and unchanged legacy reviews. Register relevant scenarios in the existing PG runner. Deliberately break approval, authorization and domain uniqueness and observe failures, then restore.

Browser: actual business search → profile → signed-in review → pending state → authorized moderation → public review/average; visitor forbidden writes, representative isolation and private proof invisibility. Check1440 light/dark,390 RTL/LTR/mobile, keyboard/axe and affected React Doctor. Execute relevant check/build/schema/migration gates; only claim checks actually run. Default optional enablement is an explicit tested rollout, not a silent new public section.

## Implemented continuation — 2026-10-15

BusinessRequest (SUGGESTION/CLAIM) is additive metadata/intake, not another review store. Member requests are bounded to five pending per account and thirty writes/hour; pending normalized-domain duplicates are refused at the database boundary. Suggestions publish only on an explicit staff decision with a stable slug; uniqueness preserves one domain/profile. Claims require independent staff verification and acknowledgment, active requester, a published unrepresented external profile, and expected-state assignment. Self-approval is forbidden. Decisions and strict audit commit together; request replay conflicts. Private `/businesses/activity` shows that member’s latest fifty requests/results. No private proof controls or purchase assertions are introduced.

Existing Admin Control Plane settings `allow-suggestions` and `allow-claims` default true, are checked fresh inside writes, and suppress unavailable public intake. Review moderation retains its existing setting. Admin lists/search/page links cover the whole profile set; pending ItemReview and SellerReview each page separately in the same owner view (25 each), without merging their id spaces. Business requests page25; profiles page20; public reviews remain10. Direct `?edit=id` resolves independently of the current page. The moderation overview includes pending request counts and links to the owner.

Public compositions use MoboCom semantic tokens: illustrated directory hero, discovery principles, cards, transparency FAQ, reputation/dimension panels, review details, existing rating meter, progressive request forms, and private results. Optional per-dimension scores now round-trip through the original Reviews owner; clearing a score intentionally updates/reviews that experience. Representative status means reply authority, not product certification. Existing canonical `/dashboard/reviews` remains the member’s review history.

Reports, private reviewed receipts/badges and moderation work leases for requests remain explicit future slices; do not advertise them as implemented or build parallel shared services. Executed evidence and remaining checks are maintained in the handoff.
