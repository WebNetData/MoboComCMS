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

Acceptance still pending: canonical local check UID1000/no.env, scoped connected
PG and populated207→218 preservation, exact committed production build and
production browser, same-publisher signature/extraction/previous-updater admission,
immutable asset publication and re-download verification. Earlier Pay feature
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
