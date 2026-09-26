# RemnaWave Control Center (1.3.0)

The Control Center is a build-time plugin with runtime activation under **Admin → Extensions**. Its admin page is **Extensions → RemnaWave Control Center**. It requires the existing RemnaWave panel credentials and the `panels.manage` permission; mutation actions additionally require `subs.manage` or `orders.manage`. No new database migration is required.

## What it checks

- Panel health through RemnaWave's authenticated `GET /api/system/health`; older forks that return 404/405 use a read-only users probe. The API route is documented in the [RemnaWave community SDK](https://github.com/remnawave/python-sdk/blob/production/remnawave/controllers/system.py). The response format has changed between panel releases, so the integration only reports safe high-level health, latency and component count.
- A bounded page of local subscriptions against live RemnaWave users. It compares status, internal squad membership, traffic limit, expiry and the subscription URL. It displays live usage, lifetime usage when available, last subscription access and device limit.
- The existing paid-order fulfillment retry queue, scoped to the selected RemnaWave panel. Retry uses the same idempotent paid-order path as the Order Operations page; a missing renewal job is never fabricated.

The app scans five subscriptions per active panel every 15 minutes by default and advances a persisted cursor. The batch size is configurable (1–20). The manual scan reads ten subscriptions at a time and provides pagination. Set `REMNAWAVE_CONTROL_SCHEDULER=false` to disable the in-process scheduled scan. The Operations Monitoring plugin adds a RemnaWave health signal to its Telegram alerts when that plugin's alerts are configured.

## Repair policy

**Automatic repair is off by default.** When an admin enables it, the scheduled scan may only restore missing internal squad membership and disable a panel account that is disabled locally but active remotely. The manual **Safe repair** action uses the same rules. Both actions re-read the panel user to verify the result. They are blocked while a paid renewal is processing.

Missing panel users, quota differences, expiry differences and a remotely disabled account are reported for investigation. The Control Center never silently creates a replacement account or changes purchased traffic/expiry. **Sync usage** updates only usage telemetry, the panel subscription URL and the last-sync timestamp. It leaves the purchased quota and expiry intact. A full entitlement correction requires the existing paid renewal or an explicit operator workflow outside this safe-repair action.

## Notifications

The Telegram reminder worker now sends a separate one-time expired notice, in addition to the pre-expiry and low-traffic reminders, for linked users who enabled subscription alerts. A completed paid renewal sends a distinct bilingual confirmation. Existing reminder settings gain an editable Persian expired template; older stored settings get the default automatically. Message delivery is best-effort and never rolls back an already completed order.

Before enabling automatic repair on production, run a manual scan on each panel and inspect the reported differences. A live RemnaWave panel is required to verify provider-specific behavior; the release checks use mocked API responses.
