# Cloud connection repair — 2026-11-26

Owner reports WHM reseller password rejected by a form labelled token and asks
for functioning host/server/domain APIs; registrars selected are nic.ir and
joker.com. Authoritative checkout `.mobocom/cloud-connectors`, branch
`fix/cloud-provider-connectivity-2026-11-26`, base merged main`c9355792`.
Existing Hosting catalog/Identity/Audit/secret encryption remain owners. Other
worktrees and unmerged Pay commit7e6b1ae9 are preserved independently.

Audit: only Hetzner connection check exists; CPANEL and all registrar entries
resolve PendingDriver. Hosting and Domain fulfillment is manual without a create
adapter. Source presence/HTTP200/login are not proof of resource provisioning.
Live WHM public TLS is valid; one read-only Basic listpkgs request returned403,
not successful authentication. Do not store credentials or response account data.

Implement real cPanel WHM connection with explicit API_TOKEN or PASSWORD, strict
WHM API1 success validation and safe package names for Admin configuration. Add
Joker DMAPI API-key/password login and logout through documented POST, plus
explicit status checks. Harden existing Hetzner transport. Investigate the
official IRNIC contract before enabling it; no guessed EPP client, CAPTCHA
scraping or nic.ir web-password automation. Preserve manual order processing.
Do not advertise register/create/renew merely because authentication works.

Existing hosting.manage/module guard owns Admin controls. No new identity,
permissions, schema, money states, dependencies, generic queue or network service.
Connection auth mode lives as a closed nonsecret field in existing provider.config;
password/token remains encrypted only in secret. Old CPANEL rows default to token.
Empty secret retains it only for the same destination/principal/auth type; require
fresh credentials on connection identity change. Clear stale checks and condition
completion on captured connection fields. Never return credentials/session IDs
or raw upstream errors to browser/Audit.

Hosting-owned HTTPS transport pins validated DNS, refuses redirects, invalid TLS,
userinfo and URL fragments, caps actual body bytes and total request time.
Fixed public APIs have fixed origins; private own-server endpoints require explicit
deployment allowlisting. Default deny loopback/link-local/reserved/private targets.
No automatic mutation retries. Real provider tests are read-only and separately
reported from local fixtures. Use existing MoboCom/SDS Admin surfaces, clear auth
labels/support limits, responsive labelled rows, pending/error/success state,
scoped Unslop polish, React Doctor and actual browser/axe1440/390 light/dark.

Acceptance: native hosting-catalog plus provider configuration concurrency,
credential encryption/redaction, no old-secret redirection, stale-check refusal;
unit transport TLS/redirect/cap and protocol fixtures; existing hosting
service/domain suites unchanged. No live account creation/domain registration,
payment, production settings or deployment. Record exact execution and limits in
the existing Hosting handoff; rollback this application slice retains data/config.
