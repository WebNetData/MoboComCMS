# Staff moderation overview

## Audited evidence / scope
The capability map recorded that no single moderation queue exists across community, forum, reviews and article comments. Each domain already has its own queue, decision rules, permissions and admin page: held forum posts and flags (`/admin/forum`), article comments (`/admin/comments`), content reviews (`/admin/reviews`), product reviews and questions (`/admin/product-feedback`), community reports (`/admin/community/reports`), copyright reports (`/admin/copyright`). A moderator had to open six pages to learn whether anything was waiting, and nothing showed how long the oldest item had waited.

## Slice: one read-only overview
Outcome: `/admin/moderation` lists every source with its number of waiting items, the wait of the oldest one and up to five oldest items (short plain excerpt, author, what it is about, time), longest wait first. Sources with nothing waiting share one compact card. Every row leads to the owning page.

Ownership: no second moderation system. Each owner module exports `waitingForModeration(take)` next to its existing admin code and reads only its own tables; `src/modules/moderation` holds the catalogue of sources (module, permissions, labels, owning page) and composes the readers. Nothing is decided, changed or stored by the overview.

Actors and access: staff only. A source is shown when its module is on and the staff member holds one of the permissions the owning admin API already asks for; the unrestricted administrator sees all. A module that is not shown is not read. The menu item appears for anyone who can moderate at least one source; the API answers 403 when no source is visible.

Rules: "waiting" is what each owner already treats as undecided (forum post `PENDING`, flag `PENDING`, comment `PENDING`, review `PENDING`, product review and question `PENDING`, community report `OPEN`, copyright report `NEW` or `REVIEWING`). Excerpts are plain text of at most 160 characters. A source that cannot be read is named as failed and does not hide the others. The wait is graded: under a day, one to three days, longer.

Acceptance: `scripts/moderation-queue.test.cjs` (catalogue against module manifests and admin paths, visibility by module state and permission, ordering and grading, composition with a failing owner, only visible modules read, menu wiring); `scripts/moderation-queue.connected.cjs` in `npm run test:pg` (real rows in all eight tables: counts, oldest first, limit, decided items left out, excerpts); browser check of the page at desktop and phone width.

## Not included
Decisions from the overview, bulk actions, assignment, one case lifecycle across domains, counts in the admin menu, and notifications to staff about long waits.
