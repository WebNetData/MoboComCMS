# Global authentication restrictions — bounded foundation

## Implementation and compatibility

Fresh-main delivery branch `feat/autonomous-foundation-2026-10-10`, base `8a3bc9f`, follows foundation commit `8722e41`. Extend canonical Identity facts and existing authentication owners; no parallel resolver, new permission, migration, URL, setting or presentation change.

- `identity/server/authentication-restrictions.ts` reads active GLOBAL facts and canonical `deniedCapabilities` for `identity.authenticate`. It has only database/domain dependencies. Every decision is fresh; no cache or implicit full-admin exemption. Storage/validation failure propagates instead of authenticating. MODULE restrictions and unrelated capabilities do not deny authentication.
- `requireUser` retains current standing, current role/permissions and password-change checks. NextAuth `signIn` checks current standing/restriction for every provider; new and existing JWT callbacks recheck restrictions. A normal sign-in denial uses `AccessDenied`; existing restricted sessions follow the existing `SESSION_REVOKED` cleanup behavior.
- Existing hashed/legacy API-key resolution and session fallback consume the same facts. Denied hashed-key calls do not increment successful usage. Session fallback also reads current account standing. Stored credentials and key lifetime remain intact.

A check cannot cancel an already-running operation. This foundation does not enable GLOBAL issuance, revocation or history Admin commands. Those require the existing `users.manage`, canonical staff guard, subject lock, strict audit and claimed revocation. Do not widen the forum manager's authority or reinterpret a legacy User ban.

## Executed validation

All application gates below ran in the owned disposable PostgreSQL/Redis fixture as uid1000, without a repository `.env`; root was used only to repair ownership of three copied fixture files before fault injection.

| Check | Verified result / ignored raw log |
| --- | --- |
| Connected PostgreSQL | `global-authentication`, existing `scoped-restrictions`, `forum-staff-sanctions` passed; `restrictions-1791680122199-42460.log` |
| Connected after final fault restoration | Passed; `restrictions-1791680386355-20120.log` |
| Final `npm run check` | Native exit0; 581 site, 53 connected-adapter, 4 backup tests =638, plus architecture/source/schema/manifest/security/type gates; `restrictions-1791680124585-31344.log` |
| Final production build | Native exit0,82 static pages; existing CSS autoprefixer warnings retained; `restrictions-1791680124578-38280.log` |
| Final compiled HTTPS browser | Global authentication plus existing security suite:5 passed,0 failures/skips/retries; `restrictions-1791680387448-34988.log` |
| Deliberate defects | Wrong GLOBAL/MODULE selection, omitted JWT guard, omitted key denial each failed the connected test; exact bytes restored; `restrictions-1791680384451-30288.log` |
| Diff | Scoped whitespace check passed; reviewed exact feature files only |

The connected test uses real restriction/user/key rows, real signed-cookie decoding and actual production functions. It proves independent subjects, module isolation, unrelated capabilities, overlapping records and individual revocation, scheduled start/exclusive expiry, full-access fact denial, existing/new JWTs, current standing and fail-closed storage. Fixture row updates do not prove an authorized future global Admin API. PostgreSQL evidence is not a claim that a global SQLite test ran.

The compiled browser uses real password verification, CSRF cookie, NextAuth callbacks, `/api/me`, `/api/v1/me` and a real bearer key. It rejects a stale cookie and correct-password login during restriction, then proves restored login/key access after individual revocation. The existing `publicApiEnabled` fixture setting is prepared and its exact prior row restored with a claim; no production setting is touched. Normal sign-in rejection is specifically checked for `AccessDenied` and absence of a 500 response. A public homepage opens without browser errors.

## Failed/intermediate attempts retained

- Initial public check:580/581 site tests passed; the raw-token startup-secret test rejected the newly added dependency. Updated only its explicit dependency adapter; actual authorization belongs to the connected test. Authentication reads were separated from mutation/audit/staff dependencies.
- First build was intentionally terminated before completion to apply that dependency refinement; it is not a successful build.
- The full browser run before the final sign-in refinement produced58 passes,7 fixture skips and1 failure: API availability was off, returning404 in the new test (`restrictions-1791679887958-36452.log`). No regression case failed. It is not a final all-green full run.
- The corrected targeted fixture exposed a real product flaw: JWT rejection during a normal correct-password login became500. Added the official sign-in denial callback while keeping the JWT race/existing-session guard, rebuilt and reran the final5 browser cases. The earlier one-case run is not evidence of a clean denial response.
- First fault injection lacked write access to copied fixture source; repaired only file ownership, then executed all tests as uid1000. No root gate or weakened assertion.

## Remaining real gaps and delivery

Global restrictions remain **PARTIAL**. Source-confirmed raw-token callers in ads/promo, repository/public and public form submission still need current-user composition and explicit anonymous behavior. Assess upload/download, contextual, real-time and user-acting jobs; preserve financial obligations/recovery and define narrow support/refund/recovery capabilities. Then add the protected global Admin issue/history/individual revoke workflow with actual API/browser actors and audit-outage/concurrency evidence.

The raw-token discovery above is the historical Slice2A checkpoint; [Slice2B subsequently closes those three HTTP consumers](2026-10-11-current-account-consumers.md). Broader workflow and rollout limits remain.

No global authentication files were copied into the root's older schema/client or user app on port3000. A safe main/schema/client rollout is still required. Existing functionality, history, protected owner files and root changes remain preserved. No GitHub Actions, push, PR or merge was performed for this slice. No production/provider certification or token-savings claim. The autonomous Goal remains active.
