# Audit 2026-11-10 — identity and sign-in (items 1–3)

Base: main `620472bc` (1.7.15 + PR #415–#418). Branch `fix/audit-p0-2026-11-10`.
Environment: local `mobocom-app` (Node 22, Next 16 dev) on PostgreSQL `mobocom-postgres`; tests run inside the container.

## 1. Staff 2-step rule read fail-open — P0 — **confirmed, fixed**

- **Where:** `src/modules/identity/server/access.ts` `adminTwoFactorRequired` (base lines 23–36).
- **Cause:** on the ordinary path a failed database read was caught as "no row", and corrupt JSON was read as `required = false`, cached for 30 s. An unreadable "staff must use 2-step" policy let staff without 2-step through. The transactional path already threw.
- **Reproduction:** `scripts/account-security.test.cjs` › "the staff 2-step rule fails safe" failed on base (`unreadable policy {"requireAdmin2fa":tru counts as on`).
- **Change:** `staffTwoFactorRule` (`identity/domain/account-security.ts`) separates the cases:

  | Case | Result |
  | --- | --- |
  | No row | off (never switched on) |
  | Valid value | its flag |
  | Unreadable value | on, logged as `security.policy.unreadable` |

  A failed database read counts as on, is logged and is not cached. The transactional path still throws. Held-back staff can turn 2-step on at `/api/account/two-factor` (signed-in member only), so this is no lockout.
- **Tests run:**
  - unit: no row, off, on, staff with 2-step, member, four corrupt shapes, database error not cached, transaction throws;
  - native PostgreSQL `scripts/admin-2fa-policy.connected.cjs`, all states plain and in a transaction, policy row restored.
  - Both pass. The token-path dependency test now allows the logger.
- **Effect elsewhere:** every caller of `adminNeedsTwoFactor`/`requireAdmin`/`requirePerm` (AI engineering, imports, media library, queues, server archive, restrictions, editorial schedule) gets the safe answer. Valid policies behave as before.

## 2. Google connection: callback did not re-check the session — P0 — **confirmed, fixed**

- **Where:** `src/modules/identity/server/google-login.ts` `finishGoogleSignIn`; `server/http/google.ts` `GET_callback`.
- **Cause:** a connection (`intent=link`) stored the starting member's id; the callback connected the Google account chosen at Google to that id without checking who is signed in now.
  - On a shared browser, member A starts connecting and signs out, then B signs in or just completes the Google step. B's Google account is connected to A, so B can then sign in as A.
- **Reproduction:** `scripts/google-login.connected.cjs`: a connection finished with nobody signed in was accepted on base ("Missing expected rejection: not-allowed").
- **Change:** the callback reads the current member (`requireUser`). The connection completes only when it is the member who started it; otherwise `not-allowed` is returned before Google is asked. The flow is already used up, so it cannot be retried.
- **Evaluated, no change needed:**
  - `Sec-Fetch-Site`: a browser without it can start a connection, but only its own signed-in member's choice at Google is connected.
  - state: kv, single use, bound to a httpOnly SameSite=Lax cookie on `/api/login/google`; races tested.
  - nonce and PKCE S256: verifier checked in the exchange.
  - Ticket: single use, survives the 2-step prompts; a race of two presentations gives one session.
- **ID token:** checked against OIDC Core 3.1.3.7 for the code flow:
  - issuer, audience, `azp` when there are several audiences, exp/iat, nonce, `sub`;
  - TLS from the token endpoint instead of signature, allowed by step 6.
  - Added step 5's SHOULD: a present `azp` must be this client. No vulnerability was claimed for the rest.
- **Not added (by instruction):** joining accounts by equal email.

## 3. Removing the last way in — P1 — **confirmed, fixed (Google and Telegram)**

- **Where:** `google-login.ts` `hasOtherWayIn` (base lines 241–244); `notifications/server/http/telegram/link/route.ts` `DELETE` had no check at all.
- **Cause:**
  - Google: an account older than its Google connection was assumed to have its own way in. Telegram, mobile, email-code and Google accounts all start with a random password, and email sign-up does not record when a password was chosen. So an old Telegram placeholder account could drop Google and be locked out.
  - Telegram: unlinking was never checked, so a Mini App account could lock itself out.
- **Reproduction:** native test: an old `@telegram.local` account with only Google could disconnect it.
- **Change:** `identity/{domain,server}/sign-in-methods.ts`. Ways in are:
  - a verified mobile, Telegram or Google;
  - a password the member set;
  - their own deliverable email, while the site can send it a code or a reset link (unknown counts as no).

  Removal checks and writes in one transaction holding the member's row (`FOR UPDATE`). Google and Telegram both use it. The Telegram card shows the reason.
- **Tests run:**
  - unit (`sign-in methods`): placeholder addresses, mobile, set password, Telegram, SMTP on/off, the age of an account;
  - native: Google-made account with SMTP off/on, old placeholder account, verified mobile, Google and Telegram removed at once (exactly one succeeds), last one refused (409).

## Checks for this PR

| Check | Result |
| --- | --- |
| `node --test scripts/account-security.test.cjs` | 35/35 |
| `node scripts/google-login.connected.cjs` (native PG) | all checks passed, owned rows removed |
| `node scripts/admin-2fa-policy.connected.cjs` (native PG) | all checks passed, policy row restored |
| `npm run test:site` (dev container) | 977 pass, 51 fail. Every failure is in the base's 53 environment set (installer/updater/bridge/Prisma engines); two base failures passed this time. |
| Scoped `tsc` (10 changed files) | exit 0 |
| `check-architecture.mjs` | OK |

Also: `run-pg-checks.cjs` now lists `google-login` (missing since #418) and `admin-2fa-policy`.

Not run: full `npm run check`, production build, hosted workflows (manual-only by owner decision).
