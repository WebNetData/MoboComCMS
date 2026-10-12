# Telegram merge safety — 2026-10-11

## Change and boundaries

The actual old profile-loss reproducer is recorded in [Telegram authority](2026-10-11-telegram-authority.md). Existing Identity attach now delegates a private preflight/profile transfer to telegram-account/merge-safety.ts. Source/target User locks are followed by ordered UserProfile locks. Source profile moves only when target has none, retaining username, contents, privacy, counters and both timestamps. Both profiles present returns existing UNSAFE_SOURCE before money or identity effects. Existing website/bot/API addresses and same-ID claim remain unchanged. No migration, alternate identity/username store, permission/configuration bypass, provider activation or protected React/CSS changes.

Installed generated Prisma metadata enumerates actual User FK columns. Any source reference outside the existing explicit transfer allowlist refuses merge; this catches Cascade/SetNull and uniqueness-sensitive modern rows without inventing module transfer semantics. Explicit inspected scalar human references and unreconciled consent/privacy/security preferences also refuse. Content ownerId is not inferred to be UserId. Disabled-module data participates; refusal keeps it. This is conservative data protection, not full modern-data/collision merging. Scalar references without FK are not comprehensively inventoried/fenced against in-flight writers; broader source metadata reconciliation remains open. Do not promote full merge/release readiness.

## Executed evidence

Owned actual PostgreSQL/Redis fixture, non-root Node22, no .env; logs root .mobocom/restrictions-<id>.log:

- Narrow units 53 pass/native0: 1791708762927-7872. Initial unit fixture failed because its proxy converted queryRaw to an object (1791708688029-45372); corrected function passthrough, no production workaround.
- Full check 638 pass/native0 (581+53+4) with TypeScript: 1791708813278-27412. Production build native0: 1791708823571-17552; existing CSS warnings retained.
- Final seven PG owners native0: 1791709190018-16584. Actual new owner verifies exact profile contents/username/dates, both-profile collision, both directions of follow/block, personal playlist, scalar referral/loyalty, four source preferences, wallet conservation and same-ID claim. Injected profile-write exception after real wallet SQL rolled back all actual User/wallet/profile changes. This is an injected boundary failure, not a production storage outage.
- Explicit one-connection Telegram owner native0: 1791709112872-10912. No external reader needed for preflight.
- Three deliberate source faults detected and restored, meaningful assertions inspected: unsupported ownership bypass (1791709068920-43912, userFollow merge unexpectedly succeeds); missing profile transfer (1791709069554-38076, profile becomes null); missing timestamp preservation (1791709070420-31636, updatedAt changes). Full actual PG owners rerun after restoration.
- Compiled HTTPS browser23 pass, zero fail/skip/retry,28.5s: 1791709102619-4372. Real Admin/Telegram connection demonstrates collision refusal with identities/profile/wallet unchanged, then successful transfer with exact DB facts and same /u/<username> returning200 and stored bio before/after. Local fake Bot API only. Existing Global Admin light/dark/mobile/a11y and current-account/security/checkout regressions included. No React component was modified, so no new React Doctor scan claimed.
- Changed unit-fixture line endings normalized afterward with identical text; no application-source change after production build. Final TypeScript native exit0: 1791709196042-12492.

Root source/client/:3000/owner files, production data and schemas untouched. No Actions, push, PR, merge or deployment. Broad global/resource/recovery/groups/lifecycle/theme/editor/domain work and all-instance source/schema rollout remain PARTIAL; goal active.
