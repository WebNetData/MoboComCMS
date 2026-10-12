# تجربهٔ خرید از کسب‌وکارها

## Outcome and inspected owners

The owner requests a section where members review purchases and treatment by external websites/businesses. Public directory `/businesses` and business profiles `/businesses/[slug]` provide search, categories, star distribution, dated experiences and helpful votes. Persian UI follows existing MoboCom/SDS tokens and protected public designs.

Existing canonical owners inspected: `reviews/server/reviews.ts`, `reviews/domain/reviews.ts`, `reviews/domain/dimensions.ts`, `content/domain/items.ts`, `content/server/registry.ts`, canonical Identity/member/Admin guards and moderation cases. ItemReview/Score/Helpful/Stat already implement reviews, dimensions, votes and summaries. Existing types currently exclude businesses. Existing content ratings intentionally count PENDING stars; business reputation must explicitly use APPROVED-only reviews without changing that legacy behavior.

## Architecture / data

Owner refinement: internal sellers are included, and another agent must be able to resume from durable spec/map/ledger/workstate and executed evidence. Internal `SELLER` profiles bind the existing SellerId/UserId and reuse SellerReview/order eligibility/reply owner; never copy or re-store legacy seller reviews in ItemReview. `SITE` represents MoboCom's own store and earns purchase evidence only from the member's actual paid/delivered order. `EXTERNAL` uses shared ItemReview without inferring a purchase from unrelated MoboCom transactions. Profile kind/seller/domain identities remain immutable; display fields and visibility can change through exact `businesses.manage` guard. Linking a seller does not enable the entire marketplace or change money state.

Add optional `businesses` module for external business profiles and their metadata. Extend the canonical content registry with `business`; reuse ItemReview and its original UserId, vote/moderation/stat mechanisms. No second review store, rating service, identity or notification system. Additive profile/experience metadata and representative/reply records, not changes to historical reviews or purchases. Keep both Prisma schemas and release manifest aligned.

Domain identifies a website by normalized public DNS hostname; www/trailing-dot/case aliases converge. No website fetching, automatic document upload or scraping. Slug is stable and independent of future display-name edits. User suggestions wait for approval and duplicate domains converge on one profile. Existing CRM Contact is not the reviewer identity.

## Actors / admission

- Visitor: approved visible profiles, approved reviews, public rating breakdown and business search.
- Signed-in active member: submit/suggest a business, write/update their own experience, helpful vote, report through existing reporting owner; canonical GLOBAL restrictions and module availability apply.
- Existing `reviews.moderate`: moderate ItemReview through its existing owner; cannot administer profiles merely by having Magazine or Store access.
- New namespaced `businesses.manage`: profile/category/suggestion and representative administration, connected to section managers/Control Plane; exact current actor/module and strict audit at mutation commit.
- Business representative: reply only for the explicitly verified assigned business. Domain ownership is a reviewed claim, never granted because a user types an email/domain. Cannot hide, delete, edit or approve customer reviews.

## Review / evidence policies

One current review per member/business uses ItemReview's existing unique key. Experiences include star rating, meaningful text, optional date and category-specific scores (delivery, support, value, handling of returns). Edits re-enter review when applicable. Rejected/pending experiences never affect public business scores. Calculate plain disclosed averages/distribution; do not invent a Trustpilot-branded TrustScore or imply certification.

Self-reported purchases have no verified-purchase badge. Private proof uses existing private Media/authenticated delivery and reviewed evidence; no public receipt, order number, address or contact information. Automatic verified badge backfill must not infer an external purchase from unrelated MoboCom wallet/orders. Only an explicit valid verified fact may supply a badge. Report handling does not automatically delete negative reviews.

## Control Plane / disabled behavior

Use existing module settings for suggestion availability and moderation policy, validated and audited; default moderated suggestions/reviews. Claim/reply management belongs to verified representative records. Register module routes, maintenance section, permission and Admin navigation through existing registries. Disabled module preserves data and returns404 on its public/API capabilities; Core and existing reviews continue functioning.

## Implementation slices

1. Domain normalization and invariants; additive profile schema/migration; current authorized Admin profile commands; bounded directory/profile registry; reuse existing review writes/reads with business-specific approval aggregation and no false badges; public pages and existing Admin moderation; real PostgreSQL/HTTP/browser evidence.
2. Member suggestions and reports via canonical owners; explicit reviewed representative claims and replies; private proof/reviewed badge path; moderation lifecycle integration and contention tests.

Profile/review/reply commands use `/api/businesses`; current `businesses.manage` moderation/profile commands use `/api/admin/businesses`. These call canonical Reviews/Marketplace owners, rather than adding another review store. Helpful votes retain `/api/engage/review/helpful`. Generic review creation/moderation refuses business targets, keeping the business purchase/representative/permission policy inside its owner. Directory pages are bounded to20 and reviews to10; all filters are reflected in the URL. Existing content/API/URLs remain compatible. Load contracts workflow before exposing new APIs. Do not publish incomplete claims/evidence controls or advertise an unimplemented capability.

## Acceptance

Domain tests: URL credentials/schemes/IP/local hosts/invalid DNS refused, IDN normalization, alias convergence and no network calls. Connected `scripts/business-experiences.connected.cjs`: real PostgreSQL approval/hidden profiles, duplicate domains, same-member review concurrency, APPROVED-only scores, no external verified badge, current actor/module/permission, strict audit rollback and unchanged legacy reviews. Register relevant scenarios in the existing PG runner. Deliberately break approval, authorization and domain uniqueness and observe failures, then restore.

Browser: actual business search → profile → signed-in review → pending state → authorized moderation → public review/average; visitor forbidden writes, representative isolation and private proof invisibility. Check1440 light/dark,390 RTL/LTR/mobile, keyboard/axe and affected React Doctor. Execute relevant check/build/schema/migration gates; only claim checks actually run. Default optional enablement is an explicit tested rollout, not a silent new public section.
