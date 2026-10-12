# MoboCom master engineering entrypoint

The master architecture is [ARCHITECTURE.md](ARCHITECTURE.md), with [owner decisions](PLATFORM_DECISIONS.md). Continue from current repository evidence; attached requirements do not automatically authorize unrelated implementation or deployment.

## Read by task

- Repository location/status: [map](MOBOCOM_MAP.md), [capability ledger](CAPABILITY_LEDGER.md).
- Mandate targets and actual uncertainty: [domain matrix](DOMAIN_CAPABILITY_MATRIX.md), [roadmap](IMPLEMENTATION_ROADMAP.md).
- Lifecycle/Admin contributions, themes, identity/groups/restrictions, contextual actions and domain/shared service contracts: [platform evolution](contracts/platform-evolution.md).
- Any frontend design: [SDS + React Doctor + browser quality](FRONTEND_QUALITY.md).
- Why the new mandate reconciles previous decisions: [adoption ADR](adr/2026-10-10-platform-mandate.md).
- Exact source, only when resolving a requirement: [owner attachment](requirements/platform-mandate-2026-10-10.md); its provenance file records the original byte hash.

Use existing repo-local audit → spec when needed → develop; contracts/extensions/release are scoped workflows. Do not create new domain skills solely because the mandate lists domains: existing workflows and domain owners cover them. Root instructions → canonical architecture → focused contract → relevant domain owner → tests is the maintained hierarchy. Skills route into it without copying the entire master prompt.

This routing page replaces the duplicated v4 master text, retained in Git history. See the ADR for explicit supersessions; no current runtime capability is recreated or upgraded in maturity by this document.
