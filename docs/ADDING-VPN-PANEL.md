# Adding another VPN panel adapter

The application-facing subscription code depends on `PanelAdapter`, not on a
specific provider. Remnawave and PasarGuard are registered behind the same
factory in:

`src/modules/providers/server/panels.ts`

## Normal integration path

1. Implement `PanelAdapter` for the new panel.
2. Add the display metadata/type in:
   `src/modules/providers/domain/panel-types.ts`
3. Register its factory in `panelAdapterFactories`.
4. Add provider-specific contract tests/fixtures.
5. Add any provider-specific Admin UI fields only when needed.

The database `Panel.type` is a string, not a Prisma enum. The `Panel.config`
column is generic JSON text for **non-secret** provider-specific settings.
Therefore most new panel adapters can be added without changing the core schema
or migrating customer/subscription tables.

Use the existing `token` and `password` fields for credentials. MoboComCMS encrypts these fields at rest with `PANEL_CREDENTIAL_KEY` before persistence and decrypts them only inside the adapter factory. Do not put secrets in `Panel.config`; the Admin API can return that config to the browser. If a future provider needs additional secret fields, extend the encrypted credential mechanism rather than placing secrets in generic JSON.

## Adapter boundary

Keep provider-specific HTTP payloads/status codes inside the adapter. The rest
of MoboComCMS should only use the `PanelAdapter` methods for operations such as:

- connection test
- user create/read/update/delete
- enable/disable
- group/squad discovery
- usage/device operations
- subscription/config retrieval

Do not add `if (panel.type === ...)` branches to checkout, payment, Telegram or
subscription business logic. Provider branching belongs in the adapter layer.

## Subscription URL rule

The canonical subscription URL is the public HTTPS URL returned by the VPN
panel. Customer surfaces receive only the Happ `crypt5` link generated from
that panel URL. Do not introduce a shop-domain raw subscription proxy for a new
adapter.
