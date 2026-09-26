// The customer's subscription endpoint (canonical short link: `/s/<token>`).
// The implementation lives in `lib/subs.ts` so the legacy `/api/sub/<token>`
// path serves byte-for-byte the same thing.
import { happImportUrl } from '@/modules/subscriptions/server/happ-protocol'
import { loadSub } from '@/modules/subscriptions/server/subs'
import { getServerLocale } from '@/i18n/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const locale = await getServerLocale()
  const fa = locale === 'fa'
  const params = await paramsPromise
  const sub = await loadSub({ token: params.token })
  if (!sub) return new Response(fa ? 'اشتراک پیدا نشد' : 'Subscription not found', { status: 404 })
  if (sub.status !== 'ACTIVE' || sub.expiresAt.getTime() <= Date.now()) return new Response(fa ? 'اشتراک فعال نیست' : 'Subscription inactive', { status: 403 })
  let link: string
  try { link = await happImportUrl(params.token) } catch { return new Response(fa ? 'لینک Happ هنوز آماده نیست. از پنل کاربری با پشتیبانی تماس بگیرید.' : 'The Happ link is not ready yet. Please contact support from your dashboard.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }) }
  const safe = link.replace(/[&<>"']/g, '')
  return new Response(`<!doctype html><html lang="${locale}" dir="${fa ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${fa ? 'باز کردن در Happ' : 'Open in Happ'}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07100b;color:#edf6ef;font-family:system-ui}.c{width:min(430px,calc(100% - 32px));box-sizing:border-box;padding:32px;border:1px solid #34503a;border-radius:24px;background:linear-gradient(145deg,#15231a,#0b1510);text-align:center;box-shadow:0 30px 90px #0008}.m{width:64px;height:64px;display:grid;place-items:center;margin:auto;border-radius:20px;background:#a7f46a;color:#0c1b0d;font-size:30px;font-weight:900}h1{font-size:24px;margin:20px 0 8px}p{color:#9cac9f;line-height:1.9}a{display:block;margin-top:24px;padding:14px;border-radius:13px;background:#a7f46a;color:#0c1b0d;text-decoration:none;font-weight:800}</style></head><body><main class="c"><div class="m">H</div><h1>${fa ? 'اشتراک امن MoboComCMS' : 'Secure MoboComCMS subscription'}</h1><p>${fa ? 'جزئیات اتصال محافظت شده‌اند و فقط داخل برنامه Happ باز می‌شوند.' : 'Connection details are protected and open only in the Happ app.'}</p><a href="${safe}">${fa ? 'باز کردن در Happ' : 'Open in Happ'}</a></main><script>location.href=${JSON.stringify(link)}</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } })
}
