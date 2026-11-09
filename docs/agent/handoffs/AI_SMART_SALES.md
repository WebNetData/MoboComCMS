# Smart sales & CRM — 2026-11-09

Branch `feat/ai-smart-sales-2026-11-09`, stacked on PR390 (AI Admin area), independent of PR391.
Owner asked for related-product suggestions, unpaid-order follow-up and per-category campaign
suggestions on the existing CRM, measured by real purchases and engagement, with messaging bound
to member consent. Owner merges/deploys.

## Boundary

- Read-only AI page `/admin/ai/sales` + `/api/admin/ai/sales`. No table, migration, scheduler,
  sender or dependency. Sending stays with Automation engagement (`/admin/crm/engagement`), cart
  recovery with Store marketing; their consent, caps, quiet hours and channel choices are unchanged.
- `domain/sales.ts`: attribution window (7 days, last touch), window rate, lift, campaign-copy
  prompt/parser. `server/sales/insights.ts` composes existing owners:
  - Campaign results: `UserNotification.marketingSource` (sent/read) joined to PAID/COMPLETED
    orders within the window; each order counts once for the latest notice. Comparison group:
    opted-in active members with no marketing notice in the period. Shown as association, not cause.
    Cart reminders: sent/recovered from `CartReminder`.
  - Category opportunities: purchase (1y) or product follow signals per category; counts only
    (interested / with marketing consent / consenting and no purchase there in 30 days) — no list of people.
  - Unpaid Store orders (1h–7d): count, value, 15 latest with consent flag and "bought since";
    links to order and CRM profile. No automatic message.
  - Customer suggestions: existing `frequentlyBoughtProductIds` aggregate, then category best
    sellers; owned products excluded; shows consent state.
- Access: campaigns/opportunities need `users.manage` AND `automation.manage` (engagement's pair);
  unpaid orders need `orders.manage`; customer suggestions need `users.manage`; Store module on.
  AI copy draft: POST, same-origin, 20/10min, `store` AI purpose, audited, returns text only.

## Evidence (local)

- 86/86 `scripts/ai.test.cjs` incl. 2 new sales cases; full `tsc` clean (LF copy in preview container).
- Real queries on the local database: opportunities and suggestions returned demo data; a seeded
  marketing notice + later paid order was attributed (1 buyer, 1,500 IRT); fixture removed.
- Browser (1440 dark / 390 light): four sections, campaign row, 4 suggestions, no overflow or errors.
- Not run: AI copy draft against a real provider, non-admin role walk, e2e.
