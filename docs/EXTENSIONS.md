# HappVPN Extension Platform

HappVPN extensions are trusted, build-time code packages with runtime activation and settings. Arbitrary uploaded JavaScript is intentionally not executed.

## Create a plugin

```bash
npm run extension:new -- affiliate
npm run extensions:generate
```

A plugin lives under `src/plugins/<id>/`:

```text
src/plugins/affiliate/
├── manifest.json    # metadata, capabilities, settings, permissions, admin nav
├── client.tsx       # UI slots and optional admin page
└── server.ts        # API handlers, events and durable jobs
```

The generated registries under `src/extensions/generated/` must never be edited manually. They are regenerated before `dev` and `build`.

## Manifest

Every plugin uses extension API version `1`, semantic versioning, a lowercase kebab-case ID and a compatible `requiresCore` declaration.

Supported capabilities:

- `ui`: contributes React components to approved slots.
- `admin`: contributes an admin page/navigation item.
- `api`: exposes handlers under `/api/extensions/<plugin>/...`.
- `events`: subscribes to Core events.
- `jobs`: executes durable extension jobs through the Core worker.
- `settings`: declares runtime settings rendered by Extension Manager.
- `storage`: uses namespaced extension KV storage.

Capabilities are declarative documentation/security metadata; the generated registry is the executable source of truth.

## Runtime state

Activation and settings live outside Site Studio in namespaced `Setting` rows:

```text
extension.<plugin-id>.state.v1
```

Old `site.config.v1.plugins` values are read only as a compatibility fallback until the new extension state is saved. Site export/import therefore no longer owns plugin activation.

Site Studio's **Themes** tab edits design tokens and selects a code theme. Its **Plugins** tab embeds the same Extension Manager used at `/admin/extensions`; both read and write `/api/admin/extensions`. A theme must render plugin outlets and must not read legacy `site.plugins` flags to decide whether a feature runs. New optional behavior belongs in `src/plugins/<id>`, with a manifest and runtime activation, rather than in a theme.

Secret settings are masked in admin responses and never sent to the public `ExtensionProvider`. Only settings marked `public: true` and not typed `secret` reach client components.

## UI slots

Current stable slots:

```text
site.before-header
site.after-header
site.before-footer
site.after-footer
home.before-main
home.after-main
dashboard.top
dashboard.bottom
```

Add a contribution in `client.tsx`:

```tsx
import type { PluginClientModule } from '@/plugins/types'

function Banner() {
  return <div>Affiliate campaign</div>
}

export const plugin: PluginClientModule = {
  ui: [{ slot: 'home.before-main', Component: Banner, order: 20 }],
}
```

A plugin component receives a stable, read-only site context, `locale` and its public `settings`. Plugin code must not import Site module internals.

## Extension API

Server routes are registered in `server.ts` and automatically dispatched below the plugin namespace. Plugins do not create Core route files.

```ts
import { NextResponse } from 'next/server'
import type { PluginServerModule } from '@/extensions/server/types'

export const plugin: PluginServerModule = {
  api: [{
    method: 'GET',
    path: '/summary',
    access: 'permission:affiliate.manage',
    async handler(_request, ctx) {
      const state = await ctx.storage.get('summary')
      return NextResponse.json({ state, actor: ctx.actor })
    },
  }],
}
```

Access modes are `public`, `authenticated`, or `permission:<permission-id>`. For protected routes, `ctx.actor` contains the server-verified actor. Sensitive authorization must always be enforced server-side; hiding an admin menu item is not authorization.

## Events

Core currently emits stable integration events including:

- `user.created`
- `order.created`
- `payment.completed`
- `ticket.created`
- `fulfillment.completed`

Event names and payloads are typed by the Extension API. Handlers are non-critical integrations: failures are logged and do not roll back the completed Core transaction. Long-running work should enqueue a durable job rather than block an event handler.

## Durable jobs

Use the bound context:

```ts
await ctx.enqueueJob('sync-affiliate', { orderId }, `order:${orderId}`)
```

And register the handler:

```ts
export const plugin: PluginServerModule = {
  jobs: {
    async 'sync-affiliate'(payload, ctx) {
      await ctx.storage.set(`order:${payload.orderId}`, { synced: true })
    },
  },
}
```

Extension jobs use the existing fulfillment queue, including dedupe keys, retry backoff and stale-worker lease recovery.

Plugins can additionally export `validateSettings(settings)` from `server.ts`. The Extension Manager invokes it before persisting a new runtime state. Validation should check relationships between settings as well as individual field bounds.

## Storage

`ctx.storage` is a namespaced JSON KV store. Plugins cannot access another plugin's namespace through the public SDK. Values are capped to prevent accidental large-object storage. Large files belong in object storage, not extension KV.

## Permissions and admin navigation

Declare namespaced permissions such as `affiliate.manage`. They are merged into the Role Manager automatically. Admin navigation must live below `/admin/extensions/<plugin-id>` and is shown only while the plugin is enabled and the current role has the declared permission.

An optional `AdminPage` export in `client.tsx` is rendered by the generic admin extension route. All data mutations performed by that page still require protected extension/Core APIs.

## Dependency boundary

Plugin code must use the stable extension SDK/contracts. Architecture checks block direct Prisma/database access and imports of private Core server internals. If a plugin needs a new Core capability, add a narrow public SDK operation instead of importing private implementation files.

## Feature modules (`kind: "module"`)

Large first-party parts of the product are **feature modules**. They are listed and switched in the same Extension Manager (`/admin/extensions`) but their code stays in `src/modules/*`; Core asks the module flag before serving them.

| Module | Owns |
| --- | --- |
| `vpn` | `/plans`, `/trial`, plan/network builder blocks, VPN admin sections |
| `store` | `/products`, product blocks, store admin sections (mirrors the legacy `storeEnabled` setting) |
| `journal` | `/blog`, post blocks, comments API, journal admin sections |
| `page-builder` | builder documents, theme templates, `/<section>` URLs, builder/theme admin |

A module manifest adds:

```json
{
  "kind": "module",
  "category": "content",
  "icon": "sliders",
  "requires": ["journal"],
  "publicPaths": ["/movies"],
  "adminPaths": ["/admin/movies"],
  "stateSetting": "legacyFlagKey"
}
```

- `publicPaths` disappear from every theme's menus and from the sitemap while the module is off; pages call `requireModule(id)` (404) and APIs `moduleGuard(id)`.
- `adminPaths` are hidden from the admin menu; opening them shows a “module disabled” notice.
- `requires` is enforced both ways: a module cannot be enabled before its dependencies, and a dependency cannot be disabled while an enabled module needs it.
- Disabling never deletes data.

Server helpers live in `src/extensions/server/modules.ts` (`isModuleEnabled`, `requireModule`, `moduleGuard`, `getModuleStates`).
