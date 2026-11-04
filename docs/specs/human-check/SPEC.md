# Human check (captcha) for sign-in and every user write — spec

Owner request 2026-11-04: a captcha or bot protection for sign-in, comments, the forum and every place a user can
publish. Owner accepted the defaults: a built-in check that needs no outside service (works on Iranian networks),
Cloudflare Turnstile as the alternative, a hidden honeypot and a minimum fill time, switchable per place from Admin.

## Owner and boundaries

- Identity owns it, next to the existing Turnstile check (`src/modules/identity/server/turnstile.ts`) and the sign-in
  security policy screen (`/admin/security`, `settings.manage`). No second security settings system.
- Pure rules: `src/modules/identity/domain/human-check.ts` (places, settings normalisation, difficulty, proof check).
- Server: `src/modules/identity/server/human-check.ts` (settings in `Setting` key `security.human-check.v1`, signed
  challenges, verification, single use). Public `GET /api/human-check?surface=` issues a challenge.
- Client: `src/components/HumanCheck.tsx` (widget and `useHumanCheck` hook), `src/shared/security/sha256.ts`.
- Each write keeps its owner: the owning route asks `verifyHuman(token, headers, surface)` before its own rules.

## Places (surfaces)

| Surface | Writes |
| --- | --- |
| `login` | password sign-in, email code, SMS code request |
| `register` | registration |
| `recovery` | password reset request |
| `comment` | magazine comments |
| `review` | reviews of items, product questions |
| `forum` | new thread, reply |
| `community` | community post, comment |
| `form` | public forms, newsletter signup, copyright report |
| `message` | live chat started by a visitor |

## Built-in check

- Challenge: `base64url(JSON{v,s,r,b,i,e}) + "." + base64url(HMAC-SHA256)`; `s` surface, `r` 16 random bytes, `b`
  difficulty bits (low 14, normal 16, high 18), `i` issued, `e` expiry (10 minutes). Key derived from the auth secret.
- The browser finds a number `n` so that `SHA-256(r + ":" + n)` starts with `b` zero bits and sends
  `challenge.n`. A filled honeypot appends `.hp` and is refused.
- The server checks the signature, surface, expiry, the minimum time since issue (0 s for sign-in places, 3 s for
  content), the proof, and records `r` once (`HumanCheckUse`, additive migration) so a solved challenge is single use.

## Providers and compatibility

- `builtin` (default), `turnstile` (only when `TURNSTILE_SECRET_KEY` and the site key are configured; used for sign-in
  places, content places still use the built-in check because the page policy allows Cloudflare only on sign-in pages),
  `off`. With no saved settings and Turnstile configured, sign-in keeps Turnstile as before.
- Existing request fields stay: sign-in forms send `turnstileToken`; content forms send `humanCheck`.
- A refused check answers 400 with `code: 'HUMAN_CHECK'`; the widget fetches a new challenge.

## Proof required

Unit tests (rules, SHA-256 against Node, tokens: wrong signature/surface/expiry/too fast/weak proof/honeypot), a
connected PostgreSQL script (single use under concurrency, settings, real routes refusing without a proof and accepting
with one), full check, browser walk of sign-in and one content form with the built-in check.

## Continuation

[HUMAN_CHECK](../../agent/handoffs/HUMAN_CHECK.md) records the completed draft and verification; [operator guide](../../HUMAN-CHECK-FA.md). Settings use existing transactional history/If-Match/strict audit. Chat exemption requires a real open conversation. Internal OTP surface entry composes login OR registration without account enumeration. Widgets wait for minimum fill time, renew before expiry and after network errors.
