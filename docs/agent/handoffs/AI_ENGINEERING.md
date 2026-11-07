# Private AI engineering and recovery

2026-11-07; `feat/ai-engineering-workspaces-2026-11-07`, from owner-merged
PR367/main `6e6f58b9`. Owner chose automatic isolated development/PR creation,
with production promotion only after their explicit approval. Existing direct
content tools and their per-request mode are unchanged.

## Ownership and implementation

- AI `domain/engineering.ts` owns typed bounded policy, plans, paths and fixed
  repair IDs. `server/engineering/` owns Settings/CAS/audit, captured and fresh
  canonical authority, private history and resumable steps. Its facade is
  `server/engineering.ts`; Operations calls the facade, not its internal parts.
- Additive `AiEngineeringRun` exists in both schemas and migration
  `20270222120000_ai_engineering_runs`, registered in release-manifest. Its
  nullable canonical User relation retains history on identity deletion. This
  table records workflow; BackgroundJob remains the executable queue.
- Private `/api/admin/server/engineering` requires existing Server Panel module,
  env/IP/password/TOTP unlock, `server.manage`, `settings.manage`, AI module,
  strict rate limits and write Origin. Own history only. Background steps check
  standing, auth/password epoch, permissions, modules, policy and expiry again.
  Exact artifact/head and revision claims bind release decisions; repair binds
  the diagnostic hash, runtime and fixed action. Audit failure rolls back claims.
- `generate-ai-knowledge.cjs` and its generated bundle carry11 real canonical
  documents/skills with hashes; `knowledge.ts` selects relevant excerpts under
  budget and fails closed on tampering. Source-only skills need not exist in a
  signed runtime package. Custom bounded skills live in canonical Settings and
  are inert/pinned per run. No second architecture or uploaded executable skill.
- Dedicated `engineering` AI purpose inherits personal Admin routing or uses
  its explicit API route. Calls are reserved before transmission; a lost response
  consumes an attempt. No hidden engineering-provider retries or extra calls
  for status. Reporting distinguishes reserved caps from actual provider usage.
- Root-owned `scripts/engineering/` implements protocol1 and immutable config,
  GitHub credential helper, source/hash guards, private clone, fixed validation,
  actual-byte artifact seal, PR and architecture receipts, approval/backup/proxy
  promotion, retained release rollback and three explicit recovery runbooks.
  Models supply JSON file edits, never commands/arguments/SQL/root scripts.
- Sandbox is non-root, no network, capped memory/swap/CPU/PIDs, no production
  data/env/socket. Private PostgreSQL is accessed by a shared Unix socket. Only
  one build starts globally; three distinct inputs/request maximum. Unchanged
  failed builds do not repeat. Relevant focused tests plus fixed checks/build
  run; no full release stack per edit. Existing guard/tests cannot be weakened.
- Successful source changes add an actual-check receipt and links in canonical
  architecture/map/ledger, refresh the shipped knowledge and create/reuse a PR
  to main. Public metadata omits private instruction text. Owner reviews diff,
  UI and secrets before merge. Exact merged-main tree and sealed bytes are
  rechecked; a changed main requires a fresh request, including squash merges
  only when the tree matches.
- Promotion copies approved bytes without executing source, locks code root-owned,
  checks its digest again, and uses native unprivileged persistent systemd units
  on3101/3102 with the existing host's storage/tools. Retained native3000 keeps
  server-control APIs; all existing access/Origin rules remain. The native
  service is never stopped by this workflow. Runtime markers prevent duplicate
  scheduled jobs; the independent worker owns only the existing engineering
  queue kind and can continue with the HTTP preview stopped.
- Current candidate must be ready, then public readiness must report its exact
  runtime ID after Nginx reload. Failures retain/restore previous routing. The
  bounded watchdog only falls back to a healthy retained runtime, no model call,
  no database restore. Updater's shared lock is reused; managed-runtime guards
  prevent competing in-place native updates/migrations.
- New Admin engineering page reuses ServerShell/unlock, current tokens, RTL,
  scoped CSS, policy/skills, budget/history/checks/diff/PR, separate deployment,
  rollback and repair confirmations. Setup unavailable is an honest blocked state.

## Executed verification

Local owned Linux UID1000, no dotenv, separate PostgreSQL and synthetic actors;
no owner/customer production data, paid provider or live GitHub credential used.

-174 migrations applied to an empty DB. Separate populated173→174 upgrade kept
  exact legacy User and Setting values; deleting that identity kept engineering
  history with a null relation. No destructive migration or money-state change.
-49 affected AI unit cases passed at the initial checkpoint. Final15 focused
  engineering cases cover paths, bounded plans/policy/knowledge, actual file
  hash/replay/symlink guards, private public-metadata omission, closed repair,
  promotion authority/merge/fallback without DB restore, native persistent unit
  identity/drift/reboot contract, actual-byte seal and control-plane target.
  Docker/systemd/GitHub deployment in these cases is recorded/mocked; temporary
  Git/files and the sealer are real.
- Registered native PostgreSQL scenario passed: canonical auth/unlock/Origin,
  other-admin/customer denials, CAS and strict audit rollback, request replay,
  one validation per unchanged source, bounded purpose routing, exact approval,
  code rollback, revocation/password reset/cancel/module-policy off, fixed repair
  and terminal host-fact reconciliation after revocation. Two isolated source
  faults (fresh authority preflight, explicit approval) triggered their intended
  assertions; restored source passed. An initial mutant returned no actor and
  was caught earlier; it was corrected to isolate the intended fresh-access guard.
- Actual browser password unlock and forwarding proved Server Panel returns
  the native-control root while engineering remains on the managed preview.
  Custom skill/tag typing, save/reload and enabled policy persisted. The actual
  compiled independent worker completed through real BackgroundJob and recorded
  HTTP provider while only the owned preview was stopped; owner local app stayed
  HTTP200. Exactly two development model requests, no repeat during polling.
  Actual UI required separate consent for recorded promotion and rollback.
- Independent worker bundle built and its `--check` connected to the isolated
  database using BackgroundJob. Initial full types, source/architecture/schema/
  manifest/security/audit checks passed. Final evidence is recorded below after
  the final source freeze; earlier passes are not a production release claim.

## Limits, adoption and rollback

The root host transport, native systemd/Nginx deployment, real GitHub PR/backup,
provider planning quality and production connectivity have not been exercised
on the owner's server. No full production build or signed release of this batch,
hosted workflow, actual promotion, schema downgrade or account quota test was
performed. Passing recorded transports does not establish those live properties.

Feature is off until explicitly enabled. Deployment also requires the reviewed
Ubuntu24.04+/Node22 host profile and independent root tools/worker from
[operator guide](../../AI-ENGINEERING-FA.md). Setup does not activate traffic or
migrate production. Unsupported hosts must be adapted by the operator first.
No schema/dependency/core authorization/AI control/host-config changes through
automatic coding; they use ordinary reviewed releases. No arbitrary terminal,
unattended code-changing incident monitor or claim of universal zero downtime.

Owner merges/deploys this feature. Install its additive migration through the
normal release path. Stop new work/disable policy before tool upgrades/revert;
finish/cancel active runs and retain audit/history. Code rollback only selects
compatible retained bytes/routing; it never overwrites new customer data. Retain
the old root tools and runtime until recovery is verified. Old build volumes and
release folders require explicit operator cleanup after checking active/previous
receipts; no automatic purge. Preserve unrelated local owner work and receipts.

## Final local evidence

- Final TypeScript, source2544, architecture, schema parity/money constraints,
  release-manifest8 releases/3 unreleased, security and audit gates passed. Final
  host corrections received the focused15 cases and syntax checks; no repeated
  full AI suite or production build after each edit. Source readability is
  explicitly normalized under broker umask0077 while Git/parent state remain
  private. Releases live outside the app-owned home. ISR uses the installed
  Next16.4.2 bounded memory cache for immutable managed code, with disk flushing
  preserved for native operation.
- Actual4 loaded1440/390 light/dark views: scoped WCAG axe0, no horizontal
  overflow or page errors; desktop/mobile captures visually inspected. Recorded
  fixed repair required a separate UI consent and completed through the real
  queue. Customer/missing-Origin403 and host-unavailable setup state passed.
  Total browser provider calls:2 development +1 repair; all recorded/no fees.
  Initial select locator included option text and timed out before creating a
  request; the scoped select fixed the harness without a product change.
- React Doctor:0 errors/14 reviewed warnings across5 affected React files;
  bounded form/history branching and existing ServerShell export patterns, no
  rule or baseline change.
- Scoped Semgrep: one reviewed unchanged test-only source loader new Function
  in scripts/ai.test.cjs (verified identical to HEAD); no new finding or errors.
  No zero-findings claim. Redacted changed-file Gitleaks found no leaks.
- Local source Graphify refreshed incrementally:16891 nodes,63194 edges,2543
  source files; zero semantic tokens. Graph evidence does not prove host runtime.
- Exact normalized tested source/script/config hashes and owned-resource cleanup
  receipts are retained in ignored .mobocom/ai-engineering. No synthetic auth
  cookie/env is part of the PR. Owner local app/PostgreSQL are preserved.

Final follow-up: the dedicated worker reclaims stale leases only for its selected
kind, verified on PostgreSQL with an unrelated running peer left unchanged. The
new active-runtime scheduling case passed independently after the15 focused cases;
final types passed. The worker was bundled from final source and its DB smoke
passed with a synthetic auth secret (the first smoke correctly refused a missing
secret; no product relaxation). Exact normalized hashes verified79 task files.
