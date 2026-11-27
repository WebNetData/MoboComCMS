# Visual quality gate

Use pass / fail / not applicable / not run with supporting evidence. A subjective numerical design score is not a substitute for these checks. Scale checks to change scope; include all relevant checks for material new pages, features, or design-system changes.

| Gate | Acceptance criteria / evidence |
|---|---|
| Visual identity | Intended hierarchy is clear; graphic choices are purposeful and consistent with Mobocom; no accidental default-library appearance. Compare actual screenshots to approved references if available. |
| Layout | Inspect typical desktop, tablet, mobile and relevant intermediate widths (e.g. 1440, 768, 390 CSS px; choose based on existing breakpoints). No unintended clipping, overlaps, horizontal scrolling or unusable controls. |
| Typography and tokens | Type, contrast, spacing, alignment and colors conform to established tokens and hierarchy. |
| Interaction | Exercise changed user flows; include keyboard and relevant loading, empty, error, disabled, success, focus and selected states. |
| Accessibility | Check semantic names, keyboard/focus, contrast, zoom/reflow, reduced motion and accessible alternatives to charts. Use existing automated tooling when available; automated checks alone do not establish full compliance. |
| Internationalization | Verify supported locales/directions where relevant; check text wrapping, mixed scripts and formatters. |
| Engineering | Run applicable existing typecheck, lint, tests and build; inspect console and relevant network errors. Confirm API behavior and permissions unchanged where required. |
| Performance | Check obvious regressions in loading, interaction, layout shifts and animation; use existing budgets and profiling tooling where available. Do not invent measured results. |
| Regression | Compare affected adjacent pages/components if shared tokens or primitives changed. Preserve unrelated work. |

MoboCom's [browser acceptance](../../../../docs/agent/FRONTEND_QUALITY.md#browser-acceptance) applies. Use existing Playwright Test/CLI for repeatable product checks and actual screenshots. Check 1440 in light and dark, 390 mobile and relevant intermediate breakpoints for material layout changes. Include Persian RTL and mixed LTR content where applicable. Use affected-file React Doctor with telemetry off for React changes, and keyboard/focus plus axe for relevant interactions. Keep connected PostgreSQL and server permission checks when behavior or authorization changes. Record missing Figma separately from a missing browser run.

## Review loop

1. Record intended user flow and visual acceptance criteria; for redesigns, capture before screenshots where possible.
2. Run the application with safe development/test data. Capture evidence of changed views and relevant states in the repository's approved artifact location or a temporary directory.
3. Inspect screenshots visually, not just DOM assertions. Compare to current design system/Figma where available. Run targeted behavioral tests.
4. Prioritize blockers (broken interactions, accessibility failures, layout breakage) over aesthetics. Identify specific visual fixes; implement scoped corrections.
5. Re-run impacted checks. If still failing, report what remains rather than hiding it. A material unresolved blocker means the work is not verified for release.

## Final report template

- Scope and design intent:
- Figma/design-system reference (or unavailable):
- Companion skills actually used and unavailable capabilities:
- Files/components changed:
- Verification table: check | result | command/evidence
- Screenshot paths (if captured):
- Remaining defects, risks, or architectural proposals:
