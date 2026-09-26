# Service incidents and subscription reports

Administrators with `tickets.handle` manage bilingual updates at `/admin/incidents`.
Choose all services or a specific provider panel, and investigating, maintenance or
resolved. Updates appear on matching subscription cards in the dashboard and
Telegram mini app. Visible pages refresh once per minute. Resolved updates remain
visible for 24 hours after their last edit. This is a manually maintained status;
absence of an announcement does not establish that a server is healthy.

Connection reports use the existing ticket system. The server verifies ownership
of the selected subscription and records subscription ID, device and issue type.
No configuration credentials are attached automatically. The mini app supports
reading and replying to tickets. Existing tickets remain valid with nullable
report fields. Deleting a subscription retains its ticket and clears the relation.

Deployment: back up the database and apply the additive schema changes using
`prisma db push` with the appropriate SQLite or PostgreSQL schema before starting
the new build. Changes add `ServiceIncident` and nullable report fields on `Ticket`.
No outbound Telegram messages, automatic outage detection or compensation runs
are introduced by this feature.
