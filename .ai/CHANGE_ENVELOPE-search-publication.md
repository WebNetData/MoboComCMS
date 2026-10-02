# Change Envelope: Search Publication Guard

Goal: Keep stale indexed documents for unpublished or disabled items out of public search.
Owner: `search` read service, using the existing `content` public item registry.
Risk: R3, public visibility and indexed data freshness.

Inputs / outputs:
- Input: at most 400 indexed candidates from a search query.
- Output: hits, type counts and suggestions for currently public items only.

Invariants:
- Search indexing remains asynchronous and its stored rows remain compatible.
- Current publication state governs every public result, facet and suggestion.
- Public URLs and item ownership remain path-based and unchanged.

Allowed scope:
- Bounded candidate verification and response cache policy; connected stale-index regression test.

Forbidden drift:
- No new search provider or change to index schema/ranking semantics.

Failure / race cases:
- A document can remain after product approval is revoked; it must not appear. Public results are not cached by the browser after publication changes.

Proof required:
- Type/source/architecture/security checks, connected stale-index test and PostgreSQL build.
