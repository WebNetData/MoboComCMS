# Shared member avatar and Admin control discovery

## Existing owners and outcome

Identity `UserProfile` and `updateUserProfile` already own the member avatar and transactionally mirror public fields into ForumProfile. Keep both existing upload URL families and storage directories. Forum author/shell/editor reads must prefer canonical Identity, including explicit removal; lazy legacy-profile import preserves old pictures and usernames. No schema migration or bulk rewrite.

Successful Dashboard/Forum saves refresh the existing NextAuth session from the server. Its supported cross-tab broadcast updates other open sessions; the shared provider refreshes server components when identity changes. Unsaved uploads and failed saves do not publish an avatar. Telegram picture/initial fallbacks retain current policy. Account settings expose the existing public-profile editor even if Community is disabled; Identity is Core.

The Admin layout already composes module manifests, permission-filtered links and disabled-module paths. Reuse that projection for a searchable Website management directory, with the same owner forms for add/edit/delete/visibility/settings. Preserve existing deep builder/studio entry points through authorized parents. Do not add a second settings registry or generic database editor. This slice does not make arbitrary code-defined UI configurable.

## Access, failures and compatibility

Own-profile mutation remains authenticated and Origin-guarded. Forum-only group/title eligibility is checked before shared identity writes. Retain staff guards and per-section permissions. Admin discovery waits for fresh role and module navigation; failed reads offer retry and expose no unverified controls. No secrets or avatar payloads enter a new browser storage channel. Existing URLs, module switches and protected public designs remain intact.

## Acceptance

Use real PostgreSQL namespaced fixtures: Dashboard and Forum writers, mirrored fields, stale Forum data, explicit removal/fallback, legacy migration, forbidden Forum fields, shared public cards and server projections. Register the check in run-pg-checks. Run relevant unit/source/type/architecture/security gates without .env as UID1000; deliberately break avatar precedence/denied-save rules in an isolated snapshot and observe failure.

Run real localhost3000 uploads/saves from both editors, same-window and cross-tab header/profile refresh without signing in again; verify persisted projections and unauthorized writes. Exercise Admin search/filter, restricted staff, disabled modules, loading/error/retry. Capture1440 and390 light/dark, keyboard and scoped axe, run React Doctor on affected components. Record exact executed evidence and remaining control-plane gaps in the handoff/capability status. Owner merges; no hosted Actions.
