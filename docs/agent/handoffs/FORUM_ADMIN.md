# Forum admin — 2026-10-26

The owner asked for every section of the admin to be principled, tidy and specialised. This slice brings the forum admin into the shared section frame and gives each tab a shape that fits its job.

Branch `feat/forum-admin-tidy-2026-10-26`, from main `6eeb1193`. Decisions are in `PLATFORM_DECISIONS.md` §6, under "The forum admin".

## What changed

- **Frame.** The forum admin (`src/app/admin/forum/page.tsx`) uses the `sa-*` kit like the magazine, cinema and store:
  - tabs are links (`/admin/forum?tab=…`), with counts; the review and flag counts are highlighted while something waits;
  - the page header carries the forum's totals, the settings history and a link to the forum.

  The community pages' shell is `SectionShell` itself, not a copy of it.
- **Structure** (`CategoriesTab.tsx`): sections, forums and subforums form one tree.
  - Sections are highlighted, and forums and subforums are indented.
  - Each row has «+ انجمن» or «+ زیرانجمن», which opens the form with that row as parent.
  - Club forums are in their own view, with members and founder. They can be edited, not deleted, because they belong to their club. A club forum is never offered as a parent.
  - Deleting a category with children says that they move to the top level, which is what the API does.
- **Groups** (`GroupsTab.tsx`) are split into three views: the team's groups, the automatic ones and clubs.
  - Members are added or removed from a group's own row.
  - Automatic groups offer neither delete nor members.
- **Badges** (`BadgesTab.tsx`): each badge is a row with tier, rule, holders and state. A badge is granted or taken back from its row.
- **Members** (`UsersTab.tsx`): a table with level, posts, likes, last visit and state.
  - Filters: silenced or suspended, level set by hand, has a staff note. They come from the new `filter=` parameter of `GET /api/admin/forum?section=users`, which also returns the three counts.
  - «مدیریت» opens the member's level, title, note, silence, suspension and restrictions under their row.
- **Forms open on demand** (new item, or the row being edited), take focus and close after saving.
- **Settings** are grouped:
  - posting and newcomers;
  - flags and tags;
  - clubs;
  - private messages;
  - reactions, each with its weight;
  - the three trust promotions.
- **Contrast in the admin kit** (`admin-tidy.css`, `store-admin.css`):
  - pills on the accent take the derived ink in dark and white in light, where the admin deepens the accent;
  - the warning amber is deepened on light pages;
  - the dashboard's period switch uses the admin surface, where it had been light text on a white fallback.

## Checks

- TypeScript passes with 0 errors.
- `npm run check` is 703/6; the six are the known environment-only update-script tests.
- The architecture check passes.
- React Doctor reports 10 warnings on the changed TSX, against 23 on main's versions.
- Browser test `.mobocom/claude-tools/pw-forum-admin.cjs` passes 23/23:
  - the tabs are addresses, and the tree marks each level;
  - clubs are listed apart, and no form is open until asked;
  - a section is created, then a forum inside it from the section's row, and both are deleted from their rows;
  - group views, a group's members panel and the automatic groups' limits work;
  - a badge's grant panel opens from its row;
  - the sanction filter shows a silenced member, marked as silenced;
  - a member's detail row opens, settings are grouped, and the community pages use the shared shell;
  - axe reports 0 violations on all 11 tabs, light and dark, at 1440 and 390 px, with no overflow;
  - there are no page errors, and the fixtures are removed.

## Open

- The admin sidebar's active link in light mode is 2.73:1 (`.side-link-active`), on every admin page. It is the shared workspace navigation and was left for a separate decision.
- The member profile still has two addresses (`/u/…` and `/forum/u/…`). That is the next slice.
