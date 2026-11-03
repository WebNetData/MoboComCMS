# User groups

## VPN audience and per-user multiple groups — 2026-11-03

Continue the existing many-to-many UserGroupMember and site.section-access.v1 owners. Add VPN to the shared section catalogue: the owner may choose VIP, one/multiple custom groups, or their union (any selected group). Empty policy remains public for compatibility; neither VPN nor VIP is switched on automatically. Current full-access/VPN section staff bypass through existing Identity permissions. Expired/revoked VIP, expired membership, inactive group, banned/restricted accounts do not qualify. Cover plans/trial/customer subscription pages/APIs, plan checkout/trial commands and site-owned token endpoints; preserve payment callbacks, background fulfilment, records and already-issued external provider URLs. This is site access, not automatic remote account revocation.

Add a per-user multi-select in existing Admin user details (`users.manage`) using the existing group API. Save an exact membership revision under the user's row lock and strict transactional audit. Existing per-group add/remove share that lock. Selected retained memberships preserve expiry/note; role, password and permissions never change. Stale writes return409 with the draft retained; no schema/backfill or parallel roles system. Tests: native `vpn-group-access` (multi-membership, preserved metadata, stale/concurrent/audit rollback, VIP/group allow/deny, expired/inactive/restricted, checkout and token guards), existing group/section suites, browser Admin multi-select/section policy and themed mobile/desktop. Deliberate missing audience and revision checks must fail.

## Outcome and owner

Owner, 2026-11-03: professional user groups for the whole site. Each group has its own access, the store can price by group, a product, a post, a film or a game can be limited to chosen groups, and so can a whole section.

Owner: `account` (`server/user-groups.ts`, `server/item-audience.ts`, `server/site-groups.ts`). It composes Identity, Membership, Store and the section list. It adds groups beside the older kinds in the site group catalog (roles, VIP, buyers, sellers, resellers, CRM tags, forum groups), so any of them can be an audience.

It deliberately does not grant Admin permissions. A group cannot make someone staff: Role and `requirePerm` stay the only path into the panel (platform-evolution §3). It is not slice 3 of the roadmap in full: no primary and secondary groups, no automatic promotion.

## Actors and authorization

- `users.manage`: create, edit and delete groups, manage members, set section access and restore its audited configuration history. `settings.manage` alone does not expose group membership or change this access policy.
- A section's own permission sets who sees its items and their group prices: `cms.products`, `cms.posts`, `cinema.manage`, `games.manage`, `software.manage`, `music.manage`, `prompts.manage`.
- A viewer outside an item's audience gets a 404, so the item's existence is not disclosed. Staff with that section's permission always see it.
- Guests belong to no group.
- A section limited to groups: guests go to sign-in, members outside it get a 403 notice, and the people who run the section pass.

## Data and compatibility

Additive migration `20270207120000_user_groups`: `UserGroup`, `UserGroupMember` (optional `expiresAt`, read at decision time), `ProductGroupPrice`, and `audienceGroups` (default `''`, public) on `Product`, `Post`, `CinemaTitle`, `GameTitle`, `SoftwareTitle`, `MusicTrack`, `MusicAlbum`, `PromptTemplate`. Section access is the setting `site.section-access.v1`.

Every stored item keeps `''` and stays public. Reverting the code leaves the columns unused; an item limited to groups would then be public again, so limits must be removed or the items unpublished before a rollback.

## Flows

- **Fail closed:** the shared publication filters (`live`, `livePostWhere`, `publicProductWhere`) require `audienceGroups: ''`, so every list, rail, search index, sitemap, feed, recommendation and new query leaves a limited item out by default. The search index never holds one.
- **Opening back:** detail pages and the main lists use `publishedNow` or the product's own read, then `opensAudience` or `audienceClause`. Limited items do not appear in search, home rails or recommendations, even for their group.
- **Capabilities:** a group may give VIP benefits (through `isMember`, `opensMembersOnly`, `getViewer`), hide ads, and a store discount.
- **Price:** the buyer pays the lowest of regular, VIP, the group's product price and the group's discount, decided on the server in `unitPrice` at cart and checkout.
- **Expiry:** a membership past its `expiresAt` stops counting at once; no job is needed.

## Admin and public UI

`/admin/user-groups`: list, editor, members, capabilities, section access. `ItemAudiencePanel` beside the paid access panel in the item editors; group prices on products. `/section-locked`: the notice for a limited section.

## Contracts and security

`/api/admin/user-groups` and `/api/admin/item-audience`: guarded, audited, Origin-checked by the proxy. Prices are never taken from the browser. No public API change; `publicProductWhere` also narrows `api/v1`.

## Acceptance

`scripts/user-groups.connected.cjs` on real rows: membership and expiry, inactive groups, VIP benefit, price order, item gates, section decisions. Breaks that must fail it: an expired membership counted, a group price ignored at checkout. A leak sweep crawls the compiled site as a guest for a limited item's name across lists, search, sitemap and feeds.
