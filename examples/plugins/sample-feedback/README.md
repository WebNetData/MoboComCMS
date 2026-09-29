# sample-feedback — a complete sample plugin

A widget that asks "was this page helpful?" and shows the results in the admin. It exists to be read and copied:
every extension feature is used once, with comments explaining why.

| File | Shows |
|---|---|
| `manifest.json` | id, version, `requiresCore`, capabilities, **settings** (text, boolean, public/private), **permissions**, admin menu entry |
| `client.tsx` | a **UI slot** component (`site.before-footer`) reading public settings, and an **AdminPage** |
| `server.ts` | **API routes** (public with a rate limit, permission-protected), plugin **storage**, an **event handler**, a durable **job**, `validateSettings` |

## Try it

```bash
npm run example:install -- plugin sample-feedback   # copies it to src/plugins and regenerates the registries
npm run dev
```

Then open **Admin → Extensions**, enable "Quick feedback (sample)", and reload any public page. The results page is
at `/admin/extensions/sample-feedback` (role permission `sample-feedback.view`).

## Make your own from it

Copy the folder, change `id` (it must equal the folder name), the names and the code. Rules to remember:

- Plugins never import Prisma or private Core modules (`npm run arch:check` enforces it); use the extension SDK, `ctx.storage` and `ctx.enqueueJob`.
- Secrets in settings (`"type": "secret"`) are masked in the admin and never sent to the browser; only `"public": true` settings reach `client.tsx`.
- A public API route must rate-limit and validate everything itself. Hiding a menu item is not authorization.
- Bump `version` for every release; keep `requiresCore` accurate (`^1.0.0` = any 1.x core).
