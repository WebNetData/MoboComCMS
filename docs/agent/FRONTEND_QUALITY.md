# Frontend design and verification

Applies whenever frontend design or React behavior changes. Existing MoboCom visuals and tokens remain the baseline for Homepage, Magazine, Music, Cinema (Movies/TV Series), Games, Software, Store and Community. Preserve URLs, interaction contracts and SEO. Admin receives equally usable design, with its own presentation scope.

## Design workflow

Supporting design/React/a11y skills follow [engineering skill routing](ENGINEERING_SKILLS.md). Select only the relevant task skill; its generic palette, primitive, package or workflow preferences do not replace this document or protected MoboCom visuals.

1. Apply the installed `unslop` skill by default for requested UI design, styling or refinement, under the integration rules above. Inspect the current page, semantic tokens and shared controls; capture a baseline before changing a protected surface.
2. Use [Figma SDS](https://github.com/figma/sds) for Variables/Styles, tokens, primitives, compositions and design/code mapping. Extend existing MoboCom components and identity; do not import the SDS demo wholesale or invent a competing component library.
3. Define loading, empty, error, success, disabled, selected and permission states. Use semantic surface/text/border/focus tokens in both themes, including embedded editor controls. Avoid fixed white backgrounds that bypass theme tokens.
4. Use existing Storybook coverage for new reusable component states where available. Code Connect is appropriate only for real maintained Figma/component mappings; never invent Figma IDs or claim a connection was published.
5. Keep domain/business logic outside presentation. Scope module CSS; separate public, Admin, shared and editor tokens. Prefer existing supported components and dependency versions.

Owner clarification2026-11-25: every affected platform surface must look intentionally
styled, including dense data lists and internal Admin views. A border around an
unstructured grid is insufficient. Give financial facts, destinations, review states
and actions distinct hierarchy; keep amount/unit pairs together and isolate LTR
identifiers. Use the existing owner table/card compositions with labelled mobile
rows, readable headers, consistent padding, visible focus and styled actions. Check
expanded details and selected/error/empty states in both themes. This is a quality
bar for each continuation, not evidence that every platform page has been audited.

## Workspace menus — owner requirement2026-11-25

- On phone/tablet sizes, workspace navigation opens from a visible, styled44px
  hamburger button in the header. Follow the existing account/Admin interaction;
  a horizontally scrolling main-menu strip is not a replacement. Choose the
  breakpoint from content fit (Pay uses1100px); keep the persistent side menu on
  larger screens and preserve protected public shells.
- Reuse ShellNav and the canonical typed menu entries for grouping, current-link
  state and remembered expansion. Do not create a second permission/menu resolver.
  Style every caption, group, icon tile, link, account footer, focus/selected state
  and support entry with existing MoboCom/SDS tokens. Native controls retain their
  semantics and receive consistent spacing/surfaces; no unfinished/default-looking
  section, overlay or control is accepted as a completed design.
- A modal side drawer uses native dialog semantics and focus containment, a named
  close control, Escape/backdrop close, focus restoration and independent scrolling.
  Close on navigation and desktop resize; restore page scrolling. Expose expanded/
  controls state, keep closed navigation out of focus order, account for safe areas
  and test320/390/768/1024 plus desktop in both themes. Motion stays finite and
  reduced-motion-aware. Existing nonmodal account/Admin disclosure menus keep their
  current contracts; a visual request alone does not authorize a global rewrite.
- Support entries reuse the canonical Support ticket/Identity/department owners.
  A dedicated module presentation must not create a parallel inbox, login, message
  history, staff permission resolver or implicit access to financial commands.

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

A browser test that fails on console errors passes `caret: 'initial'` to its screenshots. By default Playwright hides the text cursor by setting inline `caret-color: transparent` on every input in every frame. If a screenshot lands while a page or frame is still hydrating, React reports a hydration mismatch that comes from the test, not the site (seen 2026-11-03: 6 of 8 runs warned in the builder editor, 0 of 8 after the change). Before fixing a hydration warning, read its full diff.

React Doctor plus browser/accessibility evidence are complementary requirements for frontend slices. A documentation-only change has no new rendered UI to certify: report that scope instead of claiming a browser or visual check. Tests of state/data changes also need connected PostgreSQL evidence according to the existing decisions.
