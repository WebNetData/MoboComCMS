# Section authors

Owner request, 2026-10-12: a staff group per site section — magazine author, film and series author, music author, games author, software author — whose only job is to post in that section. An author manages only their own items. An author cannot remove an item: deleting sends it to the trash, and the site owner or that section's manager decides whether it is deleted or put back.

## Actors

| Actor | Holds | May |
| --- | --- | --- |
| Author of a section | the panel + that section's author permission | list, create and edit **their own** items of the section; ask for one of them to be deleted |
| Manager of the section | the section's own permission (unchanged) | everything as today; delete a trashed item for good, or put it back |
| Site owner (full access) | everything | the same as the manager, in every section; names authors |

## Rules

1. **One permission per section, as before.** An author permission is a second, narrower key of the same section (`journal.author`, `cinema.author`, `music.author`, `games.author`, `software.author`), declared by the section's own plugin. It is never accepted where the section permission is asked; the two content owners accept it only through one scope function, which returns "manager" or "author of user N". No shared content permission, no second resolver.
2. **Own items only.** The owner of an item is the staff member who created it (`Post.authorId`, `createdById` on the media models). For an author every list, read, save, block-editor document and bulk request is narrowed to rows they own; a row of someone else answers as if it did not exist. Items that exist today have no recorded creator on the media models and so belong to no author.
3. **An author never deletes.** A delete by an author moves the item to the trash: `status` becomes `TRASHED` (the status it had is kept in `trashedStatus`), with who asked and when. Every public reader asks for `PUBLISHED`, so a trashed item leaves the public site at once without touching those readers. The author cannot edit a trashed item.
4. **The manager decides.** The section's manager or the owner either deletes the trashed item for good (the delete that exists today) or restores it to the status it had. Delete requests appear in the staff moderation overview under their section.
5. **Standing.** Naming an author goes through the same page and guards as naming a manager: role and standing change together, an account never becomes staff without a role, full-access and custom roles are not changed from there. An account is either a manager or an author through that page, not both.
6. **Shared names.** A music author may add an artist (and owns it) but artists, which have no status, cannot be trashed: an author cannot delete one.
7. **What an author does not get:** categories and taxonomy management, comments, history, newsletter, AI autofill, collections, featuring an article, paywall prices, imports, the section's settings.

8. **Games** have an admin of their own. A games author gets the list of their own games, its batches (not featuring or the editors' choice), the game editor, and the updates and DLC of their own games. The dashboard, the release plan, franchise changes, studios and the settings stay the manager's.

## States

`DRAFT | PUBLISHED` ⇄ `TRASHED` (by the author's delete request; back by the manager's restore) → deleted (by the manager).

## Data

Additive migration: `trashedStatus`, `trashedAt`, `trashedById` on `Post`, `MusicAlbum`, `MusicTrack`, `CinemaTitle`, `GameTitle`, `SoftwareTitle`; `createdById` on those five media models and `MusicArtist` (two migrations: `20261224120000_section_authors`, `20261225120000_game_authors`). No existing row changes.

## Evidence wanted

Unit: role assembly, scope and trash rules. PostgreSQL: an author sees and changes only their own rows in both owners, a delete becomes a trash request, a manager restores and deletes, a trashed item is not public. Browser: an author's panel shows only their section and items; the delete request reaches the manager.

## Not in this slice

Items other than the top-level ones (an author edits seasons, episodes and links only as part of their own title, which is how the form already saves them). Notifying the author of the decision. Per-author statistics.
