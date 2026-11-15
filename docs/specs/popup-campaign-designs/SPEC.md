# Campaign popup designs —2026-11-15

## Custom authoring continuation —2026-11-15

Owner additionally requests creating their own image/text/button popup for every
existing message kind. Existing cover/split/builder are present but the panel
lacks a discoverable custom composition workflow. Extend the same Popups editor
with a first-class custom design, image beside/above/behind text or text-only,
curated accessible palettes/accents, alignment/width/image-fit and button style/icon.
Reuse title/body, six presentation fields, Media picker, primary URL/action and
close/confirm action. Existing free builder template remains the advanced editor;
do not implement another canvas/document format or execute uploaded HTML/CSS.
Allow reusing a saved popup through an editable unpublished copy.

Store bounded enum-only optional `presentation.custom` in the already migrated
column; legacy JSON defaults/old design IDs remain compatible, no new migration.
Same permissions/module guards/audiences/frequency/counters/Origin. Preview clicks
never navigate; explicit save/publish only. Photo failure falls back to message
icon, no empty blocking image. Background composition always uses a dark readable
text surface regardless of image. No new shared owner, discount or provider call.

Acceptance: unit invalid-enum/code refusal and legacy defaults; real PG custom
roundtrip/pause/draft-copy retention and projection fault; actual Admin keyboard
text/image/layout/button controls → draft save/reload → unpublished copy; public
notice/news/warning/offer,1440/390 light/dark, background/text/image failure,
keyboard/reduced-motion/axe and existing campaign regression; module-off/denials.
Preserve mobocom-app/3000 and clean exact fixtures after proof. Rollback retains
optional JSON; pause custom records before deploying a reader without custom UI.

Accepted locally:22 scoped browser views axe0, actual image upload/error handling,
draft save/reload/copy, custom CTA navigation/counter, role/module-off refusals;
fresh native Popups/Media and five unit cases. Final source/health and owned
fixture cleanup completed; exact limits in the existing handoff.

Owner requests several polished editable popup templates inspired by a supplied
red gift/split campaign window, with attractive effects. Continue existing Popups
module, audience/schedule/frequency/counters, ImageField, native dialog and builder
design. Checkout sms-platform, feat/popup-campaign-designs-2026-11-15, stacked on
local UI correction9e44b764 (not yet published); fetched mainaa20d05a.

Three selectable designs: red image/gift campaign, blue ticket/coupon, gold
membership. Existing five designs and saved documents remain. Gallery selection
creates an editable draft only; no promotion, deadline or price is published by
installation. Administrator can edit badge, highlight/value label, supporting
detail, coupon code, title/body/action/close and optional own image. Illustrations
are decorative local vector source, not executable package uploads. Effects enter
once with opacity/transform and respect reduced motion.

Reuse Popups owner and canonical popups.manage/settings.manage, Media and existing
module guard. Presentation adds one typed/validated JSON-text column with empty
default; existing row behavior unchanged. No second registry/Settings owner,
Identity, discount engine, timer, checkout rule or real message delivery. A copied
coupon is text only; commerce validates any actual discount independently.

Acceptance: bounded presentation normalization and old inputs; native PostgreSQL
round-trip/new designs + existing audience/frequency/expiry/concurrent claims;
fresh migration and populated empty-default compatibility; intentional contract
fault detected. Actual Admin gallery→draft→save→reload and protected public dialog,
mobile390/desktop1440 both themes, long text, own-image/missing-image fallback,
coupon success/failure feedback, keyboard/Escape/focus, reduced motion and axe.
Module-off returns no contributions and denies direct API. No customers' popups
activated or changed. Exact synthetic fixtures cleaned. Docker mobocom-app image,
port3000/storage preserved; private pre-migration backup, additive migration tracked
in release manifest; rollback retains presentation data and uses compatible readers.

Implemented local acceptance2026-11-15 is recorded in
[the existing Popups handoff](../../agent/handoffs/POPUP_BUILDER_DESIGN.md#campaign-designs-continuation--owner2026-11-15).
Fresh migrations/native PG,24 scoped browser views plus sequential typing/save,
module guards and final Docker/source/cleanup proof passed. Existing local popup
table was empty before upgrade, so populated-popup migration proof is not claimed.
