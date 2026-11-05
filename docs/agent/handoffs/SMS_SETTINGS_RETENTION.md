# SMS settings retention — 2026-11-05

Owner: existing SMS server/domain and `/admin/sms`, Setting `sms.config.v1`.
Branch `fix/sms-settings-retention-2026-11-05` from merged main `56850f43` (1.7.6).
Risk R3: credential/settings retention. No schema, provider protocol, dependency,
identity, permission or public visual change. Preserve stored secrets and settings;
only existing SMS owners write/send, with canonical settings permission and Origin.

## Findings and changes

The owner can read credit but gets the inactive-panel message when sending. They
report a successful save followed by empty key/sender inputs. The password input
intentionally clears and shows a masked stored key; an empty sender is a defect.

- The first browser attempt reproduced HTTP200 save with the actual stored flag
  false and sender empty. Initial GET/action reloads could overwrite form edits.
  Local draft versions now reject stale GET/save responses, and action reloads
  preserve edits. Changes typed during a save remain visibly unsaved.
- A250-character key encrypts to a380-character envelope. Reading it through the
  form's300-character input limit truncated the ciphertext. Persisted ciphertext
  now stays byte-for-byte intact; actual user input still uses the existing
  normalizer. AES-GCM and masked public output remain with the credential owner.
- Invalid sender normalization used to silently clear the line and report success.
  Invalid senders and enabling without sender/key are rejected before writing.
  Database/JSON read failures never become empty writable defaults. Readiness and
  hasKey require a decryptable key; manual errors distinguish disabled sending,
  unreadable key and missing sender. PUT returns the validation error to the form.

## Executed evidence

- Three new targeted regressions failed against old code and passed after fixing
  it. Existing payments/SMS file:11/11, Linux Node22/UID1000 without `.env`.
- Dedicated empty PostgreSQL applied171 migrations. Registered native
  `sms-settings`, `identity-otp`, `mobile-account-entry` passed. Actual crypto and
  database prove long-key save/read/masked resave, canonical sender, locally
  recorded manual delivery, invalid-save preservation and corrupt-read refusal.
  New fixture cleanup claims the exact last value and preserves concurrent work.
- Actual Edge save/reload retains enabled/sender and a masked250-character key;
  credit check preserves draft; invalid sender400 leaves persisted config intact;
  missing Origin and anonymous access403. Four1440/390 light/dark screenshots
  reviewed, no overflow, scoped axe0 and no page errors. The final browser flow
  passed after adding draft-version protection to the failed first attempt.
- Final TypeScript, architecture, source and security contracts passed. React
  Doctor on the affected page:0 errors. Scoped two-rule Semgrep on3 runtime files
  and redacted Gitleaks on6 code/test files:0 findings. All6 normalized final hashes
  match the tested Linux source; ignored evidence: `.mobocom/sms-settings/`.

No full release rebuild/repeated full-site suite, hosted workflow or production
deployment is claimed. Real IPPanel delivery was not attempted: native provider
delivery and browser credit were recording doubles, while database, crypto, API
save/read, browser state and access/Origin guards were real.

## Adoption and rollback

Owner merges to main; existing1.7.6 assets/tag stay unchanged. A later release is
required for normal adoption; the owner's installed site does not yet contain the
fix. If an earlier save already truncated a key or cleared a sender, enter the
original key and sender once after updating. Do not send the key in chat or change
`PANEL_CREDENTIAL_KEY`. Lost bytes cannot be reconstructed from a truncated value.
No migration/backfill or automatic credential repair. Rollback code preserves rows.
