# Mobile and email code entry

## Mobile registration and first-use password — 2026-11-03

Continue existing Identity/SMS/NextAuth/profile-completion/reset owners. Normal
`/register` uses mobile OTP, then the same account completes first name, family
name, a confirmed password and optional email in `/welcome`. Existing customers,
special referral/Telegram entry URLs and legacy provider/API contracts remain.
Password login accepts normalized verified mobile or email through the existing
credentials provider, with the same strict throttles, TOTP and standing checks.

Add a public-by-default false `passwordSetupRequired` flag to User; only newly
created mobile OTP accounts start true. Do not reset or reassign existing users.
Pending setup always asks for names/password, including when ordinary custom-field
enforcement is off. Email stays optional for this minimum step; existing enabled
custom fields still use the Admin profile-field owner. Claim the flag, verified
phone and current account standing when saving the first password; hash it,
record completion and invalidate older sessions atomically. Do not provide a
general password-reset endpoint on an ordinary authenticated profile request.
After setup, sign in with the new password and preserve safe `next`.

The initial-password step is consumed once. Invalid confirmation/weak password,
duplicate email, a stale concurrent submission or a revoked account must not
partly change identity. A password reset clears the pending flag and keeps its
existing SMS/email proof, TOTP, expiry, replay and session-revocation rules.
Forgot-password exposes only configured delivery channels and remains generic
for unknown accounts; normalize Persian/Arabic digits consistently.

Use current themed auth controls/SDS tokens, named errors/loading/retry, RTL,
keyboard and 1440/390 light/dark acceptance. No hosted Actions or real provider
sends are authorized by local tests. Add native `mobile-account-entry` checks:
actual OTP provider→new account→completion→phone/email password sign-in, SMS and
email reset, existing account preservation, claims/replay, inactive/restricted
identities and TOTP. Deliberately bypass the setup claim and verified-phone
lookup and verify failure. Register the new additive migration and retain the
previous schema on rollback; no destructive down migration.

Owner request 2026-10-15: register/sign in with a mobile one-time code, with email available too. Existing SMS LOGIN/VERIFY/RESET, NextAuth JWT, password/Telegram providers, profile completion and TOTP remain canonical. Email code login is the verified missing slice; existing SMS entry needs registration discovery, current availability checks and concurrency hardening.

- Identity owns email entry; reuse OtpCode with an additive nullable email/index, not another token/user/session store. SMS retains its provider and current API.
- Six cryptographically random digits, HMAC at rest, two-minute lifetime, five attempts, one-minute resend, strict IP/recipient limits. Latest challenge only; consume with an expected-state claim, including expiry/attempt budget. Resending invalidates prior codes. Delivery failure burns the challenge; never return or persist plaintext codes in application logs.
- Anonymous visitor chooses mobile/email, proves possession, then enters the existing account or creates one CUSTOMER. Never auto-link unverified profile phones or merge accounts based on entered details. Bind an emailed challenge to the account present at issue time; identity changes require a fresh challenge. Existing TOTP/backup challenge still follows the first factor; disabled/banned/globally restricted accounts cannot obtain a session.
- Email uses existing SMTP, independent of marketing/notification consent. `security.policy.v1.emailOtp` (settings.manage) governs email intake and verification; existing sms.config.v1.otpLogin governs SMS. Both methods require configured delivery in production. Password/Telegram remain available; special referral/Telegram registration URLs retain their existing flow.
- `/api/login/email-code` POST uses existing Origin middleware and Turnstile login action, returns display/expiry/resend only. NextAuth `email-otp` consumes via the existing credentials/JWT flow. No new permission or API exemption.
- Existing /login and /register use shared themed controls. Code input accepts Persian/Arabic digits, paste/autocomplete, change-recipient, resend with fresh CAPTCHA, loading/errors; preserve safe next/profile-completion behavior and legacy password signup.
- Migration is additive and registered; do not rewrite old SMS rows or user history. No remote delivery certification without configured providers. Test actual PostgreSQL challenge claims/replay/races/limits/provider denial/TOTP/current identity, deliberate faults, unit gates and browser light/dark1440/390. Keep fixtures local and clean them up.

Delivery branch starts above open PR189 to retain the tested local stack; a future PR must account for its merge state. No automatic hosted Actions or merge.
