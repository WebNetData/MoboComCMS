# MoboCom — Whole-Site Execution Brief for Codex & Claude Code

> برای شروع task روی مخزن واقعی استفاده شود. این فایل «نقشه اجرای قابل کنترل» است؛ دستور بازنویسی یکباره کل پروژه نیست.

## زمان استفاده

این brief برای درخواست صریح ممیزی/طرح معماری سراسری است. افزودن بسته به معماری، این prompt را اجرا نمی‌کند. در توسعهٔ یک قابلیت مشخص، فقط معیارهای مرتبط استاندارد را در workflow موجود اجرا کن و مجوز موجود را برای ادامهٔ همان slice حفظ کن. خروجی فاز اول در اسناد وضعیت/spec/handoff موجود ثبت می‌شود؛ ماتریس موازی یا ادعای آمادگی کل محصول ساخته نمی‌شود. راه‌اندازهای اختیاری: [Codex](prompts/CODEX_WHOLE_SITE_START.md)، [Claude](prompts/CLAUDE_WHOLE_SITE_START.md).

## دستور قابل ارسال به Agent

در نقش Principal/Staff Full-Stack Architect + Product UX Architect، معماری یکپارچه کل سایت MoboComCMS را بر مبنای **واقعیت فعلی مخزن** بررسی و بهبود بده؛ نه فقط ماژول‌ها و نه فقط UI.

قوانین موجود `AGENTS.md`، `CLAUDE.md`، `docs/agent/PLATFORM_DECISIONS.md`، `docs/agent/ARCHITECTURE.md` و `docs/agent/WHOLE_SITE_QUALITY_STANDARD.md` را بخوان و تعارض‌ها را به نفع قراردادهای معتبر فعلی حل کن. handoff/roadmap/evidence مربوطه را فقط به اندازه نیاز بررسی کن.

**هدف محصول:** همه قسمت‌های سایت (هسته، طراحی عمومی، پنل مدیریت، سیستم محتوا، دیتابیس، API، امنیت، افزونه‌ها، قالب‌ها، تجربه‌های کاربری و عملیات) باید منظم، قابل نگهداری، تخصصی، یکپارچه و توسعه‌پذیر باشند. هر صفحه و هر ماژول فیلدها، داده، روابط، دسترسی، actions، تنظیمات و چیدمان درست داشته باشد و مدیریت مجاز آن تا حد امکان از پنل انجام شود.

**افزونه/قالب:** تجربه مدیریت نزدیک به وردپرس در سطح installer، activation، dependency، settings، update، editor declarative، live preview، history و rollback. از سیستم‌های فعلی استفاده کن. به هیچ وجه arbitrary server code در پنل اجرا نکن؛ کد trusted فقط از مسیر build/deploy نسخه‌دار.

**دو قید حیاتی:**

- ظاهر تأییدشده، routeها، URL و SEO و permissions و داده و هویت Canonical User را حفظ کن. سیستم مشابه یا موازی نساز؛ فعالیت optional/off-focus را خودسرانه فعال نکن.
- در اولین اجرای این دستور **فقط Audit و Target Blueprint و Prioritized Roadmap** تولید کن؛ هیچ refactor انبوه یا migration/deploy انجام نده. پس از تعیین یک slice با کمترین ریسک، اجرای incremental همراه tests انجام شود.

### خروجی مرحله اول

1. Inventory از site surfaces، routeها، module owners، shared services، Admin menus/forms، plugin/theme lifecycle و assets.
2. Matrix برای تمام دامنه‌های واقعی با ستون‌های `owner | admin/public surfaces | existing models | IA/form/layout gaps | security/contracts | status: present/partial/missing/unverified | evidence | priority`.
3. Site-wide UI/UX Design System Audit: spacing scale، typography، forms، lists، navigation، responsive/RTL/a11y، و انطباق با baseline تأییدشده.
4. Data/API/Extension Architecture Review: uniqueness، روابط، taxonomy/vocabulary، schema parity، authz، callbacks/jobs، migrations و قراردادهای بسته‌ها.
5. Blueprint سراسری: قرارداد واحد layouts + قرارداد تخصصی برای هر ماژول + پنل قابل مدیریت + extension/theme editing trust levels.
6. Roadmap مرحله‌ای وابسته به ریسک و dependency؛ برای اولین slice فایل‌های هدف، سناریوی تست، rollback و معیار قبولی را پیشنهاد بده.
7. چیزی که واقعاً اجرا/تست نشده را صادقانه جدا مشخص کن؛ فقط evidence واقعی ارائه بده.

بعد از ارائه خروجی مرحله اول، اصلاحات را از اولین slice تأییدشده ادامه بده، نه با تغییر هم‌زمان همه صفحات. همه گزارش‌ها فارسی و با ارجاع به فایل‌ها باشند.
