# Search continuation

## Evidence and ownership
The canonical Search module counts every currently visible match but retains only the best 1,000 candidates. Numeric pagination stops at 50 pages of 20. Keep this fast bounded window and extend the existing `/search` and `/api/search` surfaces; no new index, permissions or identity.

## Outcome and contract
Guests and members can follow next/previous links past page 50. Optional `cursor` takes precedence over numeric `page`. Add `totalPages`, `nextCursor`, `previousCursor`, `cursorReset` to the existing response. Without cursor, all legacy fields and the numeric 50-page clamp keep their meaning. Cursor requests use actual page numbers and total page count.

Cursors carry a precise ranking boundary (unrounded score, publication time, popularity, index ID), direction and page label. Bind to normalized query, selected type and index rebuild epoch. A cursor is navigation state, not authentication or a snapshot. Content edits can move results between pages; source visibility is rechecked on every request. Invalid, cross-query/type or rebuilt-index cursors reset to page one and set `cursorReset`. A cursor page emptied by deletions also resets: it performs one fresh first-page scan if matches remain, instead of reporting a false empty query. Links are opaque to clients; query/type changes discard them. A full rebuild can invalidate a browsing session; the UI explains the reset.

## Invariants and failure paths
Ranking remains score/date/popularity/ID. Cursor scans retain at most 20 candidates, numeric scans at most 1,000, batches stay 500. Counts include all current visible matches regardless of boundary. Autocomplete stays sampled and never issues cursors. Disabled Search stays empty/guarded. Cursors are size/type/range checked; manipulation cannot reveal hidden sources or enlarge candidate memory. Existing rate limiting and private no-store responses remain. No database migration, new setting, event or permission is needed: page size is existing protocol behavior, not a new business configuration.

## UI and verification
Keep the existing RTL search layout and pager. Numeric links remain through page 50; then use cursors in both directions. Disable pager prefetch to avoid speculative full-index scans. A browser audit found the section shell's `md-search` class collided with the header search form; name the main section `md-search-results`, preserve other section classes, and let the form input shrink on mobile. Put reset feedback above results. Verify tie boundaries, forward/back traversal, filtered facets, hidden sources, malformed/stale/query/type mismatch reset, legacy clamp and bounded selection. Run focused Node tests, TypeScript, architecture checks, PostgreSQL HTTP integration and the existing full site suite. A permanent Chromium regression covers reset feedback and overflow at 360/390/1440px. No claim of snapshot consistency or full production deployment.
