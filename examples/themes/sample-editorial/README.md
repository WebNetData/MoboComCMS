# sample-editorial — a sample code theme

| File | Role |
|---|---|
| `manifest.json` | id/version/`requiresCore` and the **design tokens** (`design.colors` for dark, `design.lightColors` for light, `radius`) |
| `client.tsx` | `Header` / `Footer` overrides (client components) |
| `home.tsx` | `Home` override (server component, receives ready-made data) |
| `theme.css` | styles scoped to `html[data-design="<id>"]` |

```bash
npm run example:install -- theme sample-editorial   # copies to src/themes/code and regenerates
npm run dev
```

Then choose it in **Admin → Homepage, appearance & menus → Themes**. Omit `client.tsx` or `home.tsx` to keep the default
renderer for that part. A theme must not import Prisma, `@/app/*` or `*/server/*` modules (`npm run arch:check`).
