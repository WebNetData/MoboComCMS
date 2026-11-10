# Google sign-in — handoff (2026-11-10)

Branch `feat/google-login-2026-11-10` from main `6d81b95c`. Decision record: [PLATFORM_DECISIONS › Google sign-in](../PLATFORM_DECISIONS.md#google-sign-in--2026-11-10).

## What exists
| Part | Where |
| --- | --- |
| Claims, chooser address, settings shape, reasons | `src/modules/identity/domain/google-login.ts` |
| Settings (encrypted secret, history), flow, accounts, ticket | `src/modules/identity/server/google-login.ts` |
| Routes | `GET /api/login/google` (`?intent=link`), `GET /api/login/google/callback`, `GET`/`DELETE /api/me/google`, `GET`/`PUT /api/admin/security?view=google` |
| Session provider | `google` in `src/modules/identity/auth.ts` (ticket → 2-step → session, once) |
| Pages | Button on `/login` and `/register`; return page `/login/google`; card in `/dashboard/profile`; card in `/admin/security` |
| Data | `User.googleId` (unique) / `googleEmail` / `googleLinkedAt`, migration `20270301120000_google_login` (unreleased) |
| Proxy | egress purpose `google` → `oauth2.googleapis.com`; `deploy/ubuntu/xray-config.cjs` purpose `google` |

## Owner setup
1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → **Web application**.
2. *Authorized redirect URIs*: the address shown on the Admin card (`<siteUrl>/api/login/google/callback`, HTTPS). Set the consent screen's app name, support email and the site's domain.
3. Admin › امنیت › «ورود و ثبت‌نام با گوگل»: paste the client ID and secret, tick «ورود با گوگل روشن باشد», save. Production needs `PANEL_CREDENTIAL_KEY` (as for AI keys).
4. A server in Iran usually cannot reach `oauth2.googleapis.com`: in Server Panel › proxy, route «ورود با گوگل» through a profile. Re-apply the root Xray helper from this release first; an older helper refuses the unknown purpose `google` with a visible error.

## Verified
- `scripts/google-login.connected.cjs` (native PostgreSQL, actual provider; only the token endpoint, site URL and cache are doubles) covers:
  - settings validation and encryption
  - a new account, the PKCE verifier and secret in the exchange, a single-use state and ticket
  - sign-in by `sub`; an existing email not joined; unverified email; closed sign-up; Google refusal; bad nonce/aud/iss/exp; token error; unreachable
  - a race on one state, the 2-step prompts keeping the ticket, a banned member
  - connect / already linked / other Google, and the disconnect guard
  - Owned rows are removed.
- `scripts/account-security.test.cjs` (claims, chooser address, settings, wiring), `scale.test.cjs` (strict-limit count), schema parity, release-migration manifest, scoped `tsc` of 16 files, architecture check.
- Local browser (`.mobocom/claude-tools/pw-google-login.cjs`), 14 checks passed:
  - Admin: setup, save, reload, the secret never sent back.
  - Profile: the connect button, the status API, a returned reason shown, cross-site connect and disconnect refused.
  - Visitor: the login and register buttons keep the destination; the start goes to Google with PKCE and an httpOnly SameSite=Lax state cookie; a return into another browser is refused; the refusal message; an invented ticket fails and leaves the address bar.
  - axe 0 in 9 views (Admin card, profile card, register, return page, login light/dark × 1440/390). No overflow, page errors 0.
  - It found and fixed a returned reason being erased by the status load.
  - The test setting, its 2 history and 3 audit rows were removed afterwards.

## Not verified
- A real Google round trip (needs the owner's OAuth client and a reachable or proxied Google).
- A production build. The migration has not been sealed into a release.
- No security email is sent on connect/disconnect (Telegram linking has none either).

## Audit 2026-11-10 (after merge)
- A connection now completes only while the member who started it is still signed in; the callback re-reads the session.
- Disconnecting uses the shared sign-in-methods rule (`identity/{domain,server}/sign-in-methods.ts`), the same as Telegram unlinking: actual ways in, never the account's age, checked under a row lock.
- A present `azp` must be this client.
- `google-login` is now registered in `scripts/run-pg-checks.cjs`.
- Report: `docs/agent/audits/2026-11-10-audit-identity.md`.
