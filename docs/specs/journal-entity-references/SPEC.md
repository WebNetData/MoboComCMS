# Journal entity references

## Outcome and existing behavior

Editors can attach a product to an article by its canonical content identity. Product pages show explicitly related, currently public articles before the existing automatic suggestions. A draft, scheduled article, hidden product, or disabled module never becomes public through the relationship.

Today `Post` has no entity relationship, while the product `related-posts` tab guesses from a word in the product name and otherwise shows recent articles. The shared content registry already defines `ItemRef`, canonical paths, module enablement, and public item visibility; the existing CMS post editor and `cms.posts` permission own article edits.

## Owner, actors, and flow

Journal owns an additive post-to-item reference table. For the first vertical slice, the editor links published products through the existing post form. A `cms.posts` editor searches a bounded product picker, selects an ordered set, and saves it in the same transaction as the post. Readers see linked live articles on the product's existing `related-posts` tab; existing heuristic suggestions fill remaining slots. The post article can later use the same relation for an entity rail without a second table.

## Invariants and edge paths

- Store stable `(itemType, itemId)` refs, with a unique `(postId, itemType, itemId)` key and position. Post deletion cascades links. Product deletion may leave an inert reference; editors can remove it later.
- Saving an older client payload without a relation field preserves links. An explicit empty list removes links. Existing links remain editable after a target is withdrawn or deleted; new selections must name currently public products. Reject malformed, duplicate, oversized, or unavailable new selections. A failed validation must leave the post and its links unchanged.
- Product public visibility uses the current store approval, active, storefront setting and module rules. Article visibility uses the current due-time publication rule. Disabled Journal yields an empty related-posts tab; a closed or disabled Store hides product suggestions without deleting links.
- The picker shows loading, empty, and error states. Selected refs remain visible after clearing a query. RTL and LTR labels and mobile layout follow existing dark Admin components; protected public page composition remains intact.
- No new Identity, CRM Contact, shared settings, theme logic, or global relationship system. There is no new legitimate configurable behavior in this slice. Admin Control Plane still governs module state and permissions.

## Contracts, safety, and rollout

The existing CMS post GET/POST/PATCH payloads gain an optional `itemLinks` array; old clients and response fields remain valid. The product tab keeps `{ items: [...] }` with the existing article card shape. The picker is an authenticated Admin route under `cms.posts`. No public API, URL, or event version changes. Public output never reveals hidden targets or future articles. Additive PostgreSQL migration creates an initially empty table; application rollback can ignore it. Apply the migration before deploying code. Preserve production data and take a normal backup before production migration.

## Acceptance

- Connected transaction tests cover create/update/clear, old-client preservation, invalid target rollback, and delete cascade.
- Product tab tests cover explicit link priority, automatic fill, scheduled/draft article filtering, withdrawn product rejection, and disabled Journal.
- Authenticated editor flow can search/select/persist a product; unauthenticated picker access is denied.
- Run focused tests, schema parity/validation, typecheck, architecture/security checks, production build, and CI before merge. Do not report any gate that was not run.
