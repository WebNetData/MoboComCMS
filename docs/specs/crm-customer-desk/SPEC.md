# Customer relationship desk

The existing Livechat customer workspace owns `/admin/crm`, its direct API,
segments, profile, tags and notes. The list takes 60 recent accounts before
filtering by segment and caps tag membership at 2,000. Staff need old
customers to remain discoverable and the current filters to survive reload.

- Label the workspace «مدیریت ارتباط با مشتریان» and make it reachable from
  the existing Admin People menu. Keep profile and API URLs.
- List canonical non-staff customer accounts. Use existing CRM permission
  alternatives on the list. The marketing link uses the existing additional
  role requirements. Existing profile scopes and write guards remain in force.
- Apply name, email, phone or numeric ID, tag, account status and purchase
  segment before paging. Show exact filtered counts and support stable newest,
  latest purchase and total purchase ordering. Keep existing IRR/IRT reporting
  and customer segment boundaries. Use a bounded page and no bulk actions.
- Provide the shared account profile, a distinct empty result, a retryable error
  and semantic controls. Use the Admin tokens with responsive Persian RTL and
  isolated direction for phone and email.
- Internal GET accepts additive `page`, `status` and `sort` parameters.
  Existing row fields and tag list remain. URL state is private Admin state;
  return personal data with private, no-store. No schema changes or new owner.
- Verify older matching data beyond 60 newer accounts on PostgreSQL, amount
  conversion, sort stability, access and current segment boundaries. In a real
  browser verify listing, URL filters, paging and profile navigation at desktop
  and mobile. Reverting this slice requires no data rollback.
