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
