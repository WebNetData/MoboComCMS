# User groups and popup audiences — 2026-11-02

Continue `feat/user-groups-2026-11-03` from owner-merged PR306/main `67f6f522`.
Codex continued Claude's existing93-file draft; popup creation/presentation had
already merged in PR305 and the composed audience catalogue in PR306. Do not
rebuild either. Older root owner work and private fixtures remain separate.

## Owners and boundaries

- Account owns custom `UserGroup`, `UserGroupMember`, benefits and the composed
  site-group catalogue. `group:<id>` joins existing Role/VIP/buyer/subscriber/
  seller/reseller/CRM/forum keys. Membership refers to the canonical UserId.
- Identity Role, current standing/restrictions and existing section permissions
  remain the only staff authority. Custom groups never grant Admin access.
- `users.manage` manages groups, members and section-access policy. Each item's
  own manager permission controls its audience; authors cannot change it through
  this API. `settings.manage` alone cannot read memberships or edit this policy.
- Membership composes VIP benefits only while its existing module is enabled.
  Ads composes `groupHidesAds`; Store retains integer minor units, checkout,
  wallet claims and the lowest applicable regular/VIP/group price. Open-amount
  foreign-payment services retain their existing server quote, without applying
  ordinary product discounts to the customer's typed face value.
- Popups retains its existing module, UI, cadence/revision/counts and server
  audience decision. Custom groups use the same catalogue; expiry/inactivity are
  rechecked. An empty staff Role does not become a full administrator or receive
  manager announcements just because the account's standing is ADMIN.

## Data, commands and public reads

Migration `20270207120000_user_groups` adds three tables and a public-by-default
`audienceGroups` column on Product/Post/CinemaTitle/GameTitle/SoftwareTitle/
MusicTrack/MusicAlbum/PromptTemplate. Both schemas and release manifest agree.
The draft was unapplied when PromptTemplate joined it. Do not rewrite this
migration after delivery to another environment.

`account/server/group-command.ts` rechecks users.manage and strictly audits in
the transaction. Item audience and product group prices commit together through
`audience-command.ts`: input validation, closed owner/table map, serialized row
lock, optional revision conflict and strict audit. Invalid prices/audiences or
an audit failure cannot partly open/restrict an item. Album saves preserve each
track's independently chosen audience. The UI labels the product currency and
retains unsaved input after409. Its keyed item wrapper cannot reuse another
item's audience draft.

`item-audience.ts` composes current canonical Identity and owner catalogue keys;
it does not add another staff resolver. Main lists/details may admit selected
members; guests and other accounts receive404. Tracks require both their own
and their album's audience. Shared publication filters, registry cards/search,
recommendations, SEO and home rails exclude restricted items even for members.
The registry's public discovery also excludes closed sections; private search
index rebuilding remains independent of temporary section limits. Media links
recheck the item and section before returning a stored source.

`site.section-access.v1` uses existing Settings transactional history/revision/
strict audit through `settings-section-access`, with restore under users.manage.
Missing setting means public; empty lists remain public. A corrupt first read
throws, a failed subsequent read retains the last known policy; shared discovery
closes section results if policy is unavailable. The current memory policy read
TTL is15seconds. Page/API decisions occur before the guest page cache. Guests
go to login, nonmembers receive403, managers of that section pass. The legacy
CMS projection and sitemap also exclude limited sections.

## Operator path

1. Open `/admin/user-groups`, create a named group and choose active status,
   colour, ordering, VIP benefits, ad hiding or shop discount.
2. Open **اعضا**; add an existing user by ID, email or normalized Iranian mobile.
   Choose optional expiry/note. **ویرایش عضویت** updates these; removing a member
   removes the benefit without changing their Identity Role.
3. On a saved item, use **چه کسانی این مورد را ببینند**. Choose everyone or
   selected groups; products can also set a group-specific price. Blank/zero
   removes a price override. Save this panel independently of the content form.
4. Whole-section policy is below the group list, with its existing history/
   restore UI. In `/admin/popups`, choose the groups audience and the same group.
   Existing popup preview/design/repeat/total/page targeting remain available.

Deleted group keys remain visible in pickers so managers can remove them.
Items naming only deleted/inactive groups remain closed, rather than becoming
public. No group is automatically assigned to existing production users.

## Executed evidence and limits

- Linux UID1000/stripped environment: `npm run check` passed862 tests, skipped1;
  architecture/source/schema/release/money/security/audit/i18n/type gates ran.
  Final `npm run build:postgres` passed in31.7seconds with BUILD_ID present.
  Its45 filesystem-trace warnings are in existing package/update/host code,
  which this slice did not modify; a warning-free build is not claimed.
- Fresh unseeded PostgreSQL migrations and13 relevant native suites passed:
  user-groups, site-popups, three cart suites, seo-entities, media-tracks,
  recommendations-listening, recommendation-providers, prompt-master,
  journal-pagination, masked-file-authority and section-settings-history.
  The expired-membership mutation failed; ignoring group prices specifically
  at executeCheckout failed with10000 instead of6000 minor units. Restored
  source passed. Native proof includes real wallet checkout/idempotent replay,
  physical-checkout price projection, atomic rollback, permission403/revision409,
  album/track scopes, Prompt privacy and empty-role manager-popup exclusion.
- Local backup was restored into a disposable database and migrated: all230
  prior application tables/13,016 rows retained their hashes; dump1,389,141bytes.
  Existing localhost3000 adopted the additive migration through its normal
  startup (including the existing idempotent seed). No database reset or
  external deployment was performed by the continuation.
- Browser: all8 limited detail types answered404 for guests and200 for their
  member;13 public discovery/search/sitemap/feed surfaces excluded them. Five
  direct staff/API boundaries and cookie-only mutation refusal passed. Whole
  Music section: guest login/API401, outsider403/API403, member/full page200;
  the original policy was restored. Selected-group popup delivery, one-view
  server count and Escape passed; guest/outsider did not receive it.
- Four initial themed group-editor captures and nine final Admin/popup captures
  had axe0 and no page overflow/JS errors. Expanded picker, both popup themes at
  1440/390, membership-note editing, controlled503→real API retries and an actual
  item-price409 preserving the unsaved draft passed. Browser findings fixed:
  scroll-container/screen-reader-label overflow, picker heading order and error
  contrast. Screenshots were inspected; final build evidence is in workstate.
- Scoped existing Semgrep configuration:1 rule/22 files,0 findings; account
  Gitleaks scan redacted,0 findings. This is not a whole-project security audit.
  React Doctor8 final affected components:0 errors/44 reviewed advisories;
  detached versioned drafts are intentional,
  duplicated table headers and older MediaCrud complexity/effects remain scoped
  advisories. No rules were suppressed.

Raw reports/backups/cookies/screenshots/source hashes are ignored under
`.mobocom/user-groups-continuation`; never commit or publish them. Native suites
declare session/module/configuration/leaf-presentation and external provider
doubles. Browser error recovery uses controlled503 responses followed by the
real API;409 is real persisted state. Payment providers, live OTP, production
host, Redis distributed invalidation and multi-instance load are unassessed.

## Rollback and next work

Keep additive tables/columns and prior content. Rolling back to code without
audience guards can expose limited content: unpublish affected items or retain
the guards/section closure before any older code is served. Do not drop tables,
reset users, reassign roles or remove stored historical memberships/prices.
This is a bounded custom-group/audience slice, not the full future primary/
secondary group hierarchy or automatic promotion system. Product overrides in
the panel are per product; the existing variant-price read shape is retained.
Owner requested consolidated PR publication on2026-11-02, targeting main with
`[skip ci]` under the Actions quota decision. The owner merges; no hosted workflow
dispatch or deployment is part of this publication.
