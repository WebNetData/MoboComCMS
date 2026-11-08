# Chat web bulk content and image production

Owner: existing AI domain; browser bridge is the only generation transport.
Assistant routing/Work/Codex/public support remain unchanged. Prior editor bridge
PR377 is the prerequisite. No inference API or automatic fallback. Personal Chat
UI/account/image availability and terms still apply; no free/unlimited promise.

Audit: canonical Journal createJournalPost, Catalog createCatalogProduct and Site
createPage already provide transactional creation/revisions. Media importData
already validates/reencodes/registers public image bytes. Reuse these owners.
Operations background queue is for server-owned work; this browser-driven production
has its own domain batches/items, not a second shared queue or identity system.

Outcome: /admin/ai/production accepts1–50 explicit topics with per-item facts and
exact product price/stock; category assignment, length, tone, keywords, instructions,
image style/ratio, cover and0–3 inline illustrations. Kinds post/product/page.
No fabricated factual product features/prices, no new content domains by analogy.
Results are reviewed then saved as DRAFT/inactive through existing owners; normal
publication remains separate. Canonical documents include semantic section and
content.image blocks when the block editor is enabled; legacy HTML otherwise.

Actors: canonical toolById create permission per target, current ADMIN standing,
own batch only, same module guards on every action and again at transactional
save. Settings managers do not automatically receive another section's authority.
No customer/support access to personal browser account. Categories are real and
revalidated at creation/save. Product kind/category/required attributes checked by
Catalog; unsupported category requirements are refused, never silently bypassed.

State: additive AiProductionBatch/AiProductionItem relational models with actor,
immutable typed config/seeds, versioned state, output, local-media references and
short claims. One step text then one image at a time. Server persists all results;
browser closing never loses completed steps. Expired/failed steps require explicit
retry, no generation replay. Claim token fences late output, stop/revoke/concurrent
tabs; save receipt is atomic with content creation and idempotent. Cancel never
deletes already saved content or media. Resume cannot replay saved items.

Private v1 /api/admin/ai/production and image endpoint: module, exact section/actor,
Origin, strict rate/body/read caps, no-store, bounded schema/actions. No OAuth
credentials in protocol. Extension v2 adds capability negotiation, production page
allowlist and IMAGE capture from only the owned fresh assistant turn's rendered
bitmap via canvas. No arbitrary source fetch/private model API/cookie export.
One model request per image; error/timeout/captcha stops the batch, retry explicit.

Admin UX: settings on left/RTL semantic tokens, topic rows, persistent batch list,
per-item text/images preview and errors, serial progress/stop/resume/retry/review
save, links to saved content and Library. No polling when idle; browser/extension
must remain open for generation; server does not claim unattended execution.

Compatibility: two schema definitions mirrored, additive177th migration listed
unreleased. Existing176 migration hashes/rows unchanged. Disable preserves batches,
content/media; code rollback leaves additive tables. Extension update/install is
explicit. Validation: focused units, native empty+populated PostgreSQL claims,
atomic save/double-complete/revocation/image-byte validation; actual extension DOM
fixtures and Admin flow/RTL responsive/a11y. Real ChatGPT login/image availability
must be verified by operator, never inferred from controlled fixtures. Owner merges
and deploys; immutable1.7.9 untouched; no hosted workflow dispatch.
