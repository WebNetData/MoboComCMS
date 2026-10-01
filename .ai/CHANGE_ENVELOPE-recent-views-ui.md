# Recently viewed page composition

Goal: Make the private recently viewed page consistent with the account library's SDS-token hierarchy in dark and light themes.
Owner: Existing dashboard recent page and account-home styles; `content` still owns private history data.
Risk: R2 (user-facing responsive composition, no data or API change).

Inputs / outputs: Existing paginated recent items, clear-history action and empty state.
Invariants: Privacy, pagination and destructive confirmation stay unchanged; MoboCom dark RTL remains primary.
Allowed scope: Recent page markup, scoped account styles and existing browser QA script.
Forbidden drift: Tracking, persistence, permissions, unrelated dashboard pages.
Failure cases: No items after clearing, narrow mobile width, light theme, long mixed-script titles.
Proof required: Type/source/architecture checks, real browser behavior at desktop/tablet/mobile, dark/light screenshots, PostgreSQL build.
