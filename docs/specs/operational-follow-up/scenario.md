# Operational follow-up

- Pay staff use the existing reconciliation desk to find missing evidence and actionable receipts. A pending notice is never a financial decision. Manual and SMS confirmation keep the existing shared claims. Review requires the same permissions as the underlying evidence.
- The financial report separates incoming amounts, fees and posted credit from completed settlements. Report movements per currency and use Tehran dates. A terminal filter scopes receipts and credits. Settlements belong to the merchant wallet, so terminal reports omit settlement comparisons. CSV follows the applied filters.
- Staff can claim eligible expert work once. Customer contact is optional and uses the shared ticket owner. Customers perform authentication in the external service and can report completion without sending credentials.
- Hosting customers can see upcoming renewals and the associated invoice or next action. Authorized staff can see upcoming expiry and persisted reminder status. Billing and the existing reminder worker remain authoritative.

Verify the merchant permission boundary, report currency and date separation, repeat and late payment evidence, concurrent claim and ticket retry, and renewal ownership against PostgreSQL. Exercise the four staff/customer surfaces in a browser.

## Verification

- Six connected checks passed against a freshly migrated PostgreSQL database
  owned by a non-superuser. They cover Pay, expert tickets, Cloud renewals
  and shared support. TypeScript, source, architecture, schema parity and
  the release manifest checks passed.
- Edge verified Pay reconciliation and CSVs, Store and Forms claims and
  linked ticket replies, and Cloud renewal and invoice navigation. Scoped
  axe passed in the tested desktop and mobile views.
- Deployment uses the additive `20270418160000_expert_request_ticket`
  migration. The association is nullable for tickets outside this workflow.
  The foreign-payment preset change is used when a new form is created.
