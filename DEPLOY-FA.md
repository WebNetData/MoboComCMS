# نصب و راه‌اندازی MoboComCMS

راهنمای اصلی نصب و تنظیمات ضروری در [README پروژه](README.md#نصب-روی-سرور) است.

- [Docker و Coolify](docs/DEPLOY-COOLIFY.md)
- [VPS و هاست Node.js](docs/DEPLOY-VPS-HOST-FA.md)
- [بکاپ و بازیابی PostgreSQL](docs/POSTGRESQL-BACKUPS.md)
- [آپدیت و نگهداری داده](docs/UPDATES-AND-DATA.md)
- [چک‌لیست انتشار](docs/RELEASE-CHECKLIST.md)

PostgreSQL، فایل‌های storage و کلیدهای رمزگذاری را مستقل از نسخهٔ کد نگه دارید. در production مهاجرت با `npm run deploy:migrate` انجام می‌شود؛ `prisma db push` جایگزین آن نیست.
