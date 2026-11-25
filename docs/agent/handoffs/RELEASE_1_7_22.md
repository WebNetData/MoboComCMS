# Release 1.7.22 — preparation2026-11-25

Owner explicitly requests1.7.22 for updating. PR490 is merged at main86697521;
release includes PR481–490 after1.7.21. Authoritative checkout
.mobocom/release-1.7.22, branch release/1.7.22. Other checkouts, shared app3000,
production data and prior releases/tags remain preserved. No hosted dispatch or
destination deployment is authorized/performed.

Preparation updates matching package/root lock version and operator guides,
seals11 migrations as1.7.22 and refreshes shipped canonical AI
knowledge. Dependencies and all previously shipped migration SQL/hashes are unchanged. Existing publisher
fingerprint70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93
is verified; private key stays outside Git/containers. Build/distribution use new
task-owned paths, never overwrite prior assets or rotate trust.

Local code/build/browser acceptance is complete below. Remaining release steps:
same-publisher signature/extraction/previous-updater admission, immutable draft
asset upload/re-download, owner merge and stable publication. Earlier Pay feature
tests are recorded in MOBOCOM_PAY, not substituted for this release's acceptance.

Migration217 requires matching settlement writer. Pause settlement writes/jobs,
take verified backup and apply schema+source together before resuming. An old
application-only rollback cannot safely write settlement rows under the new
guards. Disable new capabilities while preserving financial history; coordinated
restore/forward compatibility needs its own review. Actual sources/chain transfer
and destination hosting are not certified by local tests.

Stable/latest publication follows owner-merged release metadata and matching
validated source. Prepare concrete reviewed code/artifacts before requesting that
final owner action; preserve current authorization for all release preparation.

## Prepublication validation and repairs

No v1.7.22 release/tag/assets existed when correcting this candidate. The original
unpublished migration209 had removed207's linked-counter-customer wallet-tender
exception. This rejected both real new split sales and historical valid207 invoices
during upgrade. Corrected209 retains the pre-existing exception without permitting
guest wallet credit or Pay-collection wallet credit. Added incremental218 with the
same corrected constraint for installations already running pre-release main217.
The unpublished candidate was resealed; no signed/published migration was edited.
An installation already running the original209 should deploy218 rather than
editing its migration history. Pause settlement writers for217 as above.

voidOpenInvoice now handles a failed transactional credit release as creditOk:false;
the failed release still rolls back its amount claim, the invoice remains VOID and
the existing recovery worker retries once. Native invoice-void-settle passes its
financial race/failure/recovery cases. Schedule UI reuses JalaliDateInput and keeps
the existing local-time validation/UTC conversion, limits and quote invalidation.

Initial no.env canonical gate exposed two stale static assertions, a DB-backed
readiness call in a unit fixture and translation-audit false positives from local
terminal variable t. Fixed fixture coverage and renamed local terminal variables;
no phantom dictionary keys or guard exceptions. Focused116 unit checks passed.
Full default PostgreSQL inventory ran and exposed old custom source loaders,
publication fixture omissions and changed quarantine/preferences/packing rules.
Updated test-only fixtures to use current owners and real valid data rather than
weakening access/publication/money checks. Initial queue tests were skipped by the
release runner's ENGINEERING_RUN_ID; native checks omit that isolated-preview ID.
Corrected CRM/queue/editorial/taxonomy checks exercise the actual worker.

Executed isolated Linux Node22.23.3, UID1000, no.env, private NOSUPERUSER role:
fresh218 deployment; populated207→218 preserves Identity, Settings, Product/Order,
Invoice/Payment, WalletAccount and SMS/Forms/Popup rows byte-for-byte in their
original columns, including a historical linked-counter invoice with500 wallet
credit. Separate populated216→218 preserves IRR/USDT reserves, requested/approved/
paid settlements and allows completion of an old approval. Task databases are
mobocom_release_1722_check and mobocom_pay_test_release_1722{,_upgrade,_debug}.
They contain only synthetic owned fixtures. Shared app3000 and its DB are untouched.

React Doctor on three affected Pay components: exit0, no errors; seven existing
complexity/form preventDefault advisories reviewed, with no suppression/config
changes. Scoped Semgrep263 source targets exit0. Redacted Gitleaks404 changed files
found only the existing public RFC6238 test vector in account-security.test.cjs:147;
reviewed against the standard fixture, no live credential or baseline exemption.
Final source scan/test/build/browser/signature/publication receipts remain pending.

## Accepted local release source

Source commit d0336a6be97ab33675edf71b27989a2e0836c629; Windows-hosted Docker/Linux Node22.23.3,
UID1000 without.env. Canonical npm run check exit0 (95s): site1140/1140,
connected53/53, backup4/4, billing14/14, architecture/source/schema/release/money/
money-UI/security/audit/i18n/type gates pass. Fresh218 then full default native
PostgreSQL243/243 exit0 (703s); all11 optional Pay suites pass on a
separate owned DB. Optional updater-github refused its absent synthetic root-owned
host-protocol lab prerequisite; no bypass or false pass is recorded. Actual signed
1.7.22 admission by the1.7.21 verifier follows artifact creation.

Production build exit0 (425s), heap6144MB/two CPU affinity,114 static
pages; runtime storage tracing excludes mutable storage (952 manifests). Committed
source comparison:4554 matched inputs including CSS; only next-env.d.ts and
tsconfig.json are the expected build rewrites. Generated AI knowledge14/14 passes.
Production Edge browser49 accepted phone/tablet/desktop light/dark captures: axe0,
no horizontal overflow/page errors; drawer focus trap/Escape/backdrop/route/resize
and saved groups, shared Support ownership/guest denial, same account ticket,
Jalali time selection/focus and Admin settlement cards. Four card crops and mobile
drawer/calendar screenshots were visually reviewed. Browser harness corrections
were navigation order and completing synthetic profile/JWT role fields; no guard
was disabled. Independent read-only money review found no actionable defect.

Fresh218, populated207→218 (including500 counter wallet credit),216→218 and
original217→218 passed. The latter preserves the originally installed209 checksum
and invoice/wallet bytes, restores valid linked-counter wallet credit and directly
rejects guest and PAY_COLLECTION wallet credit. Source/fixture/API acceptance is
local; real bank sources, upstream receivers, on-chain transfer and destination
hosting were not commissioned. Artifact receipts remain in ignored task evidence.

## Signed candidate and final owner gate

Signed source f9689ac1c552934f5072b976e004937ad18fecb4;5100 packaged files match committed inventory. All10
assets were uploaded to the immutable candidate draft, re-downloaded over the
authenticated GitHub API and matched local byte counts/SHA-256. Both current and
1.7.21 verifiers accept the downloaded mbrelease with the original publisher key.
Installer syntax and embedded package/key equality pass;14 bundled canonical
documents verify after safe extraction. CLI upload stalled on the two large files;
eight valid uploads were retained, missing files uploaded directly over HTTP/1.1,
and every final asset reverified. No published asset/release was overwritten.

PR: https://github.com/WebNetData/MoboComCMS/pull/491
Draft: https://github.com/WebNetData/MoboComCMS/releases/tag/untagged-c5c8006ed22f2aa104b3
Remote stable/latest is intentionally still1.7.21 pending the owner's merge of491.
The signed source is f9689ac1; subsequent publication/cleanup records are documentation
only and do not change any accepted build input or artifact. No hosted workflow or
destination deployment occurred.

Cleanup completed: verified owned preview/tunnel stopped, local synthetic cookie/TLS
files removed, all five task-owned PostgreSQL databases and NOSUPERUSER role removed,
private Linux runtime removed. Shared app3000 still returns HTTP200; prior releases,
keys, databases/volumes, other worktrees and .serena tool state are preserved.

Next exact continuation after owner merge: run ignored
var/release-1722/publish-stable.cjs, which checks PR491 MERGED, fetches main without
changing old tags, verifies signed-source and review-record commits are ancestors,
checks all immutable remote assets again, then publishes stable/latest. Finally run
node var/release-1722/download-assets.cjs download-published and record its receipt.
Never rotate the publisher, overwrite assets or dispatch Actions. Owner performs
the destination update, with verified backup and settlement writers/workers paused
as instructed above.
