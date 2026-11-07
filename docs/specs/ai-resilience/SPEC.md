# AI response, credential continuity and engineering rules

Owner: existing AI module; Settings/CAS/encryption, Notifications inbox, canonical
AuthZ/Audit and Engineering host remain the only shared owners. Risk R3.

Fix the personal ChatGPT reader to accept completed Responses JSON and bounded
SSE (including final snapshots) without accepting HTML, partial/error output or
replaying the request. Send explicit SSE Accept. Personal failure never switches
to paid API. No credentials or raw provider bodies in diagnostics.

Settings managers may opt into a pool of up to six named encrypted keys per
provider; custom pools bind to an exact normalized endpoint. Existing single-key
configs continue when their pool is off. Same provider/model/endpoint failover
only on explicit auth/quota/service HTTP rejection; no timeout/transport, invalid
success, refusal or ambiguous partial output replay. One120s overall budget;
at most six attempts. Persistent health/cooldown skips rejected keys; no claim to
know account balance or future health. Current pool version and scope rechecked
before each attempt. No available key means an honest error, never a legacy-key,
personal-account or cross-provider fallback. Managers can rotate/remove/disable/
reorder keys and reset cooldown; GET never calls providers. Public status hides
keys. Inbox alerts to current settings managers are local only, deduplicated per
failure episode; no unsolicited email/SMS/push. CAS and strict transactional audit
preserve concurrent settings and failure evidence. Module-off blocks mutations.

Engineering always pins mandatory MoboCom rules and a canonical source inventory;
custom skills cannot confer authority. Relevant documentation excerpts remain
bounded. Development cannot finish validation/publish without changes to the
canonical architecture/map/ledger and regenerated knowledge matching those docs.
Enforce that at the trusted host as well as the model boundary, not just a prompt.
No live edits, automatic merge/deploy or new host command authority.

No migration or dependency changes. Scoped typed Admin forms use current tokens,
RTL and password inputs. Acceptance: fragmented SSE/JSON/error/caps/cancellation;
same-provider failover/cooldown/credential encryption/late results/CAS and local
alert dedupe with native PG, public-vs-personal and existing permission guards;
actual Admin pool save/reload plus synthetic-provider recovery; knowledge budget
and missing architecture gate negative cases. Scoped types/architecture/source/
security, changed React Doctor and browser/a11y. No repeated whole release build.
