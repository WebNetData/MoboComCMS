# Scheduled game update publication

Goal: Keep future game updates and their download links private until their release time, including direct link requests.
Owner: `games` owns update scheduling and public read models; `media` owns protected link authorization.
Risk: R3 (public release/access boundary; no schema change).

Inputs / outputs: A game update with `releasedAt > now` stays in admin editing but is absent from public detail/timeline and its direct media link returns 404. Due updates keep their existing access/paywall gates.
Invariants: Parent game must itself be published; admin may plan future releases; base game links stay available under existing rules; no premature version label.
Allowed scope: Game public update read, media-link owner gate, version sync on admin save, focused connected proof.
Forbidden drift: New release model, changed URLs, download-protection bypass, unrelated media changes.
Failure/race cases: Direct stale link, scheduled release passing without a deploy, parent scheduled publication, formerly scheduled version in stored game row.
Proof required: Focused live PostgreSQL/API check before and after release date, type/source/architecture/security checks and PostgreSQL build.
