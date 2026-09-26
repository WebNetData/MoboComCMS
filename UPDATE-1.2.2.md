# HappVPN 1.2.2 update guide

This update fixes the website Telegram icon and makes the Telegram bot bilingual. On `/start`, a chat without a saved preference sees English and Persian buttons. The choice remains after a restart and can be changed with `/language`.

Keep the production `.env`, PostgreSQL data, and `/app/storage`. Set `APP_RELEASE=1.2.2` and rebuild/redeploy the application with the existing Docker procedure. No schema migration is needed; language preferences use the existing settings table.

After deployment, use **Admin → Telegram → Install/Update Bot** once to refresh the bot command descriptions. The existing native/default Telegram menu remains in place. Test `/start`, choose both languages in turn, and check `/me`, `/plans`, and `/language` in a private chat.
