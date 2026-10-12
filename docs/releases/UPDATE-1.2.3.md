> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# HappVPN 1.2.3 update guide

This update fixes the website Telegram login button. The old widget used `data-onauth`, which caused Telegram's script to call `eval`; production CSP blocked that call. The widget now uses Telegram's documented `data-auth-url` redirect to `/login/telegram/callback`. The existing NextAuth provider checks the signed payload with the bot token before creating a session.

Keep the production `.env`, PostgreSQL data, and `/app/storage`. Set `APP_RELEASE=1.2.3` and rebuild/redeploy the app with the existing Docker procedure. No schema migration or BotFather change is needed if `happvpnproxy.com` is already linked to the bot.

After deployment, load `/login` in a private browser window, confirm the Telegram button appears, and complete a sign-in. An existing email user should link Telegram from their profile before the first Telegram sign-in.
