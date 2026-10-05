# Community moderation: deletion, hiding and reports

## Audit

The community has one report queue (`CommunityReport`) and one moderation list for posts. Three things in it were wrong.

1. **Staff could republish a post its author had deleted.** A member's "delete" and a moderator's "hide" both stored `status = HIDDEN`. The moderation list offers "restore" on every hidden post, so a post the author removed could be put back in public by staff, by mistake or otherwise. Reproduced on `main` with the connected script.
2. **Hiding a post left its reports open.** Hiding from the moderation list did not touch the reports that asked for exactly that. They stayed in the open queue and in the dashboard's open-report count until someone closed each by hand. (Hiding from the report itself already closed them.)
3. **A comment could be reported without access to its post.** Reporting a post requires that the member can open it; reporting a comment only required the comment to exist, so a member could file reports against comments under followers-only posts or private profiles by guessing ids.

## Behavior

- A post has three states: `VISIBLE`, `HIDDEN` (by staff, reversible) and `DELETED` (by its author, final). Public reads only ever show `VISIBLE`, as before. Staff see deleted posts in the moderation list, marked as deleted by the author, can filter for them, and have no restore action on them; the service refuses it too. Closing a report with "hide" on a deleted post leaves it deleted.
- Staff removing someone's post through the member API hides it, reversibly, as before.
- Hiding a post from the moderation list closes its open reports as resolved. Restoring it later does not reopen them. Reports on other posts are untouched.
- A comment can be reported when the member can open its post. Otherwise the answer is the same "not found" as for a comment that does not exist, and nothing is stored.

## Data and compatibility

No migration: the status column is text. Posts deleted by their authors before this change are stored as `HIDDEN` and cannot be told apart from moderator hides, so they keep the restore action; only deletions from now on are final. The schema comment names the three states.

## Owner

`community` owns posts, reports and both services. No other module reads a hidden or deleted post.

## Acceptance

Real PostgreSQL: author deletion not restorable and not visible, listed and filterable for staff, report closing on it, counts; moderator hide closing the open reports of that post only, restore not reopening, staff removal reversible; comment report refused without access and stored with it, duplicate report. TypeScript, architecture, source, schema and security checks, existing community tests, production build.

## Not in this slice

A member's own deleted comments (there is no restore for comments); telling the reporter what was decided; one shared moderation queue across community, forum and reviews.
