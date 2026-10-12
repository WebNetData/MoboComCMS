# Current paid installation entitlement

Use the existing Repository license map, signed certificates and canonical site origin. Capture the effective local entitlement before the authoritative online download. In the existing database-only install callback, read the current map and origin through the same transaction; reject removed/revoked/invalid product/site/signature, changed license identity/key/update window and corrupt maps. All successful package/index/receipt/audit writes roll back on rejection. No cloud request inside SQL; no new setting, schema, identity or parallel registry.

Preserve online download authority: cached offline-certificate expiry alone is not a revocation, and benign certificate renewal, transient unreachable status and unrelated license entries remain compatible. Exact effective update-window changes prompt retry; no new requirement that an old perpetual release have a future updatesUntil. Default siteBaseUrl cache/fallback behavior remains unchanged; optional transaction reader bypasses cache and read-error fallback.

Acceptance: controlled post-download changes deny without partial writes; successful renewal/expired cached certificates retain one canonical audit. PostgreSQL, restored safeguard faults, check/build and compiled real HTTP scenarios actually executed. Remote vendor changes after its download response remain outside this local snapshot.

[Evidence](../../agent/audits/2026-10-11-repository-entitlement.md).
