# Newsletter campaign sending

Goal: A campaign is mailed to its whole recipient list, each recipient once, also when a run fails or two runs overlap.
Owner: `mail` owns campaigns, deliveries, the recipient list and the sending job; SMTP limits stay in the mailer.
Risk: R3 (durable job, outbound e-mail to subscribers).

Inputs / outputs:
- Due `SCHEDULED` campaigns, audience, unsubscribes; `PENDING` deliveries of `SENDING` campaigns.
- One `NewsletterDelivery` per recipient; one e-mail per delivery; campaign `total`/`sent`/`failed`/status.

Invariants:
- A campaign becomes `SENDING` only after every recipient is stored; a failed attempt leaves it `SCHEDULED` and the retry completes the list and drops recipients who left meanwhile.
- A delivery is mailed by the run that claims it (`PENDING` → `SENDING`, `sentAt` = claim time), so the scheduler and a manual Admin run cannot mail it twice.
- A claim of a run that stopped expires after 15 minutes and the delivery is sent again (one e-mail may repeat if that run had already handed it to SMTP).
- A delivery that throws is recorded as failed; the batch continues. The daily cap returns the delivery to `PENDING`.
- A campaign is `SENT` only when no delivery is pending or claimed; cancellation stops further mail.

Allowed scope: `runNewsletter` in the mail server module, the delivery status comment in both Prisma schemas, focused verification.
Forbidden drift: Mailer, SMTP settings, tracking, subscriber flows, Admin UI, schema columns/migrations.
Failure / race cases: recipient write fails midway; scheduler + manual run; sender crash mid-batch; SMTP exception; daily cap; cancel while sending.
Proof required: Connected PostgreSQL reproduction at the previous revision and passing run, focused newsletter tests, type/source/architecture/security/schema checks, PostgreSQL build.
