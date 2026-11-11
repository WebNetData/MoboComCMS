# Player breaks: video and image ads in the film player, and the site intro

## Outcome and owner

Owner, 2026-11-11: «برای پلیر فیلم و سریال میخوام تبلیغات بزارم گاهی اوقات مثل یوتیوب به صورت ویدیو یا عکس و ... همچنین بتونم اینترو هم بزارم».

A viewer of a film or episode on `/watch/<id>` sometimes sees a short ad before the film (pre-roll) and during long films
(mid-roll): a video, or a picture shown for a few seconds, labelled «تبلیغ», skippable after a set time, with «اطلاعات
بیشتر» to the advertiser. While the film plays, a small closable banner may appear over its bottom edge (overlay).
Before the film the site's own intro clip may play, skippable.

Owners:
- **ads** (`src/modules/ads`): the breaks are its placements and creatives. Targeting, priority, rotation, caps, packages
  sold from the wallet, approval, impressions/clicks and reports are reused unchanged. New: placement kinds `PLAYER` and
  `OVERLAY`, creative kind `VIDEO`, which creatives fit which placement, and break pacing in the ads settings.
- **cinema** (`src/modules/cinema`): the intro is a cinema setting, not a campaign.
- **media player** (`src/components/media/VideoPlayer.tsx`, protected visual): a separate break layer over the frame;
  the player's controls, resume prompt, next-episode and error states are untouched.

Not done: VAST/IMA ad networks, HLS ad files, per-title intros, skip/complete statistics (impressions and clicks only),
breaks in embedded (YouTube) players, game trailers or editorial inline players.

## Actors and authorization

- Admin with `ads.manage` (or `settings.manage`): placements, campaigns and video creatives, pacing settings. Existing guards.
- Advertiser (self-serve, existing portal): may submit `IMAGE`, `TEXT` and now `VIDEO` creatives; campaigns still need
  approval. `HTML` stays admin-only and never fits a player placement.
- Admin with `cinema.manage` + `settings.manage`: the intro (cinema settings, existing guard and history).
- Viewer: sees breaks under the campaign's targeting and the existing exemptions (ads module off, `hideFor` VIP or
  members, user groups that hide ads, audience `NON_VIP`). Bots see none.

## Data and compatibility

- `AdCreative`: `videoUrl TEXT ''`, `skipAfter INT 5` (0–60; 0 = no skip, the ad plays out), `seconds INT 8` (an image
  in the player, 3–30). Additive migration with CHECK constraints; line in `prisma/release-manifest.json`; both schemas.
- `AdPlacement.kind`: values `BANNER | STICKY | PLAYER | OVERLAY` (text column, no constraint today). Builtin rows
  `player-preroll` (PLAYER), `player-midroll` (PLAYER), `player-overlay` (OVERLAY) are created by
  `ensureBuiltinPlacements` like the others.
- Settings JSON (no migration): ads `player: { gapMinutes, midrollMinutes, midrollMinLength, overlayAfter }`; cinema
  `introUrl, introSkipAfter, introFrequency (SESSION | ALWAYS)`. Missing keys read as defaults.
- Older readers: banner slots never receive a `VIDEO` creative; the serve answer only gains fields.
- Rollback: the three columns and three placements stay unused.

## Flows

- Viewer presses play the first time: the player holds the film, plays the pre-roll (if one is served and the viewer's
  gap since the last break has passed), then the intro (if set; once per browser session unless ALWAYS), then the film
  (resuming where asked). An ad counts an impression once on screen 2 s (existing signed view token). «اطلاعات بیشتر»
  opens the existing click route in a new tab. «رد کردن» appears after `skipAfter` seconds.
- Mid-roll: films longer than `midrollMinLength` minutes; at every `midrollMinutes` of playback crossed by playing (not by
  seeking past), never in the last 2 minutes; pauses the film, plays the break, resumes. Native fullscreen of the film is
  left first so the break is visible.
- Overlay: once per viewing, `overlayAfter` seconds into playback, closable, gone after 20 s.
- Edge paths: no campaign → nothing happens; the ad file fails or stalls (8 s) → skipped silently; the browser refuses
  sound → the ad plays muted with an unmute button; the browser refuses to resume the film → its own play button stays;
  ads module off / exempt viewer → no request at all for exempt known on the page, empty answers otherwise.

## Admin and public UI

- Ads › campaign: creative kind «ویدیوی پخش‌کننده» (upload or address of an MP4/WebM, skip after, link and CTA); an
  image creative gets «مدت نمایش در پخش‌کننده». Ads › placements: kinds «پخش‌کننده (قبل/میانه)» and «روی ویدیو».
  Ads › settings: pacing fields. Cinema › settings: card «اینترو» (upload/address, skip after, how often).
- Player: a break layer inside the frame (so it follows frame fullscreen), RTL, label and countdown in Persian digits,
  focusable skip and link, `aria-live` status; existing tokens, no glass/glow (owner rule), reduced-motion friendly.

## Contracts and security

- `GET /api/promo/serve?ps=player-preroll,player-overlay&path=<film page>`: unchanged route, guards and rate limit;
  answers gain `video`, `skipAfter`, `seconds`, `slot` (`PLAYER | OVERLAY | BANNER`). Impression/click routes unchanged.
- Video addresses: `http(s)` or a site path, `.mp4`/`.webm` only, validated in `normalizeCreative`; CSP already allows
  `media-src https:`.

## Acceptance

- `scripts/player-breaks.connected.cjs` (registered): real PostgreSQL through `savePlacement`/`saveCampaign`/
  `saveCreative`/`setCampaignStatus`/`serveAd`/impressions/settings and the cinema intro setting. Breaks that must fail
  it (all verified): text in a player break, a video on a page slot, serving ignoring the fit, a campaign that fits none
  of its slots starting, unsaved pacing read as zeros, a non-MP4/WebM ad video or intro accepted, a VIP served under
  `NON_VIP`.
- Unit rules in a `test:site` file (fit, normalisation, pacing, mid-roll points).
- Browser on a branch preview: pre-roll video → skip → intro → film resumes; overlay closes; mid-roll at a forced time;
  1440 light/dark and 390; axe; React Doctor on the new components.
