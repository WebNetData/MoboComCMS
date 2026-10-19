# Navigation dropdown and mega presentation

## Outcome and existing owners

Continue the existing SiteLink tree, Studio design tab, MenuTreeEditor and shared NavigationBranch. The owner requests a polished Home submenu and an explicit per-root choice between dropdown and mega presentation. Current navigation supports nested links/icons/visibility but only a small basic panel; section-specific category mega bars already exist and keep their compositions.

## Scope and controls

- Studio → Design → main header navigation: choose dropdown (legacy default) or mega, with2/3/4 columns; optional short description on header-tree links. Footer lists retain their existing presentation. Existing automatic section-category mega bars remain owned by Navigation.
- Extend the same SiteLink JSON with optional menuDisplay/menuColumns/description fields; public localization retains them. No table, dependency, new menu registry or URL change.
- Desktop: themed bordered surfaces, icon/link hierarchy, grouped mega columns, bounded scrolling and viewport placement. Existing main links remain real links beside disclosure buttons. Mobile and overflow menus use inline nested disclosures.

## Authorization and invariants

Existing settings.manage Site PUT, optional If-Match, exact settings claim, strict transactional audit, Origin and validation remain authoritative. Journal-only staff/visitors cannot change site menus. Hidden ancestors and disabled modules prune the whole tree. Removing a link never removes content. Five-level/120-entry limits and explicit icon removal remain.

Old documents have dropdown presentation without rewriting stored rows. Switching presentation preserves IDs, URLs, ordering, children, icons, descriptions and visibility. Unknown future aggregate metadata remains with existing settings owner. Reject invalid display/column/description inputs on save. Stored text never becomes executable markup.

## Interaction and states

Support pointer intent, click/touch, native Tab/Shift+Tab, ArrowDown/Up entry, Escape and focus restoration, outside dismissal and navigation/scroll dismissal. Portaled desktop panels account for focus/pointer ownership and remain within the viewport; inline mobile groups remain in normal flow. Reduced motion, RTL/LTR, dark/light, empty/no-visible-child, long labels, deep groups and narrow/short windows are covered. Existing iframe preview and stale/error form retention remain.

## Acceptance

- Existing navigation units plus targeted compatibility/validation cases; actual connected PostgreSQL Site save/read/localization, stale claims, wrong actors, audit rollback and cleanup. Deliberately break metadata propagation/validation to prove tests fail, then restore.
- Actual browser baseline before edits; Studio selection/save/reload; both public modes; icons/descriptions/nesting; keyboard/focus/outside/scroll; overflow/mobile; light/dark1440/390 plus edge positioning. Axe, inspected screenshots and React Doctor on affected components.
- Update existing navigation handoff and capability/workstate records with only executed results. No automatic PR/push/merge, workflow dispatch or production certification.
