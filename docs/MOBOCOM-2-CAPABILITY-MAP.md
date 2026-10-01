# MoboCom 2.0 capability map

This is an initial code inventory for the owner's 20-capability brief. A module or model appearing here proves an existing starting point, not completion of the requested 2.0 behavior. Update each row after inspecting its routes, permissions, data flow, and UI.

| Brief capability | Existing owner or contract | Next gap to resolve |
| --- | --- | --- |
| Universal user library | `ItemFavorite`, `GameLibrary`, `UserMusicPlaylist`, `MusicListenHistory`, `CinemaWatchProgress`, `ContentPurchase`, `UserRecentView`, `/favorites`, `/dashboard/library` | A private overview and recent cross-domain feed compose favorites, games, playlists, collections and live purchases. Generic recently viewed history joins server-side Music/Cinema progress; shared write semantics and other domains still need expansion while retaining specialist status and ordering. |
| Store experience | `catalog`, `store`, `marketplace`, `orders`, `checkout`, `ItemFavorite`, `compare`, `StockAlert` | Shared favorite/compare and recent views are present; back-in-stock alerts already exist. Public listings, facets and product detail now enforce seller approval. Audit price history, price alerts, bundles and variant presentation against catalog rules. |
| Universal review and rating | `reviews`, `ItemFavorite`, `ItemStat`, `ItemReviewHelpful`, `ProductReview` | Public review reads reject unpublished items, bound pagination and aggregate rating buckets in the database. Shared item reviews have owner-safe helpful votes. Eligibility, structured dimensions and product review interoperability remain. |
| Cinema experience | `cinema`, `media`, `CinemaTitle`, `CinemaWatchProgress` | Server-side film and episode progress, cross-quality resume, private Continue Watching and paginated watch history with owner-only clearing, plus gated next-episode playback are delivered. Subtitle/audio tracks, preferences, release calendar and deeper discovery remain. |
| Music experience | `music`, `media`, Music models, global `MusicPlayer` | Directories, private playlists, queue restoration, artist release alerts, and private listening history are delivered. Recommendations remain. |
| Software and games releases | `software`, `games`, `GameLibrary` | Audit release/version history and entitlement contracts. |
| Editorial and Magazine | `journal`, `Post` | Audit editorial workflow and entity references. |
| Federated search | `search`, `SearchDocument`, content registry | Bounded candidates are rechecked against current publication state before hits, type counts or suggestions are returned; stale public search responses are not cached. Index freshness, broader facets and relevance still need work. |
| Importer and data sync | `imports` adapters and execution | Audit repeatable sync, conflict handling, and provenance before changing the importer. |
| Admin workspace | existing admin routes and module admin services | Audit bulk actions, saved views, permissions, and keyboard flows. |
| Audit/version explorer | `AuditLog`, platform audit | Audit version granularity, sensitive data handling, and restore semantics. |
| Notification center | `notifications`, `UserNotification`, inbox events | Concurrent dedupe dispatches copies only for the winning insert. SMS/email controls existed; members can opt out of account web push. Inbox has an owner-scoped unread view, pagination and immediate badge refresh after read actions. Per-event controls, durable delivery/retry and retention remain. |
| Community and social graph | `community`, `forum`, `UserFollow`, `social` | Keep person-follow distinct from following a content item; audit blocks and privacy. |
| Universal collections | `UserCollection`, items, collaborators, follows, saves, reactions; existing content registry | Cross-domain public/private/token-gated unlisted collections, owner editing, item ordering, collaboration, follows, personal saves, public reactions and staff editorial selection are delivered. Dedicated editorial authoring and scale QA remain. |
| Recommendation engine | `search`, `analytics`, item stats | Establish consent and quality metrics before using activity signals. |
| SEO platform | `seo`, site SEO, content registry | Audit canonical URLs, structured data, and entity coverage. |
| Entity hubs | content registry and public detail pages | Define relationships and authoritative source for each entity pair. |
| Universal lists engine | `ItemFavorite`, `GameLibrary`, personal playlists, user collections | Collections use validated content refs without migrating specialist records. Define a read adapter and any migration only after semantics are proven. |
| Moderation and trust | `forum`, `reviews`, `copyright`, admin audit | Audit one case lifecycle and staff permissions across domains. |
| Entity timeline/activity graph | content change hooks, `AuditLog`, notifications | Separate public activity from privileged audit events and decide retention. |

## First risk map

- **Data migration:** favorite, game, and playlist records have different semantics. A new universal table cannot replace them without mapping owner, order, status, visibility, and duplicate rules.
- **Access control:** private playlists, paid media, drafts, blocked users, and staff audit data must not enter public search, recommendations, collections, or activity feeds.
- **Event delivery:** `contentChanged` is best effort. Music release alerts now use a persisted release cursor and deduped inbox writes; other scheduled notification and synchronization features still need durable work.
- **Design drift:** MoboCom already has `--sds-*` and theme tokens. Apply SDS component relationships to existing styles and verify Persian/English, mobile/desktop, and light/dark behavior.
- **Validation baseline:** five stale `scripts/src` type errors were repaired. Full TypeScript and PostgreSQL production build now pass; keep both as release gates. The build still reports two CSS Autoprefixer warnings.
