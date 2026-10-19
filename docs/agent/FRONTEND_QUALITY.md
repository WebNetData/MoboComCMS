# Frontend design and verification

Applies whenever frontend design or React behavior changes. Existing MoboCom visuals and tokens remain the baseline for Homepage, Magazine, Music, Cinema (Movies/TV Series), Games, Software, Store and Community. Preserve URLs, interaction contracts and SEO. Admin receives equally usable design, with its own presentation scope.

## Design workflow

Supporting design/React/a11y skills follow [engineering skill routing](ENGINEERING_SKILLS.md). Select only the relevant task skill; its generic palette, primitive, package or workflow preferences do not replace this document or protected MoboCom visuals.

1. Inspect the current page, semantic tokens and shared controls; capture a baseline before changing a protected surface.
2. Use [Figma SDS](https://github.com/figma/sds) for Variables/Styles, tokens, primitives, compositions and design/code mapping. Extend existing MoboCom components and identity; do not import the SDS demo wholesale or invent a competing component library.
3. Define loading, empty, error, success, disabled, selected and permission states. Use semantic surface/text/border/focus tokens in both themes, including embedded editor controls. Avoid fixed white backgrounds that bypass theme tokens.
4. Use existing Storybook coverage for new reusable component states where available. Code Connect is appropriate only for real maintained Figma/component mappings; never invent Figma IDs or claim a connection was published.
5. Keep domain/business logic outside presentation. Scope module CSS; separate public, Admin, shared and editor tokens. Prefer existing supported components and dependency versions.

Admin utility/presentation styles are rooted in `.admin-shell` and loaded by
the Admin layout. An import boundary alone is insufficient: styles can remain
after client navigation. Keep the public before/after-navigation regression in
`e2e/tests/admin-presentation.spec.ts`; shared portals retain their own scoped styles.

## Shared MoboCom footer

Owner requirement2026-10-15: the default/MoboCom footer uses the full viewport width, with responsive inner padding and columns. Preserve the edge-to-edge surface; do not turn it into a capped/inset card. Continue the existing footer and theme SDK composition, branding/navigation/TrustSeals settings and plugin slots. Implementation and verified scope: [Site footer handoff](handoffs/SITE_FOOTER.md).

## React Doctor

Use installed `vercel-react-best-practices` for the affected React/performance concern and `web-design-guidelines` for focused UX/accessibility review. Load only relevant rule files; their generic advice does not bypass module public addresses, CSP nonce, user-scoped caching, installed framework versions or protected visuals. Installation/routing: [DEVSTACK](DEVSTACK.md).

Use the installed [React Doctor](https://github.com/millionco/react-doctor) for React/Next diagnostics on affected components. Check local `--help` before assuming flags; keep telemetry disabled and avoid an automatic dependency upgrade.

Current verified local command shape (installed CLI 0.9.17; declared dependency range `^0.9.14`):

```powershell
trs raw -- node node_modules/react-doctor/dist/cli.js --help
trs raw -- node node_modules/react-doctor/dist/cli.js src/components/admin/ManageBar.tsx --scope files --no-telemetry --no-supply-chain --blocking error
```

Replace the example file with the changed components. `--no-supply-chain` limits this review to code diagnostics; run the repository's security/dependency checks when dependencies change. Record exact command, scope, exit code and findings. Resolve introduced relevant errors and review warnings; do not suppress rules or loosen blocking policy to make a score green. Separate existing unrelated findings with evidence. React Doctor cannot certify aesthetics, server authorization or absence of bugs.

## Browser acceptance

Actually run Playwright on affected user flows; check 1440 light/dark and 390 mobile, Persian RTL, mixed LTR text and automatic/explicit text direction. Compare protected screenshots; check focus/keyboard, reduced motion, accessible names, feedback, no overflow and contrast (normal text at least 4.5:1). Use axe/a11y where appropriate. For async actions, test pending, failures and real persisted state. For access-sensitive UI, include a visitor and a section-only account and prove the server rejects a direct forbidden call.

React Doctor plus browser/accessibility evidence are complementary requirements for frontend slices. A documentation-only change has no new rendered UI to certify: report that scope instead of claiming a browser or visual check. Tests of state/data changes also need connected PostgreSQL evidence according to the existing decisions.
