# Direct package Admin authority and atomic audit

## Confirmed gap

The five direct Admin database commands previously admitted once, then persisted before their best-effort audit. Actual audit-failure baselines (write/file-delete/restore/delete/upload) returned200, logs1791730211211-27428,1791730212301-9500,1791730213199-32964,1791730214104-36416,1791730215020-19824. Controlled post-admission revocation returned200: corrected params baselines1791730453000-12256,1791730453994-24304,1791730454867-28684,1791730455767-20952; upload first-read1791730378487-38532. Early params getters changed authority before initial guard and are not post-admission evidence; lazy thenables now prove the boundary was reached after initial admission.

## Correction

Existing public store stays canonical. Its private authority helper composes requirePerm/settings.manage with the transaction reader and auditAdminStrict in the same transaction. PATCH reuses that helper. Each direct route supplies its admitted actor/request; every retry resolves current actor and action. Existing internal callers omit optional context and retain their trusted contract; they are not certified by this slice. Old external audits removed on these routes; action names/metadata/response shape preserved.

## Actual evidence

- PG5 package/shared-authentication owners native0 .mobocom/restrictions-1791737633516-36176.log; actual single-connection native0 .mobocom/restrictions-1791737284332-39220.log: all five current authority denials, strict audit rollback, authorized actions exactly once. Actual activated theme manifest/delete audit failures preserve theme, selected Site Config and index. JWT decoder/catalog/unused code-apply doubled; real Identity/controller/store/audit/SQL used.
- Restored old controller detects audit omission independently on all five routes: write .mobocom/restrictions-1791737273666-28072.log; file-delete .mobocom/restrictions-1791737274332-34580.log; restore .mobocom/restrictions-1791737275002-16260.log; delete .mobocom/restrictions-1791737275704-13704.log; upload .mobocom/restrictions-1791737276333-25952.log. Captured-actor fault200vs403 and swallowed-audit fault200vs500: captured-actor .mobocom/restrictions-1791737254200-14420.log; swallowed-audit .mobocom/restrictions-1791737255942-21972.log. Additional undefined-actor fault fails403vs500 (guarding a malformed helper; not a success bypass). All fixture source restored.
- Check639 including TypeScript native0 .mobocom/restrictions-1791737285446-22456.log; build82 native0 .mobocom/restrictions-1791737375271-8356.log; compiled HTTPS11 cases/zero retry native0 .mobocom/restrictions-1791737595066-40172.log, existing editor plus actual file deletion/revision restore and package/repository/Origin checks. No changed React/CSS, new React Doctor/a11y scan or protected redesign claim.

## Limits

Authority is current at each transaction snapshot. Repository-client installs, builtin/source import, code apply, filesystem/Git compensation, dependency/compatibility/recovery/operational lifecycle remain separate. Fresh install is exercised in compiled HTTP/browser; native fault upload is an existing-package upgrade. No migration, hosted Actions, push/PR/merge/deploy/rollout or full production readiness claim. Root app3000 and owner files untouched.
