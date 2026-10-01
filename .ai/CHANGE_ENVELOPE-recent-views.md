# Change Envelope: Private Recent Views

Goal: Record and display a member's recently viewed published content across shared detail pages.
Owner: `content` registry and recent views service; account dashboard composes the read.
Risk: R3, inside the R4 MoboCom 2.0 program.

Inputs / outputs:
- Input: signed-in user and a bounded item key from a visible detail page.
- Output: private, paginated recent history and account library preview.

Invariants:
- Only currently public items can be recorded or displayed.
- Each member can read and clear only their own history.
- Existing specialist playback and library state remains authoritative.

Allowed scope:
- Additive Prisma model and migration; content service; account API and UI; shared detail tracker.

Forbidden drift:
- No new generic list system, public history, or redesign of MoboCom styles.

Failure / race cases:
- Duplicate visits update one row. Removed or unpublished items disappear from reads. Cross-origin writes and anonymous requests are rejected.

Proof required:
- Schema parity and applied migration; connected owner/publication tests; browser tracker and dark UI check; project-native static checks and build.
