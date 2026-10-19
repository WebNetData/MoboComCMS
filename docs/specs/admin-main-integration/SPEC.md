# Admin integration with current main — 2026-10-19

## Scope and owners

Combine owner Admin presentation commit `83b7d306` with main `64134402`
(Next16/React19/TypeScript7 upgrade). Continue existing Admin layout, shared
CMS CRUD, Identity guards and settings owners. No new service, migration,
permission, financial behavior or menu redesign.

## Rules

- Preserve the owner's Persian labels, table presentation and Admin layouts.
- Load `admin-tidy.css` through Admin layout and restrict every selector to
  `.admin-shell`. A stylesheet retained after client navigation must not change
  public controls. Preserve selector specificity where possible.
- Exercise actual CRUD persistence and current section permissions, including
  direct forbidden API writes and Origin checks. Use owned test actors/records.
- Preserve all original settings and production data. Clean owned fixtures only.
- Use the pinned packages from main; a passing test on the older dependency
  set is not combined-version evidence.

## Acceptance

1. Current main is an ancestor; the complete owner Admin batch is retained
   through its identified cherry-pick and reviewed follow-up fixes.
2. Scope guard detects a deliberate leaked selector; restored source passes.
3. Non-root/no-.env units, TypeScript, relevant source/architecture/security
   and connected PostgreSQL checks run on the combined source.
4. Production build runs on the combined dependency set.
5. Local actual Admin CRUD/settings/permission/error/keyboard flows pass.
   Changed representative Admin surfaces are inspected at1440/390 light/dark;
   scoped axe, overflow and public before/after-client-navigation checks run.
6. React Doctor findings, failed attempts and remaining limits are recorded in
   the canonical map/ledger/workstate and a focused continuation handoff.

No hosted workflow, automatic PR, merge or deployment is part of this request.
