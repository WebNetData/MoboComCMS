# Release 1.7.25 — 2026-11-26

The owner authorized merging the development PR first and publishing stable
1.7.25. PR500 merged into main at 8ffdc7df. It includes compact checkout,
readable ledger details, protected receipt review and 98% public chrome.

The release manifest has an empty 1.7.25 migration entry. Build the exact
merged version commit in Docker Desktop `mobocom-app`, use the existing
publisher and verify the download before promoting the draft. The owner
performs the destination update with a recoverable backup.
