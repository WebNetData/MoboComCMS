# Skill routing

Use the [verified inventory](../../../../docs/agent/ENGINEERING_SKILLS.md#premium-design-companions) for exact names, installation modes and sources. Choose the smallest useful set for the current problem. Read specific rule or reference files only. Consult MoboCom's shipped design and approved Figma SDS references before companion advice. Use Unslop as the default design critique for design, styling and refinement.

| Need | Route |
| --- | --- |
| Minor UI fix | Existing SDS/MoboCom tokens and component, targeted Unslop or `baseline-ui` pass, focused browser verification. |
| Product flow and hierarchy | `ui-ux-pro-max` for a focused question. Product Design only for requested exploratory prototypes, when connected and compatible. |
| New visual direction | Use `frontend-design` with Unslop for new compositions and visual reworking. Add task-specific OpenDesign guidance from the existing engineering standard where it applies. Use text-only `design-taste-frontend` or `frontend-app-builder` only for a distinct unresolved art direction or concept-to-code need. Build Web Apps is the latter's upstream plugin. |
| Graphic assets | `imagegen` only when original raster assets or concept imagery serve the task. Keep existing vector and brand assets where appropriate. |
| Components | Existing MoboCom primitives by default. `shadcn` is reference guidance for a surface already proven to use it. |
| Data dashboards | Existing metrics, permissions and data owners plus `dashboard-design` for information and chart decisions, Unslop for hierarchy, Playwright for the filters, states and rendered charts. |
| Motion | `fixing-motion-performance` for general checks. Choose one relevant `gsap-*` skill only when GSAP is already in scope. Respect reduced motion and existing CSS primitives. |
| Web standards | `web-design-guidelines` and the applicable a11y or React rule. |
| Actual QA | Existing Playwright Test/CLI for repeatable evidence. Choose `playwright-interactive`, `webapp-testing`, or Browser for exploration based on the client and session. |
| Additional critique | Use Impeccable's manual review when a specific issue remains after Unslop. |
| Backend only | Keep the ordinary engineering route unless UI behavior or its contract changes. |

Read a selected project companion from `.agents/skills/<name>/SKILL.md` or its Claude mirror. The new project editions omit implicit invocation in Codex and can be selected by file or explicit skill mention. When a companion file or tool is unavailable, use the established local owner and state the limitation. Treat alternate providers, repositories, skills and similar names as distinct. During ordinary frontend work, do not install or refresh companions automatically. For a requested tooling update, review provenance, license, scripts, credential behavior and version compatibility before changing the existing lock and running discovery again.
