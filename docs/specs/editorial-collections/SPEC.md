# Collections written by staff

Owner: `content` (`server/collections.ts`). One additive column, `UserCollection.staffAuthored`. Reuses the collection tables, the content registry (published items only), the site search and the admin audit log.

## Rules
- Staff with any content permission write a collection at `/admin/collections`: a title makes a draft (`PRIVATE`); the editor sets text and cover, finds published items of any section through the site search, adds, orders and removes them, publishes (`EDITORIAL`) and takes back to a draft.
- A draft is seen by staff in the admin panel only; not by the public, and not by its writer on the public pages. Publishing needs at least one item the public can open.
- Published, it is signed by the site (`تحریریه`); the writer's name is not shown and the public page offers nobody editing.
- The kinds do not mix: member paths (update, delete, items, own lists) refuse a staff collection; staff paths refuse a member's list. Selecting or releasing a member's public list is unchanged and does not apply to a staff collection.
- Taking a staff collection back to a draft keeps its followers, saves and likes; they return with it. Deleting it removes them.
- Every staff change is written to the admin audit log.

## Acceptance
`scripts/editorial-collections.connected.cjs` in `npm run test:pg`. Fifteen deliberate breaks fail it.

## Not included
Scheduled publication, a cover upload in the editor, collaborators from outside the staff, a block that places a collection on a section's home page.
