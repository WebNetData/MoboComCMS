# Release 1.7.24 — 2026-11-26

Owner authorized creating and merging the development PR before publishing
stable 1.7.24. PR498 merged as 2ebaaf0845c76e93766e326e1e6b59a68e7bdec7.
Use the release/1.7.24 worktree from that main revision. The release includes
PR496 Pay/Cloud interfaces and first terminal creation, PR497 Pay reliability,
and PR498 atomic checkout and operations alerts.

The only migration since 1.7.23 is 20270410120000_pay_bot_boolean_ack. It adds
an allowed acknowledgement policy, with previous released migrations preserved.
Keep the original publisher and apply the migration with the matching release.
The operator owns the destination backup, update, and live provider commissioning.

Local validation, exact merged build source and publication evidence will be
recorded as those steps complete. No hosted workflow dispatch.
