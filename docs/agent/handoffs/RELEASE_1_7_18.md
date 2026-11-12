# Release 1.7.18

The owner asked to release the merged work after 1.7.17 (2026-11-12). This PR prepares metadata only: the version (`package.json`, `package-lock.json`), the seal of five additive migrations in `prisma/release-manifest.json`, the guides and the notes in `docs/releases/1.7.18.md`. No runtime source, dependency or shipped SQL changed. The owner merges this PR, builds and signs the package with the offline publisher key, and publishes the release. No deployment is part of preparation, and Guest Cache stays off.

Base main: `996b9176` (the owner merged PR437–445 after v1.7.17 `91d51d1a`).

Sealed migrations: `20270306120000_ai_prompt_cache_tokens`, `20270307120000_codes_when_empty`, `20270308120000_order_delivery_files`, `20270309120000_product_delivery_template` and `20270310120000_form_work_receipts`. All are additive; the last one replaces the `FormSubmission_stage_check` constraint with a wider one that every stored stage still satisfies. The hashes were computed from the repository's LF content and matched in Linux (a Windows working tree holds CRLF copies; sealing from it would give other hashes).

Owner actions after the update: SMS events «سفارش دیرکرد (مدیر)» and «مرحلهٔ کار درخواست» are off until enabled; the repair form is made from the «تعمیر موبایل» template.

Evidence: each PR's own checks (tsc, architecture, unit files, browser and axe on a database copy; PDFs for print), recorded in its description. For this metadata PR, `release:migrations` passed (20 releases, 0 unreleased).

Not verified: real SMS sending, a real printer, the site logo on the card image, the first update on the owner's server.

Rollback: the retained code rollback of the signed updater. The added columns, table and indexes stay. Database restoration is an explicit owner decision.
