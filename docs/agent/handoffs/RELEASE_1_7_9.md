# Release 1.7.9

Base: owner-merged PR375/main `81841abc5620ac0c63d7e19069ac35917cb00827`; identical validated runtime tree
to aa020c21, whose three automatic Checks passed. Existing AI_RESILIENCE feature
PostgreSQL/browser/security evidence is reused, with real owner account/network
verification left to the operator. Preserve unrelated workstate/.serena/public/demo.

Scope: version metadata, empty migration seal, operator/release notes only.
No runtime/dependency/schema changes. All176 published migrations remain immutable.
Build exact committed signed payload once as Linux Node22 UID1000 without dotenv;
check manifest/knowledge, trusted1.7.8 verifier/extractor admission, native data
continuity and production readiness. Do not repeat successful feature tests.

Original publisher fingerprint: 70ccde101ede265fc88789302b1a3303692883defc030593ddcc6672b67a1f93.
Output: ~/MoboCom-Releases/1.7.9. Verify signature/version/commit/extraction,
private/runtime exclusions, installer and all asset checksums. Draft assets are
not an update-ready stable release. Owner merges release PR; stable/latest only
after verified code is in main. No hosted workflow dispatch or production deploy.

The independent root engineering tool/worker requires operator upgrade to knowledge
protocol2 before fresh engineering work. Web update cannot grant that authority.
Pool storage requires the existing PANEL_CREDENTIAL_KEY; disabled pools retain
single-key behavior. See ../../releases/1.7.9.md for adoption/rollback.
Actual build/upgrade/smoke/source hashes/security/cleanup/publication receipts
belong to .mobocom/release-1.7.9 and final Release notes, not inferred from this plan.
