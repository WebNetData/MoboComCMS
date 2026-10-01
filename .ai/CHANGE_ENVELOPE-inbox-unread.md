# Inbox unread view

Goal: Let members browse only unread notifications, including older pages, and keep the global unread badges current after marking items read.
Owner: `notifications` inbox route, `NotificationCenter`, and the shared unread badge.
Risk: R2 (authenticated API and client behavior; no schema change).

Inputs / outputs:
- `GET /api/inbox?unread=1` returns only owner-scoped unread rows with the existing cursor contract.
- `PATCH /api/inbox` returns the current unread count after an owner-scoped update.
- Client tabs select all or unread; local change event refreshes visible global badges.

Invariants:
- In-app events and dedupe keys remain intact; no deletion or re-delivery.
- Every notification query/update stays scoped to the authenticated user.
- Paginated results remain bounded to 30 and private responses are not cached.

Allowed scope: Existing inbox endpoint and consumers, focused browser check.
Forbidden drift: New notification table, provider changes, visual theme replacement.
Failure / race cases: Reject invalid cursor; ignore stale filter fetches; failed mark-read leaves the current list intact.
Proof required: type/source/architecture/security checks, browser pagination/read/badge test on port 3000, dark visual inspection, PostgreSQL build.
