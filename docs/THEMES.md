# HappVPN Theme Platform

HappVPN has two theme levels so visual customization does not leak business logic into presentation packages.

## 1. Design themes

Design themes are JSON/token documents. They can be imported at runtime from Site Studio and control safe presentation values such as colors and radius. They contain no executable code.

A customized theme may declare `extends` so it retains the renderer of its installed code theme while overriding tokens. This is the HappVPN equivalent of a controlled child theme.

## 2. Code themes

Code themes are trusted source packages installed during deployment. Create one with:

```bash
npm run theme:new -- editorial
npm run extensions:generate
```

Layout:

```text
src/themes/code/editorial/
├── manifest.json
├── client.tsx    # Header/Footer overrides
├── home.tsx      # Home renderer override
└── theme.css     # theme-scoped styles, bundled into generated.css
```

`manifest.json` includes both the versioned extension metadata and its design tokens. Code theme manifests use the same semantic compatibility checks as plugins.

## Component contract

A code theme can replace:

- public Header
- public Footer
- Homepage renderer

The renderer receives DTOs/SiteConfig; it does not query Prisma or implement auth, billing, checkout or provisioning. If an override is omitted, Core falls back to the default renderer.

Other public pages keep shared Core templates and can be redesigned through theme CSS and the common Header/Footer. New replaceable rendering contracts should be added only when there is a real theme use case, to avoid freezing internal UI implementation as public API.

## Generated files

`npm run extensions:generate` builds:

```text
src/themes/generated/catalog.ts
src/themes/generated/client-registry.ts
src/themes/generated/server-registry.ts
src/themes/generated.css
```

Never edit generated files manually.

## Security rules

- Runtime JSON themes cannot execute JavaScript or arbitrary CSS.
- Code themes are trusted deployment artifacts, not admin uploads.
- Architecture checks reject Prisma/database/App Router dependencies inside `src/themes/code`.
- Theme code must not implement financial or authorization decisions.
