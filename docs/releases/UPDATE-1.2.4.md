> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# HappVPN 1.2.4 update guide

This release makes the Site Studio **Plugins** tab a working view of the Extension Manager. Themes continue to control presentation; plugin activation and settings remain independent of site configuration. The Orbital theme no longer reads a legacy plugin flag for its announcement banner.

The new **Operations Monitoring** plugin is enabled by default. It checks filesystem usage, PostgreSQL, backup freshness, paid-order delivery and payment issues every five minutes. Telegram alerts are off until a numeric admin user ID is saved and the alert switch is enabled under **Admin → Extensions → Operations Monitoring**. The plugin has its own dashboard in the admin navigation. It uses the existing Telegram bot configuration. No database schema migration is required.

Keep the production `.env`, PostgreSQL volume and `/app/storage`. Set `APP_RELEASE=1.2.4` and rebuild/redeploy the app using the existing Docker procedure. After deployment, open **Site Studio → Plugins** to verify the extension list and open **Extensions → Monitoring** to run a manual check. Configure Telegram alerts after confirming the bot can message the selected admin account.

The in-app monitor cannot alert when the entire app or PostgreSQL is down. Keep an independent uptime probe on `/api/health/ready` for those failures. See `docs/OPERATIONS_MONITORING.md` for thresholds and delivery behavior.
