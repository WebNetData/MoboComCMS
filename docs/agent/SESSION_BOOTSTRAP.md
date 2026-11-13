# MoboCom session bootstrap

## Shared Claude / Codex continuation — 2026-11-14

این سند مسیر شروع مشترک Claude، Codex و عامل‌های زیرگروه است؛ معماری یا ثبت توسعهٔ جداگانه برای هر مدل نداریم. قراردادهای محصول در [AGENTS.md](../../AGENTS.md)، [تصمیم‌های مالک](PLATFORM_DECISIONS.md) و [معماری](ARCHITECTURE.md) می‌مانند. مهارت‌های دو کلاینت روش اجرای همین قراردادها هستند.

### شروع یا تحویل گرفتن کار

1. درخواست جاری مالک و راهنمای نزدیک فایل را بخوان؛ با `git status --short --branch` و `git worktree list` checkout و تغییرات موجود را مشخص کن. مسیر باز IDE سرنخ است، نه اثبات کامل وضعیت؛ نام شاخهٔ ثابت در راهنمای قدیمی هم بر درخواست و کد فعلی مقدم نیست.
2. `.ai/MOBOCOM_WORKSTATE.md` همان checkout و handoff مربوط در `docs/agent/handoffs/` را بخوان. شاخه/commit، وجود فایل‌ها و ادغام در `main` را با Git تطبیق بده. اگر قابلیت در worktree دیگری جلوتر است، همان پیاده‌سازی را ادامه بده؛ نبودن فایل در checkout قدیمی دلیل ساخت دوباره نیست. بدون حفظ کار مالک checkout را reset، switch یا پاک نکن.
3. فقط بخش مرتبط تصمیم‌ها، معماری، [نقشه](MOBOCOM_MAP.md) و [ثبت قابلیت‌ها](CAPABILITY_LEDGER.md) را بخوان. برای قابلیت مشخص، گام بعدی handoff بر صف تاریخی و نامرتبط roadmap مقدم است. درخواست سراسری جداگانه لازم است تا ممیزی جامع را شروع کنی.
4. مالک فایل‌ها و معیار قبولی یک گام محدود را تعیین کن. در کار گروهی محدودهٔ ویرایش‌ها جدا باشد؛ تغییر Git، اسکیما، runtime و ثبت مشترک را هماهنگ کن و مانع‌ها را به سرگروه گزارش بده. وجود عامل دیگر مجوز merge، deploy، فراخوانی provider یا اجرای workflow میزبانی‌شده نیست.

### ثبت اجباری هر گام توسعه

پیش از تحویل یا پایان یک گام منسجم، همان handoff موجود را با این اطلاعات به‌روز کن؛ اگر دامنه handoff ندارد، یک فایل متمرکز زیر `handoffs/` بساز و آن را از نقشه/ثبت موجود قابل کشف کن:

- تاریخ، قابلیت و درخواست مالک؛ checkout/branch/base/commit یا diff ثبت‌نشده و وضعیت محلی/commit/PR/merged، همراه منبع قابل بررسی.
- فایل‌ها و سرویس مالک، تصمیم و رفتار پیاده‌شده، قرارداد دسترسی/داده/مهاجرت و ارتباط با ماژول‌های موجود؛ برنامه را به‌جای پیاده‌سازی ثبت نکن.
- فرمان‌های واقعاً اجراشده، محیط و نتیجه؛ شواهد PostgreSQL و مرورگر برای تغییر مرتبط، شکست‌های قبلی، آزمون‌های اجرا‌نشده و محدودیت provider/چاپگر/سرور. ادعای ایجنت قبلی را با نام منبع حفظ کن؛ بازخوانی سند را اجرای دوبارهٔ آزمون حساب نکن.
- کار ناتمام، اولین اقدام دقیق ادامه، معیار قبولی، rollback و وضعیت fixture/cleanup. کد یا شواهد ضروری نباید فقط در گفت‌وگو یا scratchpad موقت بماند؛ اسرار، کوکی، اطلاعات واقعی مشتری و فایل خصوصی را وارد اسناد یا Git نکن.

در ابتدای `.ai/MOBOCOM_WORKSTATE.md` فقط خلاصهٔ همین گام و مسیر handoff را اضافه کن؛ تاریخچه و تغییرات عامل دیگر را حفظ کن. ردیف مرتبط نقشه و ledger را هنگام تغییر قابلیت به‌روز کن؛ تصمیم جدید در `PLATFORM_DECISIONS.md` و مرز مالکیت در `ARCHITECTURE.md` ثبت می‌شود. فایل وضعیت موازی، معماری ویژهٔ Claude/Codex یا کپی کل اسناد میان شاخه‌ها نساز. کار ثبت‌نشده در Git را منتشرشده معرفی نکن.


Continue the current repository; never restart existing or partial capabilities. Read root instructions and [owner decisions](PLATFORM_DECISIONS.md), then the relevant [map](MOBOCOM_MAP.md)/[ledger](CAPABILITY_LEDGER.md) entries. [Master routing](MASTER_PROMPT.md) selects architecture, contracts, matrix, roadmap and frontend guidance without loading the entire source mandate.

Use repo-local mobocom-audit first, mobocom-spec for substantial changes, then mobocom-develop. Load mobocom-contracts, mobocom-extensions or mobocom-release only when relevant. Inspect current owners; preserve canonical identity/shared services, data/history, permissions, APIs/URLs and protected designs. Frontend design follows SDS and React Doctor plus actual browser/a11y evidence. Configuration belongs in the existing Admin Control Plane.

Continue one authorized feature slice from its current handoff and run its relevant tests; use the roadmap when no named continuation applies. Report exact executed checks and unresolved gaps; documentation is not production verification. PRs target main; owner merges/deploys. Leave unrelated working-tree changes intact.

<!-- mobocom-business-continuation:start -->
## Business experiences continuation

For business/Trustpilot-style experiences, read docs/agent/handoffs/BUSINESS_EXPERIENCES.md first and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve the authoritative branch/worktree before editing: the implementation may be ahead of this checkout. Continue it; do not rebuild from missing files here. The handoff records verified checks and remaining work, not whole-feature completion.
<!-- mobocom-business-continuation:end -->
