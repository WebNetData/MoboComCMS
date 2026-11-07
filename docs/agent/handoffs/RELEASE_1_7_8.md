# Release 1.7.8

Base: owner-merged main `262b2691fd71d5da3fb8b2efbb13bb95a47f1a59` (PR373),
whose tree equals validated `c1348c15`; includes PR372. All three final PR373
Checks passed. Feature browser/native PostgreSQL/security evidence remains in
[AI reliability](AI_CORE_SUPPORT_RELIABILITY.md) and
[ChatGPT](CHATGPT_ADMIN.md). Preserve the separate root checkout, local receipts,
`.serena` and owner demo files. Owner merges/deploys; no hosted workflow dispatch.

Release scope: version numbers, an empty1.7.8 migration seal and operator/release
notes. No runtime source, API, dependency, schema or published migration changes.
Existing canonical knowledge is retained. Release-specific validation checks
metadata/manifest and dependency equivalence; one production build on exact
committed source, signed artifact extraction/admission and1.7.7 data continuity,
followed by a production health/readiness smoke. Reuse successful feature/CI
checks; don't rerun the whole release stack for metadata edits.

Package committed HEAD with the original offline publisher fingerprint
`70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`.
Output: `~/MoboCom-Releases/1.7.8`. Verify signature/version/commit, strict
extraction, extracted source, no runtime/private data, installer/checksums and
every uploaded asset by re-download. Existing tags/assets are immutable.

Prepare concrete signed artifacts and the release-readiness PR before asking for
the owner's final merge. Stable/latest requires that verified tree in main; a
draft is not an update-ready stable release. Do not publish a second1.7.7.
Operator first adoption and rollback: [release notes](../../releases/1.7.8.md).
An old Git updater may require manual upload for this first update. No production
installation, real model request or customer message is part of release preparation.

Executed results, source hashes, artifact receipts, cleanup and final CI evidence
belong to `.mobocom/release-1.7.8` and GitHub Release notes; never infer completion
from this plan. No reverse migration/database reset is an application rollback.
