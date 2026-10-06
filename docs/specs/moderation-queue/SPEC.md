# Staff moderation overview

## Audited evidence / scope
The capability map recorded that no single moderation queue exists across community, forum, reviews and article comments. Each domain already has its own queue, decision rules, permissions and admin page: held forum posts and flags (`/admin/forum`), article comments (`/admin/comments`), content reviews (`/admin/reviews`), product reviews and questions (`/admin/product-feedback`), community reports (`/admin/community/reports`), copyright reports (`/admin/copyright`). A moderator had to open six pages to learn whether anything was waiting, and nothing showed how long the oldest item had waited.

## Slice: one read-only overview
Outcome: `/admin/moderation` lists every source with its number of waiting items, the wait of the oldest one and up to five oldest items (short plain excerpt, author, what it is about, time), longest wait first. Sources with nothing waiting share one compact card. Every row leads to the owning page.

Ownership: no second moderation system. Each owner module exports `waitingForModeration(take)` next to its existing admin code and reads only its own tables; `src/modules/moderation` holds the catalogue of sources (module, permissions, labels, owning page) and composes the readers. Nothing is decided, changed or stored by the overview.

Actors and access: staff only. A source is shown when its module is on and the staff member holds one of the permissions the owning admin API already asks for; the unrestricted administrator sees all. A module that is not shown is not read. The menu item appears for anyone who can moderate at least one source; the API answers 403 when no source is visible.

Rules: "waiting" is what each owner already treats as undecided (forum post `PENDING`, flag `PENDING`, comment `PENDING`, review `PENDING`, product review and question `PENDING`, community report `OPEN`, copyright report `NEW` or `REVIEWING`). Excerpts are plain text of at most 160 characters. A source that cannot be read is named as failed and does not hide the others. The wait is graded: under a day, one to three days, longer.

Acceptance: `scripts/moderation-queue.test.cjs` (catalogue against module manifests and admin paths, visibility by module state and permission, ordering and grading, composition with a failing owner, only visible modules read, menu wiring); `scripts/moderation-queue.connected.cjs` in `npm run test:pg` (real rows in all eight tables: counts, oldest first, limit, decided items left out, excerpts); browser check of the page at desktop and phone width.

## Slice 2: a yes or no from the overview
Outcome: for held forum posts, article comments, content reviews and product reviews each waiting item shows its whole text (plain, up to 2,000 characters) with two buttons, approve and reject. The other four sources keep leading to their own page, because their decision needs more than a yes or no: a flag is settled per post with its reasons in view, a product question usually gets an answer, a community report is judged against the reported content, a copyright report needs a resolution text.

Ownership: the overview sends the very request the owning admin page sends, to the owning module's own API (`/api/forum/review`, `/api/admin/comments`, `/api/admin/reviews`, `/api/admin/product-feedback`). Permission, rules, audit entry, notifications and bonuses stay that module's; the moderation module adds no decision code. The catalogue holds the request for each decision as data.

Rules: rejecting a held forum post deletes it, so it asks for confirmation; the other decisions can be changed later on the owning page and do not ask. After a decision, accepted or refused, the queue is read again, since someone else may have decided the item meanwhile. The product sources are now shown for `cms.products` only, which is what their admin API asks for (the first slice also listed `settings.manage`, which that API refuses).

Acceptance: unit test that every decision is exactly the request its owning handler reads, that those handlers still read those fields and values, which decisions ask first and which sources offer none; the connected check also covers the whole text; in a browser on the running site an administrator approved a comment, rejected a comment, approved a review and rejected a held forum post from the overview, and the database showed APPROVED, REJECTED, APPROVED and the post deleted with its topic's first post untouched.

## Not included
Bulk decisions, assignment, one case lifecycle across domains, counts in the admin menu, and notifications to staff about long waits.
