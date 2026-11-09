# Builder-designed popups — 2026-11-09

Branch `feat/popup-builder-design-2026-11-09`, stacked on PR400 → PR399 → PR398. Completes slice 5 of the
MoboCom "Elementor Pro" request. Owner merges/deploys.

## Boundary

- Popups owner keeps audience, schedule, frequency, pages and counters. New design `builder` stores a saved
  builder template id in additive column `SitePopup.templateId` (both schemas; migration
  `20270226120000_site_popup_builder_design`, registered unreleased). `normalizePopup` requires a valid id for
  this design and stores none for others.
- The browser keeps receiving JSON. A builder popup's dialog frames `/popup-design/<id>?r=<revision>`: a
  server page that reads the session, rechecks the popup is live, `builder` and that the viewer is in its
  audience (`builderPopupDesign`), then renders the saved template with `BuilderRenderer` (noindex). Member-
  or manager-only designs never reach other viewers.
- `PopupDesignBridge` inside the frame posts its design height and link clicks to the same-origin parent;
  the dialog sizes the frame (≤80vh), counts the click and navigates the main window (other origins open in
  a new tab). `SitePopups` and site custom code never run inside `/popup-design`.
- Admin: «طراحی با صفحه‌ساز» shows a picker of saved templates (listed in the admin popups response). The
  admin preview shows a note instead of the frame.

## Evidence (local)

- 277 related cases incl. 2 new popup cases; schema parity and release migrations OK; full `tsc` clean.
- Migration applied to the local preview database (additive; older code ignores the column).
- Browser 1280/390 as guest: the home page opened the builder popup with the saved design, the frame fit its
  content (268px), no nested popup, the button navigated the main window to /products, no page errors.
- HTTP: after switching to members-only, a guest received no design, a member did; unknown ids return none.
  Fixture template and popup removed; saved templates restored byte-equal.
- Not run: the admin form in the browser; e2e.
