# Authoring and operations continuation

Continues commit `61087ae9` (PR197, owner merges). Work is isolated on `feat/authoring-operations-continuation-2026-10-18`; do not amend the published batch. Existing owners and public URLs remain authoritative.

## Requested slices

3. Restore content, append its ContentRevision and strict audit in the same owner transaction. Posts, pages, catalogue metadata and existing Media resources retain their section guards. A failed revision/audit, unique conflict or concurrent claim rolls back everything; search/hooks run after commit. Financial fields and ownership are never restored through catalogue history. Old scalar-only snapshots remain readable.
4. Reopen a decided moderation case only when its owner actually returns the item to review. Keep immutable prior-round decisions in the same Moderation owner, with additive migration/backfill. Current owner permission/scoping and claim rules remain authoritative. Repeated callbacks cannot invent a new round or overwrite earlier decisions.
5. Extend the canonical versioned MoboCom editor document and existing renderer for tables if required; expose existing semantic color/highlight marks in the shared rich-text toolbar. Preserve unknown/legacy blocks, sanitizer bounds, plugin-off fallback and text-direction rules. Do not store editing-engine output as a new format.
6. Extend existing search facets/cursor with explicit relevance/newest/rating ordering and supported review-dimension thresholds. Relevance stays the default; old links continue working. Reuse existing published review aggregates, module visibility and public cards. Suggestions retain relevance order. Stable pagination binds all ordering/filter parameters.
7. Audit remaining typed Admin forms, then extend their actual settings/history owners for concrete gaps. No unrestricted database editor, configurable security invariant, secret history or duplicate registry. Record the precise covered forms and remaining limitations.

## Verification and invariants

Each coherent slice receives focused unit and connected PostgreSQL tests (owned fixtures, non-root runtime, no .env), including deliberate failure/rollback and permission checks. Visible controls require actual localhost browser interaction, light/dark and mobile checks, scoped axe, screenshots and React Doctor. API changes are additive, typed and reflected in existing contracts. Migration changes appear in both schemas and release manifest and are rehearsed on an owned empty database. Hosted browser tests remain manual; no deployment or auto-merge.

Evidence and exact continuation status are maintained in `docs/agent/handoffs/AUTHORING_OPERATIONS.md` and `.ai/MOBOCOM_WORKSTATE.md`. A slice is not marked verified until its commands actually pass.
