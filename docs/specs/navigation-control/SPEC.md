# Navigation and category control

Owner request: manage categories, descendants, site/header/footer menus and section megamenus, including add, remove, hide, order and icons.

## Existing owners and boundaries

- `site.config.v1` owns header/footer links in Site Studio; extend these links with optional children, visibility and icons. Existing flat documents retain their meaning.
- `site.megamenu.v1` owns section bars and their presentation. Extend this configuration with custom trees and category presentation overrides; do not copy category records into a second taxonomy.
- Magazine `PostCategory`, Store `ProductCategory`, specialist `TaxonomyTerm` and Forum categories retain their existing CRUD, parent validation, permissions and public addresses. Link to those editors from navigation management.
- Menu hiding is presentation only: it never deletes content, changes publication or grants access. A hidden ancestor hides its descendants. Deleted category records are never recreated from settings.
- Forum menus use the canonical guest visibility resolver. Optional module/store/API filters apply recursively, including custom links.

## Behavior and safety

Site administrators with `settings.manage` edit navigation; section managers keep their own category permissions. Authors gain no taxonomy/settings rights. Existing page `showInNav` remains the owner of automatic page links. Explicit empty icon means no icon; absent icon retains the theme default. Menus have bounded depth/size and safe URLs, without HTML/SVG input. Reparenting is bounded and cannot introduce a cycle. Persist settings with a revision claim and transactional audit; stale writes return 409 and do not overwrite unrelated branding/content changes. No schema replacement or destructive migration.

RTL Admin uses existing SDS/MoboCom surfaces, accessible named controls, keyboard actions and loading/error/empty/pending feedback. Existing public layout, responsive overflow behavior, footer width and theme identity remain protected. New child menus support keyboard/Escape/outside dismissal and mobile browsing.

## Acceptance

Domain checks cover old documents, unsafe links, limits, hidden ancestors, nested disabled modules and icon removal. Connected PostgreSQL checks cover persisted round trips, conflicts, audit rollback and existing category ownership. Real local browser checks cover create/edit/reorder/hide/delete, children, icon changes, header/footer/section rendering at desktop light/dark and mobile, direct forbidden API calls and existing public visuals. Run affected TypeScript, navigation/site tests, React Doctor and scoped architecture/security checks. Record commands and limitations in the handoff and capability ledger; do not dispatch hosted browser workflows.
