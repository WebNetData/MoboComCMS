import { installMode } from './state'
import type { NextRequest } from 'next/server'

const HEAD = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

/**
 * /install — a plain HTML shell. It does not use the site's layout or theme on purpose: the installer has to work
 * before the database, settings and modules exist. The wizard itself is public/installer/installer.js.
 */
export async function GET(req: NextRequest) {
  const rawNonce = req.headers.get('x-nonce') || ''
  const nonce = /^[A-Za-z0-9+/_=-]+$/.test(rawNonce) ? rawNonce : ''
  const mode = await installMode()
  if (mode === 'installed') return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  if (mode === 'unknown') {
    return new Response('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>پایگاه داده در دسترس نیست</title><body style="font-family:system-ui,Tahoma;max-width:560px;margin:15vh auto;padding:0 16px;line-height:2"><h1>پایگاه داده در دسترس نیست</h1><p>سرویس پایگاه داده پاسخ نمی‌دهد. اجرای آن و مقدار DATABASE_URL را بررسی کنید و صفحه را دوباره باز کنید.</p></body></html>', { status: 503, headers: HEAD })
  }
  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>نصب موبوکام</title>
<link rel="stylesheet" href="/installer/installer.css">
</head>
<body>
<main class="wrap"><div id="app" aria-live="polite"><p class="lead">در حال بررسی…</p></div>
<noscript><p class="note bad">برای نصب، جاوااسکریپت مرورگر باید فعال باشد.</p></noscript></main>
<script nonce="${nonce}" src="/installer/installer.js"></script>
</body>
</html>`
  return new Response(html, { headers: HEAD })
}
