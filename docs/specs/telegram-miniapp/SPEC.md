# Telegram Mini App continuation

Owner request2026-11-04: finish Claude's existing Mini App, with polished mobile UI and access to MoboCom's services. Continue `feat/miniapp-platform-2026-11-04`; retain the three uncommitted Claude changes.

## Canonical owners and compatibility

- `/miniapp` is a presentation client, not another platform. Identity/NextAuth verifies signed Telegram initData; a normal browser can use the same current web session. Never authenticate from initDataUnsafe, introduce a second account, or expose the bot token.
- Site owns the public discovery projection from existing homepage data. Disabled/maintenance/audience-limited sections must not leak cards, counts or links. Discovery is public, so it does not promise individual group prices; the existing product/checkout owners quote the account's price.
- Account owns `/api/my/overview`, favorites, orders and the unified library. Wallet, support, notification and payment screens keep their existing APIs and permissions. Native account navigation is expanded without replacing website routes.
- Existing Site Studio section `miniapp` flags, module activation, section access, maintenance, brand and design tokens remain the Control Plane. No new settings or schema are needed for this slice.

## Journeys and states

1. Valid Telegram launch signs into the canonical account; existing browser sessions are checked against `/api/me`. No SDK/failing SDK must not cause an endless spinner. Failed verification never reveals private children and offers a bounded retry.
2. Home introduces enabled services, products, media and the shared site content. Discover has a local section finder and category tabs, real empty/error/retry states, no invented stock or activity.
3. Account and library reuse the current account overview and the shared purchases view. Wallet/support/payments/notifications remain reachable without a VPN dependency. VPN pages stay under current audience/maintenance guards.
4. Telegram back/haptic APIs are progressive enhancements. Unsupported clients retain working links. Respect safe insets, normal vertical swipes, keyboard focus, reduced motion, RTL and both themes.

## Acceptance

- Execute domain/client behavior tests, real PostgreSQL discovery projection/current-account checks, type/architecture/source gates, React Doctor and actual browser light/dark1440/390 journeys with axe.
- Independently test hidden-section projection and forged/expired initData. No real Telegram/bot/gateway/production certification without an actual external-client run.
- Record verified results and remaining website-backed screens in `docs/agent/handoffs/TELEGRAM_MINIAPP.md`. Rollback is source-only; existing data, configuration and URLs survive.
