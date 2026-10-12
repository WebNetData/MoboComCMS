> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# HappVPN 1.3.1 — shared English/Persian preference

This update synchronizes a linked customer's language across the website, Telegram bot, Mini App and customer Telegram alerts. The choice persists with the account and wins over a stale browser cookie on another device. New accounts inherit the website language; an account claimed through Telegram keeps its bot language. English remains the default when no language has been selected.

Subscription-ready, renewal, expiry and low-traffic messages use the recipient's current language. Admin operations-monitor alerts use the receiving Telegram chat's selected language. The Telegram admin page now edits both English and Persian reminder templates. Plan names and descriptions have separate English fields; legacy plans with no English name show a neutral traffic/duration label in English until translated.

Deployment:

1. Preserve the production `.env`, PostgreSQL volume and `/app/storage` as usual. Take the normal production backup.
2. Set `APP_RELEASE=1.3.1` and rebuild the app from this source package.
3. Run `npm run deploy:migrate` (or the existing Docker startup script that runs migrations) before serving traffic. Migration `20260923120000_plan_localizations` adds `Plan.nameEn` and `Plan.descriptionEn` with empty defaults; it does not rewrite existing plans.
4. In **Admin → Plans**, fill in the English name and optional English description for existing plans. New plans require an English name. In **Admin → Telegram**, review the English and Persian reminder templates.
5. With one linked test account, switch to English on the website and check the bot, Mini App and a test notification. Repeat in Persian. Existing CMS posts/pages/products also need their English fields populated by editors to display translated content.

`npm run release:check` and `npm run build:postgres` passed locally. Production Telegram delivery and migration against the live database were not run in this workspace.
