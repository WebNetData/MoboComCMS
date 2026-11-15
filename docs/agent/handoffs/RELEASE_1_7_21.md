# Release 1.7.21 — local preparation2026-11-15

Current acceptance: final production build from fe1e1ad1 passed in251s as
UID1000/no.env, heap6144MB,112 pages/928 trace manifests. All12 actual production
desktop1440/mobile390 light/dark popup-preview/repair-calendar/public-popup views
passed scoped axe with0 violations, no horizontal overflow or page errors.
Real repair due-date PATCH200, returned dueAt, Escape/focus restoration and guest
Admin403 passed. Rendered close/copy bounding-box clearance passed; inspected the
final mobile public popup and dark calendar images. Source proof includes all4298
non-document inputs and all CSS; only two expected Next-written files differ
after build. Subsequent release receipt/docs changes do not change those inputs.
Canonical checks/15 scoped PG suites and migration preservation below remain
accepted; the two final CSS-only fixes were validated by final build/browser.
Signing/publication/re-download evidence is the next step. Historical resource
and pending statements below are superseded by this current acceptance.

## Recovery and production verification checkpoint

This checkpoint supersedes the historical resource stop below. Owner authorized
cache cleanup. Removed only13 verified `wsl-crash-*.dmp` files from the Windows
Temp/wsl-crashes directory (13027106784 bytes); preserved text reports, personal
files, backups, Docker images/volumes and all databases. C: then had14203330560
bytes free. Restarted only verified Docker Desktop executables; normal Docker
API29.8.1 and the original container/localhost3000 readiness200 recovered.

Production build passed as UID1000/no.env in288s, heap6144MB, core dumps disabled
for the build child. All4298 non-document inputs matched77a8baf5 before build;
afterward only expected Next-written tsconfig.json/next-env.d.ts differed.
The first actual production browser run passed light repair/popup/public views
but found insufficient selected-day contrast in the dark calendar. The shared
calendar now uses its existing darkened-primary/white done-button pairing for
selected days. The next compile passed but Next's TypeScript file write failed
because the task's tar extraction left two build-written files root-owned; their
ownership was corrected, without source/guard changes. The complete committed
ed89d192 build then passed in236s,112 pages/928 trace manifests. Production browser
passed12 themed desktop/mobile views, scoped axe0, no overflow/page errors, real
date PATCH200, Escape/focus return and guest Admin403. Image review found the
text-only mobile popup's close button overlapped its badge; reserve64px above its
copy only when that layout has a close button. Final build/browser rerun pending.

Owner explicitly requests a local-system build and published1.7.21 for updating
their installation, without GitHub Actions. PR479 is owner-merged at main
0c5ed5fef57cfd11d2c6f03601142a8a35fe7e9a; release includes PR473–479 after1.7.20.
Authoritative release checkout `.mobocom/release-1.7.21`, branch release/1.7.21.
Existing feature checkout/app3000 and all unrelated worktrees remain preserved.

Preparation changes version/root-lock metadata, operator guides/notes, fixes the
stale AI side-guide Store paragraph identified in1.7.20, and seals the three
already merged additive migrations. No dependency or migration SQL change.
Keep original Ed25519 publisher fingerprint
70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93; no key rotation
or replacement of previous assets/tags. Private key stays outside Git/containers.

Required pending evidence: canonical local check in Linux as UID1000/no.env,
relevant fresh PostgreSQL checks,204→207 data-preserving migration, exact committed
production build and scoped production browser, signature/extraction/old-updater
admission, immutable asset upload and re-download verification. Stable/latest
requires owner-merged release metadata and matching source. Owner installs on the
destination; no destination deploy/restore or hosted dispatch is authorized here.

Private task receipts: `var/release-1721`, separate distribution directory and
`/tmp/mobocom-release-1721` in existing app container. Never ship environments,
cookies, private keys, local sample data, generated clients or private runtime.
Canonical14-document AI knowledge and architecture remain shipped. mbrelease is
signed source; destination makes its own Linux build. Record actual results,
failed attempts, exact signed commit and cleanup before handing off.

Release validation corrections: shared JalaliDateInput replaces the newly added
native datetime-local in RepairWorkPanel, retaining device-local ISO conversion
and mutation contract. Three test-only loaders/source-location assertions now
follow existing relative/JSON imports and canonical transactional category helper;
no assertion/guard was removed. Doctor0.9.17 on RepairWorkPanel:0 errors/five
reviewed existing fetch/complexity advisories. No package dependency change.

Fresh private npm ci (ignore scripts) passed in165s; private PostgreSQL client
generated. Actual204→207 upgrade preserved populated legacy SmsLog/FormSubmission/
SitePopup rows byte-equivalent excluding added columns, identity/Setting and
wallet123456 minor units; all new defaults correct.15 scoped native PG suites
passed (SMS delivery/settings/workflows, repair approval/tracking/invoice, modular
capabilities/module availability, admin users/AI admin/AI operations, popups,
Media, package CRUD/integrity). First run inherited production NEXTAUTH_URL and
five token-cookie fixtures were403; test runner changed only its own test env to
the fixtures' HTTP cookie contract and rerun passed. Production guards unchanged.

Initial canonical check1104 cases:1062pass/41fail/1skip.36 failures required
missing Git tooling; the remaining failures were the three obsolete loaders/
source assertions and native repair date field above. Git/PostgreSQL CLI installed
in the existing local container for release tests; source/deps/app3000 untouched.
Final canonical check passed in78s as UID1000 with no.env/database credentials:
site1104/1104, connected53/53, backup4/4 and billing14/14, with full types and
architecture/source/schema/money/security/audit/i18n/generated gates. The second
attempt had13 failures: one last source-assertion edit had not yet reached the
runtime, and12 updater health fixtures required missing curl; Git/curl/Python/PG
CLI were supplied without changing guards. The third complete run is accepted.
No test was skipped in that accepted canonical run.

All4298 non-document build/source inputs matched the committed source before
production compilation, including all CSS. The first build invocation coincided
with Windows memory exhaustion while static scanners ran; Docker exec was
interrupted and no completed build result existed. Existing container recovered
with its source/storage; no source failure was inferred. Build and scanners now
run sequentially. No scanners from that failed attempt are claimed passed.
Final production/browser/artifact results remain pending below.

## Resource stop and exact continuation —2026-11-15

Release remains **unpublished**; [PR480](https://github.com/WebNetData/MoboComCMS/pull/480)
is a draft for the prepared version/seal/calendar/test fixes. No tag or release
asset was created. Completed gates above remain valid; production build has not
passed and must not be represented as ready for updating.

Observed local failures: Docker Desktop exec transport was interrupted twice;
the standard desktop restart timed out while its processes remained active.
Existing Linux app namespace was verified and a task-only WSL/nsenter transport
continued as UID1000 in the same container (PID686 at this checkpoint). Small
independent runners are ignored under var/release-1721; verify current process
identity before reusing that PID. Production heap2560/3584/4096 attempts then
reported Node heap OOM; the last detached4096 attempt exited1 after219s. No
completed BUILD_ID/production smoke/signature claim. A user-turn interruption
also lost a foreground tool session; detached build results are authoritative.

Windows C: was independently measured at0 bytes free, D: at767033344 bytes.
Host file writes returned ENOSPC, explaining truncated task helpers and failed
file copies; memory pressure and file failures must not be labelled source bugs.
Deleted only two exact reproducible release tar archives (source.tar and
build-source.tar, each54169600 bytes) after verifying their resolved paths under
this task workspace. About97MB became free; recovery backups/private prior
artifacts/user files remain. Source tar copies inside the isolated runtime still
exist. Owner was asked to free at least10GB on C: before continuation.

Existing container-internal app readiness200 was checked through the same
namespace; Windows localhost3000 was unavailable after Docker Desktop's failed
restart. Recover Desktop transport/port after disk is available; never replace
the app image/container/volumes or reset the working database. Isolated release
database mobocom_release_1721_check, private environments/dependencies and sentinel
fixtures are retained for continuation, not installed on the user's live DB.

Sequential low-memory static rerun: Semgrep one calendar component/one local
rule0 findings; Gitleaks over prepared changed files exited1 with one reviewed
finding in account-security.test.cjs:147. It is the existing RFC6238 test vector
(base32 of ASCII12345678901234567890), already in main, not a live credential.
No ignore/baseline changed and this scan is not called0 findings. Earlier parallel
scanners failed under Windows memory pressure; they are not successful scans.

Next exact actions after space recovery: verify task source/runtime and current
container identity; restore normal Docker transport/localhost3000; run detached
production build with adequate heap (review5–6GB plus actual available memory,
no check bypass), then scoped production repair-calendar/popup/browser. Record
results and compare4298 build inputs; finish release notes/PR480, same original
publisher signed package/extraction/old-updater verifier and installer syntax.
Owner merges release metadata before stable/latest. Download every uploaded
asset and reverify hashes/signature. Clean only owned task runtime/DB/private
cookies after acceptance. No GitHub Actions, destination deployment, private-key
copy, tag mutation or published-release replacement is authorized or performed.
