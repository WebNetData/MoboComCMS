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

## Customer follow-ups

Staff record a short next action, a Tehran calendar due day and a responsible
CRM staff account in the existing customer file. The assignee or a member
with `users.manage` may edit their open work or close it as done/cancelled.
Only a member with `users.manage` may assign another eligible staff member.
Existing CRM permissions gate reading and self-assignment. Closed rows remain
as history. Mutations match the current row version and write the audit in
the same transaction. Audit metadata never contains the task title.

Customer erasure removes their tasks. Erasing staff unassigns their work and
preserves the customer history. No notifications or outbound actions run.
Add the table without rewriting historical data. Roll back application code
without dropping the new table. Verify native PostgreSQL persistence, authority,
version conflicts, date validation and erasure, then the RTL browser workflow.

## My follow-ups

The existing admin workdesk links to a paged CRM task list. It shows exact
overdue, today and upcoming counts for the selected assignee, using the
Tehran day. Show only open work for non-erased non-staff customer accounts.
Existing CRM users see their own queue. User managers may choose all work,
unassigned work or an eligible colleague. Reject crafted scopes on the server.
When Livechat is off, hide the queue card and close the new read endpoint.

Open the customer file or mark the task done using the existing versioned
PATCH and audit. Keep empty, busy, error and conflict states. No new model,
notification or background job. Native PostgreSQL checks cover authorization,
due groups, pagination, exclusions and durable completion. Browser acceptance
covers the workdesk entry, staff and manager scopes, and RTL controls.
