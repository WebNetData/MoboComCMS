# Change Envelope: Review Pagination

Goal: Let readers reach approved reviews beyond the first ten on shared detail pages.
Owner: `reviews` read API and shared `engage` presentation.
Risk: R2, bounded UI and existing API contract.

Inputs / outputs:
- Input: an item's approved first page and total from the server render.
- Output: additional moderated review pages after a user action.

Invariants:
- Reviews remain publication-gated and approved-only.
- No automatic unbounded fetching. Existing dark design tokens remain in use.

Allowed scope:
- Shared review list component and its existing stylesheet.

Forbidden drift:
- No change to moderation, rating arithmetic or product-specific feedback.

Failure / race cases:
- Duplicate IDs are omitted if review order shifts. Fetch errors are visible and retryable.

Proof required:
- Type/source/architecture checks, production build and browser interaction when the local server responds.
