# Change Envelope: Storefront Publication

Goal: Keep active but unapproved products out of every public storefront listing and facet.
Owner: `store` catalog read model, aligned with the existing public product page and `content` registry.
Risk: R3, public visibility and marketplace approval boundary.

Inputs / outputs:
- Input: product approval and active state.
- Output: public cards, category counts, brand rails and filtered listings.

Invariants:
- Public storefront reads require both `active=true` and `approval=APPROVED`.
- Approved products and existing public URLs remain available.
- Seller and admin management reads retain their own visibility contracts.

Allowed scope:
- Store catalog public read filters and focused connected regression test.

Forbidden drift:
- No change to seller approval workflow, price, inventory or product data.

Failure / race cases:
- A product with `active=true` and `approval=PENDING` remains hidden. Caller filters cannot override the base public filter.

Proof required:
- Type/source/architecture checks, connected storefront test and PostgreSQL build.
