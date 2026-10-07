# Five closing slices (2026-10-07)

Ordered by the owner in one message, to be done together. Each has its own acceptance; the decisions are in `docs/agent/PLATFORM_DECISIONS.md` §6B.

| Slice | Owner | Acceptance |
|---|---|---|
| Playback preferences with the account | `media` | `scripts/player-subtitles.connected.cjs` |
| One address for a member | `identity`, `community`, `forum` | `scripts/forum-community.test.cjs`, browser |
| Every list a member keeps, read and written one way | `account` over the owners | `scripts/member-lists.connected.cjs` |
| One case around a waiting item | `moderation` | `scripts/moderation-cases.connected.cjs` |
| People of films and series | `cinema` | `scripts/cinema-people.connected.cjs` |

## Rules worth restating
- Nothing is copied between owners: lists are changed through their owners, cases decide nothing, people are read out of the titles' own fields.
- A module switched off takes its part with it and leaves the rest: no forum → no forum tab; no social profiles → the forum's own profile page; no music → no playlists among the lists.
- Stored history is carried over: credits of older titles are read by a worker step; preferences default to "never chose".

## Not included
See "Not yet built" in PLATFORM_DECISIONS §8.
