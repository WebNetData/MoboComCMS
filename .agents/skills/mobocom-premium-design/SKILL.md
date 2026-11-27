---
name: mobocom-premium-design
description: Design, implement, review, and refine Mobocom (موبوکام) frontend UI/UX, graphical platform features, design systems, dashboards, and user-facing interactions. Coordinate Unslop, Figma SDS, and relevant design/testing skills while preserving existing architecture. Do not invoke for backend-only tasks with no user-facing changes.
---

# MoboCom Premium Design

Deliver a distinctive, sophisticated, useful product interface, not a generic AI-generated template. Work within the existing Mobocom engineering architecture. Prefer excellent art direction, information hierarchy, typography, custom visuals, and meaningful interactions over gratuitous decoration. Use Linear, Stripe, Raycast, Attio, Vercel, Figma, and Framer as quality benchmarks, not templates to copy.

## MoboCom entrypoint

Apply this workflow to user-facing product UI/UX, graphics, components, pages, dashboards and visual interactions, including review and small fixes. For a backend-only task with no user-facing change, use the ordinary engineering route. Use the [frontend standard](../../../docs/agent/FRONTEND_QUALITY.md) for SDS, React Doctor, Playwright and a11y requirements. [Architecture](../../../docs/agent/ARCHITECTURE.md), [owner decisions](../../../docs/agent/PLATFORM_DECISIONS.md), and approved MoboCom visuals govern the implementation. Read only the relevant parts once.

Use Unslop as the default critique for design, styling and polish. For new compositions and visual reworking, pair it with the existing Anthropic `frontend-design` workflow as required by the frontend standard. On a minor fix, apply only the relevant pass to the existing tokens and proportions. Use available Figma SDS references for design/code mapping and inspect the current MoboCom implementation in every case. If Figma is unavailable, note it and work from the checked-in system and approved baselines. Companions advise within this scope, without introducing frameworks, project-wide redesigns or extra approval loops.

For a new data dashboard, read [`dashboard-design`](../dashboard-design/SKILL.md) for the metrics, charts and states, and use the existing Playwright workflow for the rendered flow. Add product UX, motion or visual concept guidance only for a specific need.

## 1. Discover before changing

- Read applicable repository instructions (`AGENTS.md`, nested instructions), architecture documents, ADRs, package manifests, current routes, component libraries, tokens, Figma references and test conventions. Inspect the working tree; preserve unrelated user changes.
- Identify the audience, primary user task, required data and states, existing brand constraints, locale/direction, and scope. Use existing product evidence; do not invent brand colors, product features, or Figma specifications.
- Inventory available skills and tools by their actual names and paths. Read their instructions only when relevant. Use [skill routing](references/skill-routing.md) to select companions. Never claim a missing skill ran; do not silently install tools during an ordinary design task.
- Resolve design decisions using the existing approved Mobocom design system and Figma SDS references. Unslop is the baseline anti-generic design review. If the two conflict with approved product requirements or accessibility, preserve the requirements, record the conflict, and propose a targeted resolution. Follow repository and higher-priority instructions.

## 2. Set art direction

For new pages, major redesigns, or reusable visual patterns, define a concise concept: audience and task, layout and hierarchy, type system, color roles, density, graphic language, motion intent, and responsive behavior. For small changes, inherit established patterns rather than starting over.

- Use strong typography, intentional composition, clear contrast, optical alignment, and consistent rhythm. Build a recognizable Mobocom visual language; do not default to a monochrome dashboard or arbitrary luxury aesthetic.
- Make graphics support understanding: illustrations, custom SVGs, meaningful charts, diagrams, maps or interactive canvases only when the feature benefits. Use real approved content or clearly labeled fixtures in isolated demos. Use ImageGen or approved assets when useful and available; respect licensing and privacy. Never upload sensitive project assets to external services without authorization.
- Avoid gratuitous gradients, glow, glass, rounded cards, pills, stock icon repetition, decorative dashboards, and purposeless animation. These are not blanket prohibitions when justified by the established system.
- For major visual changes, use an existing Figma reference or create a scoped concept/wireframe if useful; compare implementation to it. Do not invent a Figma review or approval.

## 3. Implement within architecture

- Reuse existing primitives, semantic tokens, component families, layout shells, routing, state/data patterns and localization. Extend them at the appropriate shared layer; keep domain-specific composition in its feature layer. See [architecture contract](references/architecture-contract.md).
- Preserve business rules, authentication/authorization, API contracts, forms, data integrity, permissions and all working functionality. Do not substitute fake data for real integrations.
- Implement the relevant loading, empty, error, success, disabled, focus, hover, selected and pending states. Include keyboard navigation, focus management, responsive behavior, RTL/LTR where supported, and reduced-motion handling.
- Choose visualizations and motion based on actual product requirements. Prefer current dependencies; do not introduce competing component systems or visualization libraries without a documented need and compatibility review.
- Keep changes scoped. Separate optional redesign proposals from the requested implementation; do not trigger project-wide rewrites or change the stack solely for visual quality.

## 4. Verify and refine

Use [visual quality gate](references/visual-quality-gate.md). For material UI changes, run the relevant application and tests, inspect real screenshots at representative widths, exercise core interactions and states, then fix identified issues and re-check. Use Unslop for the baseline critique. Select Impeccable in manual mode only when a distinct question about hierarchy, resilience or finish remains. If Figma is available, compare approved frames and variants; use browser evidence rather than assumptions. For small UI fixes, use proportionate checks. For a review-only task, report findings without editing unless authorized.

Do not assert pixel perfection, WCAG compliance, successful tests, or completed review without evidence. Do not block all development on unavailable tooling: report missing verification as not run, list the risks, and provide reproducible next steps. Stop when scoped acceptance criteria are met, or blockers are identified; do not enter unbounded refinement loops.

## 5. Deliver

Summarize the design intent, files/components changed, companion skills actually used, deviations from approved design, verification commands/results, screenshot paths if captured, unresolved issues, and any proposed architectural decision. Record durable decisions in the existing design system or ADR location if appropriate. Do not create parallel standards or update the project policy on every task.
