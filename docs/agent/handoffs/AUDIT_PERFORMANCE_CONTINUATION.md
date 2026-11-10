# Audit continuation — security, Redis and performance — 2026-11-10

Owner authorized isolated production builds, a private bounded Redis fixture, request-safe Settings deduplication and an Admin-only CSS slice. No merge, release, deployment or production page-cache activation is authorized. The earlier four PRs remain open.

Independent CSS and evidence PR: [#425](https://github.com/WebNetData/MoboComCMS/pull/425), targeting `main`.

## Reviewed state and ownership

| Slice | Existing owner / PR | Continuation |
| --- | --- | --- |
| Staff 2-step, current Google-link session, last sign-in method | Identity; [#419](https://github.com/WebNetData/MoboComCMS/pull/419) | Existing changes independently passed account-security units and native `google-login` / `admin-2fa-policy` scenarios. No real Google account exchange performed. |
| Failed category recount after a successful save | Taxonomy / existing job queue; [#420](https://github.com/WebNetData/MoboComCMS/pull/420) | Native `taxonomy-recount` passes in the combined source. |
| Redis startup fallback / visibility | Platform cache and Operations monitor; [#421](https://github.com/WebNetData/MoboComCMS/pull/421) | Startup failure alone was insufficient; its runtime correction already exists in [#423](https://github.com/WebNetData/MoboComCMS/pull/423). Do not rebuild either implementation. |
| Redis runtime loss and return | Same KV facade; #423, currently based on #421 | Independent real Redis stop/restart: detected in **0 ms** after the stop marker, recovered in **501 ms** after the start marker. Real shared limits and 30-way/two-instance lock race passed. |
| Audit baseline | [#422](https://github.com/WebNetData/MoboComCMS/pull/422) | Documentation branch; no runtime patch needed for integration. |
| Repeated Setting reads | Existing Extension, Theme index, Store and Public API readers; [#424](https://github.com/WebNetData/MoboComCMS/pull/424) | React request cache only. Transactions / API handlers remain fresh; secrets and security policy were not moved into the 30-second shared cache. Six concurrency, next-request freshness, failure and mutable-result regressions pass. |
| Admin CSS | Billing invoice desk and Automation presentation | Independent branch from `main 620472bc`. Move only `.ivd-*` and `.am-*` definitions to the Admin layout; retain `.inv-*` customer deadline styles globally. No field, permission, editor, schema, route, registry or business-rule change. |

The Settings measurements recorded by Claude were homepage **16 → 10** Setting queries and **57 → 48** total statements; Products **16 → 10**, Blog **15 → 10**, Software **17 → 10**, Login **12 → 10** Setting queries. These are prior measurements from #424, not a newly repeated production query benchmark. This continuation independently re-ran its six unit scenarios and the native Extension/module guards.

## Redis alert evidence and limits

An additional real Redis + real PostgreSQL run exercised the actual `runOperationsMonitor`: healthy → warning → healthy. One outage notification was claimed, a second monitor pass did not duplicate it, and one recovery notification was claimed. Telegram transport was a recording double; **no message was sent to a real chat**, and provider delivery is not certified.

During a Redis outage strict limits continue counting locally. This is bounded fallback, **not a guaranteed cluster-wide limit**: N instances may admit up to N times the configured allowance; fallback counts are not merged back. A graceful server stop/restart was tested; hung TCP connections, failover clusters and sustained multi-instance production traffic were not. #423's dependency on #421 remains explicit; no PR was merged to validate it.

## Production builds and isolation

Combined backend source: `8092e65cad56b331ba693447cb474bac9ba0e049` (local integration of #419, #420, #421, #423 and #424). CSS-after source: `3fc2b4edab9964dc471f32fb735d2b88c9ec755e`.

[Build-only run 42874493217](https://github.com/WebNetData/MoboComCMS/actions/runs/42874493217) succeeded for **both** exact revisions, using Node 22, PostgreSQL Prisma client, 4 GiB heap and an unreachable dummy DB address. Downloaded artifacts were SHA256-verified before local browser use:

- Before: `3769b41c8d96f40234f388b9dbb328147c6e5a28feb0b4bc98b85dc7b92891e2`.
- After: `b6af459e574d28719e8402cc54aca7e9f18a6b9f35fd40728badcde67cdaa753`.

The temporary `test/audit-integration-2026-11-10` branch has a build-only version of `checks.yml`; **never merge that workflow into main**. The CSS product branch retains the original workflow. No hosted browser suite ran. The initial hosted attempt stopped at checkout because short SHAs were interpreted as refs; full immutable SHAs corrected the fixture.

The first local production build hit the fixture's cgroup memory limit and its worker was SIGKILLed. It did not pass and the limit was not raised further. Both successful builds ran off-host. Preview readiness remained HTTP 200.

Local checks used a separate checkout and private Docker network, a disposable PostgreSQL 17 instance (320 MiB), Redis 7 (64 MiB, 0.25 CPU, no persistence, read-only root, no published port) and a separate Node process. Dependencies were copied from a **read-only** mount; no writable Preview volume, database, Redis endpoint or source directory was reused. Only the HTTPS test proxy exposed a **127.0.0.1** port. Runtime jobs were off; session and invoice were synthetic fixture data.

## CSS scope and measured result

`invoice-desk.css` also contained the customer payment-deadline panel. Moving the whole file would break it. Keep those `.inv-*` declarations and their dark-mode colours in the root import, extract `.ivd-*` into `admin-invoice-desk.css`, and import that and `automation.css` from `app/admin/layout.tsx`.

Do **not** move `admin-uploads.css`, `store-admin.css` or `server-panel.css` wholesale: public Newsletter/editor, Seller/Business/Repository and Software consumers use their rules. Larger CSS savings require further owner-by-owner extraction.

| Observed page stylesheet payload | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Homepage, raw stylesheet text | 1,671,682 B | 1,652,044 B | 19,638 B (1.17%) |
| Homepage, sum of independently gzipped stylesheets | 311,430 B | 307,387 B | 4,043 B (1.30%) |
| Customer invoice, raw | 1,670,814 B | 1,651,176 B | 19,638 B |

These are actual compiled stylesheet bytes, not total page transfer or the earlier dev/source count. No CSS-specific FCP/LCP improvement is claimed.

Playwright inspected Home, Admin invoices, Admin automation and a real fixture customer invoice at **1440/390 × light/dark, Persian RTL**, on each compiled artifact. All **16 before/after screenshot pairs were pixel-identical**, with equal measured geometry/colours, no horizontal overflow and no page errors. Client Admin → Home navigation preserved public header styles in all four states; mobile invokes the existing AppLink handler because the protected shell hides that desktop action. The new maintained fresh-guest CSS test passed against the final artifact and checks that shared deadline rules remain while Admin desk/automation rules are absent. The existing public-style navigation probe now includes the shared deadline panel.

Scoped axe: 14/16 views had no violations on each artifact. Both dark Automation views retain the **same pre-existing colour-contrast violation** on four recipe chips. No accessibility regression was introduced; this is not a claim that the existing screen is fully compliant. React Doctor: 0 errors, 11 unchanged existing advisories in the two layouts; no suppressions or baseline changes.

## Guest page cache — staging only

`balanced` was enabled only in the disposable staging database, with edge caching and warming off, then switched back **off**. Production configuration was never touched.

Actual compiled HTTPS requests confirmed that session/chunked-session, cart, preview, sensitive query, RSC, Admin, Dashboard, invoice, checkout and private API requests bypass the page cache. Anonymous cached HTML contained no fixture account email; the private API denied the guest (401) and answered its owner (200) without caching. Light and dark variants stayed distinct. Nonexistent checkout/guest-private invoice returned 404 and were uncached; no real checkout/payment was made.

Eight warm, sequential, unthrottled homepage navigations per mode on the same isolated machine:

| Median | Off | Balanced |
| --- | ---: | ---: |
| TTFB | 26.5 ms | 6.0 ms |
| FCP | 92 ms | 76 ms |
| Observed LCP | 92 ms | 76 ms |

This is a small local fixture, not a production load test, Lighthouse result, field Core Web Vitals or a throughput/SLA claim. Custom session-aware pages/plugins, sustained load, multi-instance invalidation and the owner's real staging content still need operational evidence before proposing production activation. Historical 600/56 pages/s figures were not re-measured. Keep production page caching off without separate owner approval.

## Executed checks and continuation

- Final combined `npm run check`: exit 0; architecture/source/schema/migration/money/security/audit/i18n gates, **1039 site + 53 connected unit + 4 backup + 13 billing**, and full TypeScript. Linux UID 1000, no `.env`, no DB URL for the database-independent gate.
- Native default PostgreSQL batch: **202/202** passed after all migrations/seed on an empty disposable database. The runner's 14 explicitly optional isolated scenarios were not selected; do not describe them as passed.
- Real `rate-limit.redis.cjs`, runtime stop/restart, monitor warning/deduplication/recovery and Settings request-deduplication checks passed as described above.
- Scoped Semgrep: existing one dynamic-code rule, 7 actual runtime files, 0 findings/errors. Redacted Gitleaks on Identity sources: 0 leaks. These are scoped checks, not a whole-repository security certification.
- Initial unit run had one unrelated Xray builder-version failure caused by Windows CRLF in the copied `.cjs`. Copying the exact **unchanged git blob with LF** into the Linux fixture fixed the environment; final full check passes. No product code or assertion was weakened.

Ignored receipts, scripts, JSON results, logs and screenshots are in the original root `.mobocom/codex-audit-evidence`; test control is `.mobocom/codex-audit-lab.py`. Preserve the active Claude checkout's pre-existing workstate edit, `.serena`, demo assets and old bridge folders. Only task-owned containers/network, synthetic session and temporary artifacts may be cleaned up.

Rollback: revert the CSS commit to restore the original imports and combined invoice file; no migration or data rollback is needed. The pending security/Redis/Settings PRs remain separate. The owner reviews, merges and deploys; no new runtime release has been produced.

Final closure: the **second** complete PostgreSQL batch passed 202/202 on the final combined source, followed by `rate-limit.redis: ok`. Both maintained CSS browser regressions ran and passed without skips. Four task-owned containers, their private network, synthetic session files and TLS keys were removed after verifying their network and read-only bind mounts; evidence and worktrees remain. Original Preview readiness returned 200 after cleanup. PRs #419–#425 were verified open; no merge/release/deployment occurred.
