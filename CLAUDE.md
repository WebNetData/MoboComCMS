# Claude workflow — MoboCom

Read and follow [AGENTS.md](AGENTS.md) for the shared repository invariants, owner decisions and tool routing. It is the canonical root guidance; this file does not duplicate it.

Use the existing `.claude/skills/mobocom-*` workflows for this agent. Audit current implementation before adding anything; continue the existing batch. Read only relevant architecture/contracts via [MASTER_PROMPT](docs/agent/MASTER_PROMPT.md). For frontend design follow [FRONTEND_QUALITY](docs/agent/FRONTEND_QUALITY.md): preserve the approved surfaces, use Figma SDS and React Doctor, and actually verify affected UI in a browser.

The domain matrix records evidence and uncertainty; the roadmap sequences safe slices. Do not infer implementation or production readiness from adopted requirements. Owner merges/deploys; PRs target main. Preserve unrelated local changes and the current data, APIs, URLs and section-specific permissions.

<!-- mobocom-business-continuation:start -->
## Business experiences continuation

For business/Trustpilot-style experiences, read docs/agent/handoffs/BUSINESS_EXPERIENCES.md first and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve the authoritative branch/worktree before editing: the implementation may be ahead of this checkout. Continue it; do not rebuild from missing files here. The handoff records verified checks and remaining work, not whole-feature completion.
<!-- mobocom-business-continuation:end -->
