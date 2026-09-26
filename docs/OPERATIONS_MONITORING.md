# Operations monitoring

The `operations-monitor` extension checks host filesystem free space, PostgreSQL reachability, encrypted backup freshness and last attempt, paid-order fulfillment, and recorded payment gateway issues. It runs once after application startup and then every five minutes in the Node runtime. The admin page is **Extensions → Monitoring**; Studio's Plugins tab shows the same extension activation and settings as the standalone manager.

Telegram alerts are off until an admin enters a numeric Telegram user ID and enables alerts in the extension settings. The existing bot token and enable switch under **Telegram** are reused. An alert is sent when a signal becomes warning/critical or changes severity. A recovery message is sent when a previously notified signal becomes healthy. Failed sends retry after ten minutes. Settings and per-signal delivery state are stored in PostgreSQL; there is no new schema migration. Disabling the extension stops checks. Set `OPERATIONS_MONITOR_SCHEDULER=false` only if another runner performs checks manually.

The default disk thresholds are 75% warning and 85% critical. The backup limit is four hours, matching the two-hour backup cadence with headroom. Backups are checked only when scheduled backup is enabled. Disk usage is measured via `statfs` on `/` inside the container, which reports the backing filesystem in the standard Docker setup. `MONITOR_DISK_PATH` can select a different mounted filesystem.

Monitoring inside the app cannot send Telegram alerts while the app or PostgreSQL is down. Keep an independent probe on `/api/health/ready` for those outages. Disk monitoring does not require mounting the Docker socket, and it does not delete images or build cache automatically.
