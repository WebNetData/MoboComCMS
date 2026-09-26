# HappVPN 1.3.0 update guide

This release adds the RemnaWave Control Center plugin, live health and subscription diagnostics, bounded reconciliation, safe manual/automatic repair, panel-scoped provisioning retry controls, richer usage telemetry, and renewal/expiry notifications.

Keep the production `.env`, PostgreSQL volume and `/app/storage`. Set `APP_RELEASE=1.3.0` and rebuild/redeploy the app with the existing Docker procedure. No schema migration is needed beyond the normal deployment migration check.

After deployment:

1. Open **Admin → Extensions → RemnaWave Control Center** and select each panel.
2. Run **Manual scan** and inspect squad, status, quota and expiry differences. Use **Sync usage** or **Safe repair** on individual subscriptions as needed.
3. If those results are accurate, enable **Safe automatic repair** in **Admin → Extensions**. It is off by default and never changes purchased traffic or expiry.
4. Verify the existing fulfillment worker schedule and the panel-scoped retry queue. In **Admin → Telegram**, review the new expired-message template and confirm subscription reminders are enabled if wanted.
5. For panel outage alerts, configure the existing Operations Monitoring plugin's Telegram alerts. It now includes active RemnaWave panel health.

The integration is designed for current RemnaWave APIs and older forks, but a live panel connection was not available in the build environment. Validate health and user telemetry against your actual panel before enabling automatic repair.
