# Mobocom frontend architecture contract

Apply this contract inside the existing [MoboCom modular monolith](../../../../docs/agent/ARCHITECTURE.md) and its path-based routes. [Owner decisions](../../../../docs/agent/PLATFORM_DECISIONS.md) and the [frontend standard](../../../../docs/agent/FRONTEND_QUALITY.md) define the protected surfaces and design system. Start from `src/app/globals.css`, `src/app/ui.css` and the actual owner in `src/components` or the feature. Keep public, Admin, shared and editor scopes separate, and use the existing theme registry. Preserve canonical identity, section AuthZ, feature availability, routes and business behavior. This map guides reuse of current layers.

| Layer | Responsibility | Boundary |
|---|---|---|
| Foundations | Semantic colors, typography, spacing, radius, elevation, grid, motion, themes, direction | Single authoritative token source; avoid per-page forks. |
| Primitives | Buttons, fields, menus, focus, dialog, tables and accessibility behavior | No feature-specific business logic. |
| Shared compositions | Navigation, layouts, recurring form and data patterns, reusable graphic components | Reuse primitives; stable interfaces and documented variants. |
| Features | Domain-specific screens, workflows, charts and state | Use existing application boundaries; preserve API and authorization. |
| Integration | API clients, state/cache, validation, permissions, telemetry | Do not change contracts incidentally to a visual refactor. |
| Verification | Unit, integration, browser, accessibility and visual regression checks | Use existing test infrastructure and deterministic fixtures; never real customer data in shared artifacts. |

## Architectural decisions

- Inspect and reuse current source-of-truth tokens; map Figma semantic tokens to code only with evidence. Keep design/code synchronization explicit. Never assume Figma overrides an approved release constraint.
- Prefer native semantic elements and established accessible primitives. Keep shared component APIs stable or document migrations.
- Preserve supported locales, RTL/LTR, number/date formatting and themes. Use logical CSS properties where consistent with the stack; verify mixed-direction text and directional icons.
- Respect existing design and performance budgets. Avoid additional runtime JS for effects achievable in CSS. Use lazy loading for genuinely heavy graphics where appropriate; reserve space to avoid layout shifts.
- Charts must match data semantics: accurate scales, meaningful units, accessible labels or text/table alternatives, truthful missing-data behavior, and no invented trends.
- Motion must clarify hierarchy, feedback or transitions; avoid interfering with input, scrolling, or assistive technology. Respect reduced motion.
- If a new dependency, global token change, major component migration, Figma write, or new build/test tool is needed, document scope, compatibility, risks and alternatives. Do not make unrelated high-impact changes without authorization.
- No secret exposure, production writes, unrelated code changes, forced pushes, or destructive commands as part of this skill. Do not commit or publish unless requested.
