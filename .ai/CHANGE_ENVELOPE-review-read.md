# Change Envelope: Public Review Reads

Goal: Show review data only for currently public items and keep rating reads bounded.
Owner: `reviews` service and HTTP route, using the existing `content` publication registry.
Risk: R3, public data access and query scaling within the R4 program.

Inputs / outputs:
- Input: public item key and optional page number.
- Output: approved review page, the viewer's review, favorite state and rating distribution.

Invariants:
- Draft, removed and disabled items expose no review data through the public API.
- Pending ratings continue to count; rejected ratings do not.
- Only approved text appears in public review lists.

Allowed scope:
- Reuse the item registry, replace unbounded row reads with grouped counts, bound page input, add regression coverage.

Forbidden drift:
- No new review table or change to product feedback ownership.

Failure / race cases:
- Invalid page input defaults to page one; huge page numbers are capped. Publication changes are checked on each API read.

Proof required:
- Focused domain test, type/source/architecture/security checks, production build, connected API test when the local server responds.
