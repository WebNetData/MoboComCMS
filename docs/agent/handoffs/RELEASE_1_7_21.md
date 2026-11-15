# Release 1.7.21 — local preparation2026-11-15

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
Final canonical check/build/browser/artifact results remain pending below.
