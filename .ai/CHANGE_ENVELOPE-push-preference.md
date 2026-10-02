# Push alert preference

Goal: Let a member opt out of account web-push copies while retaining the private inbox.
Owner: identity/profile persists the preference; push enforces it at delivery.
Risk: R3 (additive User migration and account-level delivery permission).

Inputs / outputs:
- Authenticated `/api/profile` GET/PATCH exposes a boolean `pushAlerts`.
- The profile page presents a switch; `pushToUser` reads current account status and preference.

Invariants:
- Existing users default to receiving account push copies, preserving prior behavior.
- SMS, email, inbox rows, and admin push campaigns keep their existing contracts.
- Banned users and opted-out members receive no account push copy.

Allowed scope: User schema and migration, existing profile API/UI, account push delivery, focused checks.
Forbidden drift: A second preferences table, background delivery refactor, or visual theme replacement.
Failure / race cases: Invalid PATCH value returns 400; a delivery uses the current stored preference when it begins.
Proof required: schema parity and local migration; opt-out/disabled unit check; authenticated browser persistence and dark visual check; static checks and PostgreSQL build.
