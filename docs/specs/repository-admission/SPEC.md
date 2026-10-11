# Download-time repository module and connection changes

Reuse the current public module projection/guard with an optional transaction reader; default request cache, known-module fail-closed behavior, dependency/mirror/legacy rules and unknown-id fallback remain intact. In the existing database-only Repository installation commit, recheck module and the current connection URL/public key/connection timestamp after HTTP download. A disable returns404; deleted/replaced connection409, before successful package/receipt/audit persistence. Preserve canonical configuration/identity owners and additive signatures. No new switch/guard resolver/registry or migrations.

Acceptance: actual post-admission disable/disconnect/key-change leaves no package/index/receipt/audit; cached initial module admission cannot bypass fresh guard; prior package/extension/AuthZ/receipt contracts pass. Deterministically delayed real HTTP downloads prove compiled behavior; original owned fixture settings and cache restored. Paid certificate/provider changes remain separate.

[Verified evidence](../../agent/audits/2026-10-11-repository-admission.md).
