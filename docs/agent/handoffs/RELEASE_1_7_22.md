# Release 1.7.22 — preparation2026-11-25

Owner explicitly requests1.7.22 for updating. PR490 is merged at main86697521;
release includes PR481–490 after1.7.21. Authoritative checkout
.mobocom/release-1.7.22, branch release/1.7.22. Other checkouts, shared app3000,
production data and prior releases/tags remain preserved. No hosted dispatch or
destination deployment is authorized/performed.

Preparation updates matching package/root lock version and operator guides,
seals10 already merged migrations as1.7.22 and refreshes shipped canonical AI
knowledge. Dependencies and migration SQL are unchanged. Existing publisher
fingerprint70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93
is verified; private key stays outside Git/containers. Build/distribution use new
task-owned paths, never overwrite prior assets or rotate trust.

Acceptance still pending: canonical local check UID1000/no.env, scoped connected
PG and populated207→217 preservation, exact committed production build and
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
