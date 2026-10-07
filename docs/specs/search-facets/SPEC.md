# Search facets and one reading of ratings

Owners: `search` (facets), `reviews` (the rating reader). No new table, no index change.

## Rules
- Facets: `rated` 3 or 4 (least average rating out of 5), `access` free or members, `since` week, month or year. Anything else is no facet.
- A facet only removes results. Relevance, the popularity tie-break and the bounded scan stay as they are; an item nobody rated never passes a rating facet.
- Access is decided by the item as it is now (the content registry), with the index used to narrow the scan: an item that has just become members-only is never shown as free.
- The counts by kind and the total follow the facets. A page cursor is bound to the facets it was made under; with other facets the list starts again and says so. Autocomplete ignores facets.
- Each result shows the members' rating and how many rated it.
- Ratings come from `ratingsOfItems`: shared item reviews from `ItemStat` (when the reviews module is on), shop products from their approved product reviews. Read only.

## Acceptance
`scripts/search-facets.connected.cjs` in `npm run test:pg`. Twelve deliberate breaks fail it.

## Not included
Facets by one review dimension, ordering by rating or date, facet counts shown before choosing, a measured run at scale with the rating facet.
