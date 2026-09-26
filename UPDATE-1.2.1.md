# HappVPN 1.2.1 update guide

This update puts **Continue with Telegram** above the email/password form on `/login` and includes the native Telegram bot menu change already applied to the server. It does not require a database migration.

## Before deployment

- Back up PostgreSQL and `/app/storage` as usual. Keep the current `.env` and production secrets.
- Set `APP_RELEASE=1.2.1` in the production environment.
- In **Admin → Telegram**, keep the bot enabled, with a valid token and bot username. The website login widget appears only when these values are configured.
- In BotFather, link `happvpnproxy.com` to that bot with `/setdomain` (or add the website origin under the bot's Login Widget allowed URLs). Telegram requires the website domain to be registered for login.

Redeploy the application with the normal Docker/Coolify build. The existing `deploy:migrate` step is safe and should find no new migration.

An existing email user should link Telegram from their profile before signing in with Telegram; Telegram does not provide an email address for automatic matching. A new Telegram sign-in creates a provisional account linked to that Telegram identity.

The bot menu remains Telegram's default menu. The Mini App is still reachable through buttons sent by the bot.
