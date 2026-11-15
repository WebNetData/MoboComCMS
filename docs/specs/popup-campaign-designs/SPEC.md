# Campaign popup designs —2026-11-15

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
