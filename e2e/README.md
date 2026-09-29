# Browser regression suite

Real-browser tests of what visitors and administrators do. They run against a site with demo data
(`SEED_DEMO_DATA=true`) and never delete anything; the few settings they toggle are restored.

```bash
npx playwright install chromium        # once
npm run test:e2e                       # starts a dev server on :3100 (or reuses one)
```

| Variable | Meaning |
|---|---|
| `E2E_BASE_URL` | test an already running site (staging) instead of starting a dev server |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | enables the tests that need an administrator (page cache); without them those tests are skipped |
| `PLAYWRIGHT_CHROMIUM_PATH` | use an installed Chromium |

What is covered: public pages open without script errors, security headers and admin protection,
CSRF origin check, login errors, guest page cache (MISS → HIT, personal and dynamic requests bypass it,
purge), cart, music player, media redirects (never the container address).

Against a real server: `E2E_BASE_URL=https://example.com E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e`.
The cache tests switch the cache on for their run and off afterwards — skip `pagecache.spec.ts`
(`--grep-invert "guest page cache"`) on a production site whose cache is on.
