// The subscription engine. The VPN panel's own public subscription URL is the
// only canonical customer link. Shop-domain mirror routes remain only for
// backwards compatibility with already-issued links and are never advertised.
import QRCode from 'qrcode'
import { parseLinks, validProfile, upstreamUrl, fetchProfile } from '@/modules/subscriptions/domain/subscription-content'
export { parseLinks } from '@/modules/subscriptions/domain/subscription-content'
import { db } from '@/platform/database/prisma'
import { getPanelAdapter, type SubFormat, type SubContent } from '@/modules/providers/server/panels'
import { syncSubscription } from '@/modules/subscriptions/server/provision'
import { legacyMirrorUrl, mirrorUrl, siteBaseUrl } from '@/modules/site/server/site-url'

export { legacyMirrorUrl, mirrorUrl, siteBaseUrl }

export type SubEndpointKind = 'panel' | 'site' | 'happ'

export interface SubEndpoint {
  kind: SubEndpointKind
  /** `panel` = the panel's public host, `site` = the shop mirror */
  url: string
  healthy: boolean
}

export interface ConnectKit {
  ok: true
  id: number
  username: string
  planName: string
  panelName: string | null
  panelType: string
  status: string
  deviceLimit: number
  trafficUsedGB: number
  trafficLimitGB: number
  usedPercent: number
  expiresAt: string
  daysLeft: number
  expiresInDays: number
  lastSyncAt: string | null
  /** Internal connect endpoints. Customer HTTP responses must replace raw panel URLs with Happ crypt5 links. */
  endpoints: SubEndpoint[]
  primary: SubEndpoint
  /** Optional Happ crypt5 deep link encrypted from the panel subscription URL. */
  happUrl?: string
  /** Happ deep-link generation error; raw panel URLs must never be exposed to customers. */
  happError?: string
  links: string[]
  linksError: string | null
  formats: SubFormat[]
  /** true when the panel answered during this request */
  panelOnline: boolean
  syncMessage: string | null
}

// ============ liveness ============

const HEALTH_TTL = 45_000
const health = new Map<string, { at: number; ok: boolean }>()

/**
 * Is this subscription URL actually serving configs? Read-only HEAD-ish probe
 * that never downloads the body, cached for a few seconds. Public hosts are
 * flaky — the dashboard must know *before* it shows a link to the customer.
 */
export async function probeSubUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!url) return false
  const hit = health.get(url)
  if (hit && Date.now() - hit.at < HEALTH_TTL) return hit.ok

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let ok = false
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'MoboComCMS/1.0 (+subscription-check)', accept: '*/*' },
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    })
    ok = res.ok
    await res.body?.cancel().catch(() => {})
  } catch {
    ok = false
  } finally {
    clearTimeout(timer)
  }
  health.set(url, { at: Date.now(), ok })
  return ok
}

/** Drops a URL from the health cache (used after rotate/repair). */
export function forgetHealth(url?: string) {
  if (url) health.delete(url)
  else health.clear()
}

// ============ config links ============

/**
 * A subscription body is either plain links or the classic base64 of one link
 * per line. Both appear in the wild, so accept both.
 */
export type SubscriptionRow = Awaited<ReturnType<typeof loadSub>>
export type LoadedSub = NonNullable<SubscriptionRow>

export async function loadSub(idOrToken: { id?: number; token?: string }) {
  return db.subscription.findUnique({
    where: idOrToken.id ? { id: idOrToken.id } : { subToken: idOrToken.token },
    include: { plan: { include: { panel: true } }, panel: true },
  })
}

const FORMATS_BY_PANEL: Record<string, SubFormat[]> = {
  REMNAWAVE: ['links', 'clash', 'singbox', 'xray'],
  PASARGUARD: ['links'],
}

export function formatsFor(panelType: string | undefined): SubFormat[] {
  return FORMATS_BY_PANEL[String(panelType || '').toUpperCase()] || ['links']
}

/**
 * Assembles everything the dashboard, the mini app and the public API need to
 * show a subscription: live usage, expiry, both links with their health, the
 * individual configs and the formats the panel can render.
 */
export async function buildConnectKit(
  idOrToken: { id?: number; token?: string },
  opts: { sync?: boolean } = {}
): Promise<ConnectKit | null> {
  let sub = await loadSub(idOrToken)
  if (!sub) return null

  let syncMessage: string | null = null
  let panelOnline = false

  if (opts.sync !== false) {
    const res = await syncSubscription(sub.id)
    if (res.ok) {
      panelOnline = true
      const fresh = await loadSub({ id: sub.id })
      if (fresh) sub = fresh
    } else {
      syncMessage = res.message || 'panel is unreachable'
    }
  }

  const base = await siteBaseUrl()
  const panel = sub.panel || sub.plan.panel
  const adapter = panel ? getPanelAdapter(panel) : null

  const panelUrl = String(sub.panelSubUrl || '')
  const upstream = upstreamUrl(panelUrl, base)
  const [remote, direct] = await Promise.all([
    adapter ? adapter.getSubscription(sub.username, 'links').catch(() => null) : Promise.resolve(null),
    upstream ? fetchProfile(upstream, 'links') : Promise.resolve(''),
  ])
  const apiLinks = remote?.ok ? parseLinks(remote.body || (remote.links || []).join('\n')) : []
  const links = apiLinks.length ? apiLinks : parseLinks(direct)
  const available = sub.status === 'ACTIVE' && sub.expiresAt.getTime() > Date.now()
  const panelHealthy = available && Boolean(direct || apiLinks.length)
  panelOnline = panelOnline || Boolean(apiLinks.length)
  const endpoints: SubEndpoint[] = upstream ? [{ kind: 'panel', url: upstream, healthy: panelHealthy }] : []
  const primary: SubEndpoint = endpoints[0] || { kind: 'panel', url: '', healthy: false }
  const linksError = !available ? 'اشتراک غیرفعال یا منقضی شده است' : links.length ? null : 'پنل کانفیگ معتبری برنگرداند؛ دوباره همگام‌سازی کنید یا با پشتیبانی تماس بگیرید.'
  const daysLeft = Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86400_000))

  return {
    ok: true,
    id: sub.id,
    username: sub.username,
    planName: sub.plan.name,
    panelName: panel?.name || null,
    panelType: panel?.type || '',
    status: sub.status,
    deviceLimit: sub.deviceLimit,
    trafficUsedGB: sub.trafficUsed,
    trafficLimitGB: sub.trafficLimit,
    usedPercent: sub.trafficLimit ? Math.min(100, Math.round((sub.trafficUsed / sub.trafficLimit) * 100)) : 0,
    expiresAt: sub.expiresAt.toISOString(),
    daysLeft,
    expiresInDays: daysLeft,
    lastSyncAt: sub.lastSyncAt ? sub.lastSyncAt.toISOString() : null,
    endpoints,
    primary,
    links: available ? links : [],
    linksError,
    formats: formatsFor(panel?.type),
    panelOnline,
    syncMessage,
  }
}

// ============ the client-facing endpoint ============

export const SUB_FORMATS: SubFormat[] = ['links', 'clash', 'singbox', 'xray']

/** HTTP headers are latin-1: a Persian or typographic plan name must be folded. */
export function headerSafe(value: string, fallback = 'MoboComCMS') {
  const cleaned = String(value || '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

export function pickFormat(req: { headers: Headers; url: string }): SubFormat {
  const asked = (new URL(req.url).searchParams.get('format') || '').toLowerCase() as SubFormat
  if (SUB_FORMATS.includes(asked)) return asked
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  if (['clash', 'mihomo', 'stash', 'surge', 'flclash', 'clash-verge'].some((k) => ua.includes(k))) return 'clash'
  if (ua.includes('sing-box') || ua.includes('singbox')) return 'singbox'
  if (ua.includes('xray-json')) return 'xray'
  return 'links'
}

function esc(value: string) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** The pretty, mobile-first page shown when a customer taps their sub link. */
export async function renderConnectPage(kit: ConnectKit, link: string, format: SubFormat): Promise<string> {
  const dir = 'rtl'
  const qr = await QRCode.toDataURL(link, { width: 460, margin: 1, color: { dark: '#0b0f14', light: '#ffffff' } }).catch(() => '')
  const gb = (n: number) => (n ? `${n} GB` : '∞')
  const rows = kit.links.length
    ? kit.links
        .map((l, i) => {
          const proto = (l.split('://')[0] || 'config').toLowerCase()
          let remark = (l.split('#')[1] || '').trim(); try { remark = decodeURIComponent(remark) } catch {}
          return `<div class="row"><div class="row-main"><b>${esc(remark || proto)}</b><span>${esc(proto)}</span></div>
          <button class="copy" data-copy="${esc(l)}">کپی</button></div>`
        })
        .join('')
    : `<p class="muted">${esc(kit.linksError || 'کانفیگی برای این اکانت پیدا نشد')}</p>`

  return `<!doctype html><html lang="fa" dir="${dir}"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(kit.planName)} · اتصال</title>
<style>
  :root { color-scheme: dark; --bg:#0b0f14; --card:#141a22; --soft:#1b232d; --line:#25303c; --text:#eaf0f6; --muted:#93a1b1; --primary:#8af542; --green:#8af542; --amber:#f0a439; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:'Vazirmatn',system-ui,-apple-system,'Segoe UI',sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:20px 16px 48px; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:800; margin-bottom:16px; }
  .mark { width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,var(--primary),#7b5cff);display:grid;place-items:center;font-size:15px }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; margin-bottom:14px; }
  h1 { font-size:19px; margin:0 0 4px; }
  .muted { color:var(--muted); font-size:13px; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:12px 0 4px; }
  .stat { background:var(--soft); border-radius:12px; padding:10px; text-align:center; }
  .stat b { display:block; font-size:15px; margin-top:2px; }
  .meter { height:7px; border-radius:99px; background:var(--soft); overflow:hidden; margin-top:10px }
  .meter i { display:block; height:100%; background:var(--green) }
  .pill { display:inline-block; padding:3px 9px; border-radius:99px; font-size:11px; background:var(--soft); color:var(--muted) }
  .on { color:#7ee2a8 } .off { color:var(--amber) }
  input { width:100%; background:var(--soft); border:1px solid var(--line); color:var(--text); border-radius:12px; padding:11px; direction:ltr; font-size:12px }
  .btns { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap }
  button, .btns a { cursor:pointer; border:0; border-radius:12px; padding:10px 14px; font-size:13px; font-weight:600; text-decoration:none }
  .primary { background:var(--primary); color:#071009 } .ghost { background:var(--soft); color:var(--text) }
  .row { display:flex; align-items:center; justify-content:space-between; gap:10px; background:var(--soft); border-radius:12px; padding:10px 12px; margin-bottom:8px }
  .row-main { min-width:0 } .row-main b { display:block; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap } .row-main span { color:var(--muted); font-size:11px }
  .copy { background:transparent; color:var(--primary); padding:6px 10px }
  img.qr { width:100%; max-width:230px; border-radius:14px; display:block; margin:0 auto; background:#fff; padding:8px }
  .tabs { display:flex; gap:8px; margin:6px 0 12px; flex-wrap:wrap }
  .tab { background:var(--soft); color:var(--muted); border-radius:99px; padding:7px 13px; font-size:12px; text-decoration:none }
  .tab.on { background:var(--primary); color:#fff }
  .foot { text-align:center; color:var(--muted); font-size:12px; margin-top:18px }
</style></head><body><div class="wrap">
  <div class="brand"><span class="mark">⬡</span> MoboComCMS</div>
  <div class="card">
    <h1>${esc(kit.planName)}</h1>
    <div class="muted">${esc(kit.username)} · <span class="mono">${esc(kit.status === 'ACTIVE' ? 'فعال' : kit.status === 'DISABLED' ? 'غیرفعال' : kit.status)}</span></div>
    <div class="stats">
      <div class="stat"><span class="muted">مصرف</span><b>${kit.trafficUsedGB} GB</b></div>
      <div class="stat"><span class="muted">حجم کل</span><b>${gb(kit.trafficLimitGB)}</b></div>
      <div class="stat"><span class="muted">روز باقی‌مانده</span><b>${kit.daysLeft}</b></div>
    </div>
    <div class="meter"><i style="width:${kit.usedPercent}%"></i></div>
  </div>
  <div class="card">
    <div class="tabs">${kit.formats
      .map((f) => `<a class="tab ${f === format ? 'on' : ''}" href="${esc(link)}?format=${f}${f === 'links' ? '&raw=1' : ''}">${esc(f)}</a>`)
      .join('')}</div>
    <img class="qr" src="${qr}" alt="QR" />
    <p class="muted" style="text-align:center;margin:10px 0 6px">این کد را با اپلیکیشن خود اسکن کنید</p>
    <input id="sub" readonly value="${esc(link)}" />
    <div class="btns">
      <button class="primary" data-copy="${esc(link)}">کپی لینک اشتراک</button>
      <a class="ghost" href="${esc(link)}?format=${format}${format === 'links' ? '&raw=1' : ''}" download>دانلود کانفیگ</a>
    </div>
  </div>
  <div class="card"><h2 style="font-size:15px;margin:0 0 10px">کانفیگ‌ها</h2>${rows}
    <p class="muted">وضعیت لینک پنل: <b class="${kit.endpoints[0]?.healthy ? 'on' : 'off'}">${kit.endpoints[0]?.healthy ? 'آماده' : 'موقتاً در دسترس نیست'}</b></p>
  </div>
  <div class="foot">این صفحه اطلاعات حساب شماست؛ آن را با کسی به اشتراک نگذارید.</div>
</div>
<script>
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy')
      var done = function () { var o = b.textContent; b.textContent = 'کپی شد ✓'; setTimeout(function () { b.textContent = o }, 1500) }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done)
      else { var i = document.createElement('textarea'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); done() }
    })
  })
</script>
</body></html>`
}

/**
 * Serves a subscription to the customer's client (or to a browser). Used by
 * both `/s/<token>` and the legacy `/api/sub/<token>`.
 */
export async function serveSubscription(req: Request, token: string): Promise<Response> {
  const sub = await loadSub({ token })
  if (!sub) {
    return new Response('اشتراک یافت نشد · subscription not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  if (sub.status !== 'ACTIVE' || sub.expiresAt.getTime() <= Date.now()) return new Response('Subscription inactive or expired', { status: 403, headers: { 'cache-control': 'no-store' } })
  const format = pickFormat(req)
  const panel = sub.panel || sub.plan.panel
  const adapter = panel ? getPanelAdapter(panel) : null
  const base = await siteBaseUrl()
  const mirror = mirrorUrl(base, sub.subToken)
  const panelUrl = String(sub.panelSubUrl || '')

  let body = ''
  let contentType =
    format === 'clash'
      ? 'text/yaml; charset=utf-8'
      : format === 'links'
        ? 'text/plain; charset=utf-8'
        : 'application/json; charset=utf-8'
  let links: string[] = []
  let failure = ''

  if (adapter) {
    const res = await adapter.getSubscription(sub.username, format)
    if (res.ok && res.body && validProfile(res.body, format)) {
      body = res.body
      contentType = res.contentType || contentType
      links = res.links || []
    } else {
      failure = res.message || ''
    }
  }

  // the panel API failed us: the canonical public host may still be alive
  if (!body.trim()) {
    const upstream = upstreamUrl(panelUrl, base)
    // Public URL fallback is only a URI subscription, never a different format.
    if (upstream && format === 'links') {
      body = await fetchProfile(upstream, format)
      links = parseLinks(body)
    }
  }

  if (!body.trim()) {
    // never hand a client an empty profile: it would install nothing and leave
    // the customer with a silent, unexplainable failure
    const reason = panel ? 'No valid configuration available from VPN panel.' : 'No VPN panel configured.'
    return new Response(
      `${reason}\nپنل VPN در دسترس نیست — لطفاً چند دقیقه بعد دوباره تلاش کنید یا به پشتیبانی پیام دهید.`,
      { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }
    )
  }

  const gb = 1024 * 1024 * 1024
  const userinfo = `upload=0; download=${Math.round(sub.trafficUsed * gb)}; total=${Math.round(sub.trafficLimit * gb)}; expire=${Math.floor(sub.expiresAt.getTime() / 1000)}`

  // a human in a browser gets the pretty connect page instead of base64
  const ua = (req.headers.get('user-agent') || '').toLowerCase()
  const params = new URL(req.url).searchParams
  const wantsRaw = params.has('format') || params.get('raw') === '1'
  const browserish = /mozilla|chrome|safari|firefox|edge|opera/.test(ua) && (req.headers.get('accept') || '').includes('text/html')
  if (format === 'links' && browserish && !wantsRaw) {
    const kit = await buildConnectKit({ id: sub.id }, { sync: false })
    if (kit) {
      const html = await renderConnectPage(kit, kit.primary?.url || mirror, format)
      return new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'subscription-userinfo': userinfo,
          'profile-title': headerSafe(sub.plan.name),
          'cache-control': 'no-store',
        },
      })
    }
  }

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'subscription-userinfo': userinfo,
      'profile-title': headerSafe(sub.plan.name),
      'profile-update-interval': '6',
      'profile-web-page-url': `${base}/dashboard`,
      'cache-control': 'no-store',
    },
  })
}
