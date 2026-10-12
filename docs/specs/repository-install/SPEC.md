# Repository client installation integrity

Compose the existing package store serializable installation with database-only work owned by Repository. Download/signature verification stays outside retrying SQL. Current settings.manage actor is rechecked every attempt; package/index/theme, strict fresh installed-map merge and one repository.client.install audit commit together. Preserve missing-row creation, old receipt entries, API results and trusted internal signature; malformed receipt denies without overwriting bytes. Validate signed archive id/version/runtime/kind against selection and enforce its actual core requirement. Invalidate existing Settings cache after commit. No duplicate package audit or separate transaction/persistence/identity system.

Acceptance: actual audit/receipt errors and post-download suspension roll back; corrupt receipt retained; wrong signed archive id or required core rejects; two real SQL snapshots race on first receipt creation without loss; compiled free/paid/update/cache/audit flow passes. Module/config/license changes while downloading and external execution/recovery remain separate.

[Verified bounded evidence](../../agent/audits/2026-10-11-repository-install.md).
