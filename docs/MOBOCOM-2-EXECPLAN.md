# MoboCom 2.0 execution plan

## Goal

Evolve the existing CMS into the connected content, commerce, community, and media platform described in the owner's MoboCom 2.0 master brief. Deliver usable vertical slices while preserving the current modular monolith and MoboCom visual identity.

## Repository audit and ownership

- The initial 20-capability inventory and risk map are in `docs/MOBOCOM-2-CAPABILITY-MAP.md`. They are a starting audit, not a claim that each 2.0 capability is delivered.
- `src/app` owns delivery; `src/modules` owns domain behavior; `src/platform` owns shared infrastructure. `docs/ARCHITECTURE.md` and `npm run arch:check` define the current boundaries.
- Existing Prisma models include `ItemFavorite`, `GameLibrary`, `UserFollow`, `AuditLog`, `MusicArtist`, `MusicAlbum`, `MusicTrack`, `MusicPlaylist`, and the new `UserMusicPlaylist`/`UserMusicPlaylistTrack`. Existing `social`, `reviews`, `search`, `music`, `media`, and `notifications` modules need assessment before adding any universal service.
- `src/app/globals.css` already contains `--sds-*` tokens. New screens should reuse existing primitives and media compositions. Figma SDS informs the token → primitive → composition → layout relationship; its theme and code stack are not MoboCom dependencies.
- Both `prisma/schema.prisma` and `prisma/schema.postgresql.prisma` must remain in parity. Schema changes require a migration and local PostgreSQL validation.

## Current delivery: Music discovery and personal playlists

- [x] Separate searchable, paginated public artist, album, and curated playlist directories with direct navigation from Music.
- [x] Private playlists owned by authenticated users, with create, rename, delete, add, remove, and play flows.
- [x] Owner checks, bounded input, publication filtering, and duplicate prevention for personal playlist mutations.
- [x] Local PostgreSQL migration, targeted tests, static checks, and route/API smoke tests.
- [x] Preserve the existing application-level player queue and seek position across reloads, without automatic playback; keep protected media access behind a playback-source contract.
- [x] Expose the queue control on mobile.
- [x] Reuse the existing universal `ItemFavorite` action on artist detail pages; track and album detail pages already use that contract.
- [x] Link Music to the existing filtered favorites page and show a correct empty state when a member has no liked tracks.
- [x] Add a private `/dashboard/library` overview of favorites, game shelves, and personal playlists using their existing owner services; link it from the account navigation.
- [x] Artist follow alerts for newly published tracks, including scheduled releases, stored work, bounded follower batches, and deduplicated inbox delivery.
- [x] Private listening history recorded when the player starts, with repeat suppression, a paginated Music page, account-library entry, and a clear action.
- [x] Server-side music playback position and completion, with cross-device resume and a Continue Listening shelf.
- [x] Cross-domain member collections using the existing item registry: private, unlisted and public visibility; collaborators; ordered items; follow; owner editing; and an add action on content pages.
- [ ] Broader Music 2.0 work: recommendations and discovery, informed by the shared entity/list contracts and privacy rules.

## Dependency-aware milestones

1. **Foundation audit:** inventory entity IDs, interactions, list/library semantics, events, existing permissions, migrations, and performance baselines. Map each requested capability to its owner module and existing contract.
2. **Shared library and lists:** converge favorites, game library, and personal playlist behavior where a common contract is justified. Preserve existing APIs and data through migrations or adapters; define privacy and ownership before social sharing.
3. **Community, trust, reviews, notifications:** extend existing `social`, `reviews`, `forum`, `notifications`, and audit paths, then connect their events through explicit module APIs.
4. **Search and recommendations:** index only published/authorized entities; use measured query and relevance baselines before adding infrastructure.
5. **Store, Cinema, Music, Software/Games, Magazine:** deliver each experience as an independent vertical slice against shared foundations. Music directories and private playlists are the first completed slice.
6. **Importer, entity hubs, SEO, admin:** add synchronization, cross-entity presentation, indexing, and workspace workflows after entity ownership is stable.
7. **Release validation:** migration rehearsal, security and permission review, responsive RTL/LTR and dark/light QA, regression checks, performance checks, and production build.

## Design and data constraints

- Keep current URLs, import compatibility, authorization, and public/private visibility unless a migration explicitly changes them.
- Do not create a parallel token system or copy Figma SDS visuals. Use the existing MoboCom components and semantic tokens; add reusable primitives only when an actual reuse case appears.
- Schema migrations must be reversible where practical and must protect user data. Personal playlist records belong to users; do not overwrite or remove them during test cleanup.
- Public reads must filter unpublished content. Mutations must validate input and owner or role before changing state.

## Validation record

Music slice: `schema:check`, `source:check`, `arch:check`, `security:check`, and targeted Node tests passed. Local Docker PostgreSQL migration is applied and public pages plus authenticated playlist API/UI flows were smoke-tested on port 3000.

Player checkpoint: 32 targeted tests passed, including source and restored-session validation. A mobile Chrome smoke test on port 3000 confirmed that a saved queue reappears paused, without a media source before user action, and that the queue button is visible. Five stale `scripts/src` contracts were brought into line with the current forms and navigation types. Full `npm run typecheck` and `npm run build:postgres` now pass. The production build emits two existing Autoprefixer mixed-support warnings in `media-design.css`.

Library overview checkpoint: `/dashboard/library` composes bounded favorites, live game shelf data, and owner-only personal playlists. Anonymous route smoke test returned a login redirect with no private library data in the HTML. `schema:check`, `source:check`, `arch:check`, `security:check`, 21 targeted engagement/game/player tests, full `typecheck`, and `build:postgres` passed. Authenticated visual QA remains to be done.

Artist release checkpoint: A track publication records one release in the same transaction as an admin or import save; bulk publication uses the same contract. The existing engagement scheduler delivers at most 20 releases and 100 followers per release per minute, after the track becomes public. Follower inbox writes use stable dedupe keys and a persisted cursor. The local PostgreSQL migration was applied, the Haamim artist page returned 200 with the follow control, and the connected test verified immediate and scheduled delivery, muted followers, drafts, and retries. `schema:check`, `source:check`, `arch:check`, `security:check`, 21 targeted tests, `typecheck`, and `build:postgres` passed.

Listening history checkpoint: The global player sends a history event only after audio starts. The Music service stores one private row per user and track, suppresses rapid duplicate events, and limits the history view to live tracks with 24 rows per page. Members can clear their own history. The local PostgreSQL migration and connected two-account test passed, including API dedupe, owner isolation, private page rendering, account-library navigation, and clearing.

Music progress checkpoint: Listening history now also holds position, duration, completion, and the time of the latest progress update. The player periodically saves authenticated progress and resumes an unfinished track from the server when no local position is available. The history page shows Continue Listening. The PostgreSQL migration and connected owner-isolation/progress validation test were applied on the local Docker stack.

Collections checkpoint: A separate collection model preserves existing favorites, game status and playlist order. Client item references resolve through the published-content registry before insertion; detail reads filter unpublished or disabled items. Owner-only settings and collaborator administration, serialized item order mutations, public follow, personal save, API origin checks, bounded bodies, and private page access are in place. Unlisted access requires a random share token for non-members; restrictive visibility transitions revoke saves and follows. Migrations 20261103120000, 20261104120000 and 20261105120000 were applied locally. Connected API and browser checks passed, including dark-theme visual inspection.

Collection reactions checkpoint: Public and editorial collections now accept one idempotent reaction per signed-in member. Reactions are cleared when visibility becomes private or unlisted. Migration 20261106120000 was applied locally; connected tests verified deduplication, access and revocation, and the browser test verified the button and persistence.

Editorial selection checkpoint: Staff with `cms.posts` permission can promote a public collection containing live items to the editorial directory, then return it to public status. The admin list and promotion API use the existing permission and audit contracts; the public directory ranks editorial picks first. Collection owners can withdraw their own collection from public visibility, which also removes its editorial selection. Connected authorization tests, the authenticated admin browser flow, and the PostgreSQL production build passed.

Cinema progress checkpoint: Authenticated film and episode playback now records bounded position and duration in PostgreSQL. Different quality links for the same film share one resume point; each episode keeps its own. Completion clears the resume position. Reads on the watch page and the private Continue Watching shelf exclude unpublished titles, removed links and other users' progress. Migration 20261107120000 is applied locally. The connected test covers authentication, same-origin writes, cross-quality and episode behavior, page rendering, completion and disabled links. The authenticated browser test verified the shelf and dark stage. Schema parity, type checking and the PostgreSQL production build passed.

Next episode checkpoint: The watch page offers a signed link to the next chronological episode, including the first episode of the next season. A short countdown begins after playback ends, with immediate play and cancel controls. Upcoming and access-restricted episodes are withheld. The connected test verifies the episode link, season boundary, scheduled release and member gate.

Watch history checkpoint: A private, paginated `/cinema/history` page reuses the published-content progress read model, separates completed and unfinished items, and offers an owner-only clear action. The cinema navigation and account library link to it. Connected tests verified history isolation and clearing only the requesting member's rows; the browser test verified the dark page and clear control. The PostgreSQL production build, schema parity, source, architecture, security and type checks passed.

Library feed checkpoint: The private account library now combines bounded recent favorites, games, personal playlists, owned collections, saved collections and live content purchases in time order. It uses each domain's existing read contract, keeps specialist statuses and ordering, and excludes private items owned by others. A connected two-account test verified the private and saved collection paths, a purchase, and anonymous content guard. The authenticated browser check verified recent items and the dark account design.

Final checkpoint for the current branch: the PostgreSQL production build, schema parity, type check, architecture and security checks pass after the unlisted-token migration. The connected collections test covers token-gated reads, privacy transitions, owner/collaborator permissions, ordering, follow and save; the browser test covers add-from-item and the dark collection detail.

## Next implementation checkpoint

Define a read adapter across favorites, game status and personal playlists without losing their specialist fields. Continue the broader 20-capability audit and implementation, including a dedicated editorial authoring flow.
