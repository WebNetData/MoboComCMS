# Release 1.7.7

Base: owner-merged main `47877d6ea1b8155106c308118065f4caa3c5df6b` (PR370), including PR369 and its CI repair. Preserve the separate root checkout, local receipts and owner demo files. Owner merges/deploys; no production deployment or hosted workflow dispatch.

Scope: root version metadata, seal five additive migrations, release/operator notes and replace the two native CRM journey date fields with the existing `JalaliDateInput`. Values remain ISO days through the same typed change callback; no schema/dependency/permission change. The existing Persian-calendar regression exposed these fields in run42359953179; do not relax the checker.

Before packaging: run the existing failed calendar regression and release-specific metadata checks, then the current native check/build gates. Reuse run42359953179's successful full PostgreSQL/Redis checks and actual feature browser evidence; verify the five-migration upgrade against a disposable copy of the immutable1.7.6 source and check the changed calendar in a real local browser. Record exact executed results and source hashes with ignored release receipts and the final PR/Release notes, not as predictions here.

Package only committed source with the original offline publisher fingerprint `70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93`. Output: `~/MoboCom-Releases/1.7.7`. Verify version/commit/signature, bounded extraction, exact extracted source, absence of runtime data/secrets, installer checksum and every uploaded asset by re-download. Never overwrite published1.7.6 or earlier tags/assets.

Stable/latest requires the owner to merge the concrete release-readiness PR, preserving the signed tree. Prepare all artifacts before asking for that final step. Rollback and CRM queue-drain requirements: [release notes](../../releases/1.7.7.md). Installed data is never reset; app rollback does not reverse additive migrations.
