# Store variant picker

Goal: Keep option availability, selection and accessible labels consistent when a product has several variant axes.
Owner: `store` domain owns the pure selection rule; the existing BuyBox renders it.
Risk: R2 (customer-facing variant selection, no schema or checkout contract change).

Inputs / outputs:
- Active product variants with attributes and current purchase limits.
- Selecting an option preserves other selected attributes when that combination exists; otherwise it chooses an available matching variant and explains that other options change.

Invariants:
- A contextual sold-out combination remains selectable for its stock alert.
- Price, cart and checkout continue to use the selected variant ID.
- Existing MoboCom store tokens and dark/light styles remain in use.

Allowed scope: Existing store domain rule, BuyBox option rendering, scoped Store styling and focused tests.
Forbidden drift: Inventory arithmetic, pricing, checkout, product schema, broad storefront restyling.
Failure / race cases: Missing combination returns no selection; a sold-out contextual combination is not labeled in stock because another size has stock.
Proof required: Pure selection test, type/source/architecture/security checks, local browser product interaction with dark and mobile visual inspection, PostgreSQL build.
