# Public forum topics in recent views

Goal: Record an authenticated visit to a publicly listed forum topic in the shared private recent-history feed.
Owner: Forum renders the topic; `content` owns the existing recent-view tracker, public registry and private history.
Risk: R2 (cross-domain page composition; no schema or API change).

Inputs / outputs: Visible, listed topic page and signed-in viewer; one deduplicated recent-view record after a real visit.
Invariants: Pending, hidden, unlisted or guest-restricted topics never enter recent history; server-side registry remains the authority.
Allowed scope: Existing forum topic page and focused browser verification.
Forbidden drift: Forum permissions, topic reads, registry visibility rules, new history store.
Failure cases: A staff member opens a restricted topic; a topic becomes hidden before the delayed tracker call.
Proof required: Type/source/architecture/security checks and local authenticated browser test for public and restricted topics.
