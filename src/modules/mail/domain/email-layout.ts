/**
 * The one MoboCom email look: every branded email (notifications, security and
 * sign-in codes, newsletters, gift cards) is built here so they stay alike.
 *
 * Email clients are not browsers. The layout is table-based with inline styles,
 * so Gmail, Outlook and phone apps all render it. A <style> block then adds what
 * the better clients understand: the site's Vazirmatn font, a dark-mode palette,
 * phone spacing and a light entrance motion. Clients that ignore the block still
 * get the full email. Pure: no I/O.
 */

export type EmailIcon = 'bell' | 'lock' | 'key' | 'gift' | 'mail' | 'check'

export type EmailBlock =
  /** Plain text, escaped; line breaks kept. */
  | { kind: 'text'; text: string; muted?: boolean }
  /** Already-safe HTML (a newsletter body the staff wrote). */
  | { kind: 'html'; html: string }
  /** A one-time code, large and easy to copy. */
  | { kind: 'code'; code: string; caption?: string }
  | { kind: 'button'; label: string; href: string }
  /** The raw address under a button, for clients that block buttons. */
  | { kind: 'link'; href: string; label?: string }
  | { kind: 'quote'; text: string }
  /** A highlighted panel: a gift card's amount and code, an order total. */
  | { kind: 'card'; label: string; value: string; code?: string }
  | { kind: 'note'; text: string }

export type EmailDocumentInput = {
  brand: string
  /** The site's absolute address, without a trailing slash. */
  site: string
  title: string
  /** The preview line inboxes show beside the subject. */
  preheader?: string
  greeting?: string
  eyebrow?: string
  icon?: EmailIcon
  blocks: EmailBlock[]
  /** Escaped footer lines: why this email came and how to stop it. */
  footer?: string[]
  /** Footer links: [label, absolute href]. */
  footerLinks?: [string, string][]
  accent?: string
  /** HTML placed after the layout (a newsletter's open pixel). */
  trailer?: string
}

export const DEFAULT_ACCENT = '#4b45ee'

export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>')

const ICONS: Record<EmailIcon, string> = { bell: '🔔', lock: '🔐', key: '🔑', gift: '🎁', mail: '✉️', check: '✅' }

/** A valid #rrggbb accent or the MoboCom default. */
export function emailAccent(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value!.toLowerCase() : DEFAULT_ACCENT
}

/** Mixes a hex colour toward another: used for the accent's soft tint and gradient partner. */
export function mixHex(from: string, to: string, amount: number) {
  const a = from.match(/[0-9a-f]{2}/gi)!.map((part) => parseInt(part, 16))
  const b = to.match(/[0-9a-f]{2}/gi)!.map((part) => parseInt(part, 16))
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

/** The site's absolute address for a path or an already absolute URL. */
export const absoluteUrl = (site: string, href: string) => (/^(https?:|mailto:|tel:)/i.test(href) ? href : `${site.replace(/\/+$/, '')}${href.startsWith('/') ? '' : '/'}${href}`)

function block(item: EmailBlock, accent: string, soft: string, warm: string): string {
  switch (item.kind) {
    case 'text':
      return `<p class="em-text${item.muted ? ' em-muted' : ''}" style="margin:0 0 14px;font-size:15px;line-height:2;color:${item.muted ? '#6b7280' : '#374151'}">${lines(item.text)}</p>`
    case 'html':
      return `<div class="em-text" style="font-size:15px;line-height:2;color:#374151">${item.html}</div>`
    case 'code':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 16px"><tr><td align="center" class="em-code-wrap" style="padding:20px 12px;background:${soft};border:2px dashed ${mixHex(accent, '#ffffff', .45)};border-radius:16px">
<div class="em-code" dir="ltr" style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:34px;line-height:1.2;font-weight:800;letter-spacing:10px;color:${accent};padding-left:10px">${escapeHtml(item.code)}</div>
${item.caption ? `<div class="em-muted" style="margin-top:8px;font-size:12.5px;line-height:1.8;color:#6b7280">${escapeHtml(item.caption)}</div>` : ''}
</td></tr></table>`
    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 14px"><tr><td class="em-btn" bgcolor="${accent}" style="border-radius:12px;background:${accent};background-image:linear-gradient(135deg,${accent},${warm});box-shadow:0 10px 24px ${mixHex(accent, '#ffffff', .55)}">
<a href="${escapeHtml(item.href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;line-height:1.4;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(item.label)}&nbsp;&nbsp;&#8592;</a>
</td></tr></table>`
    case 'link':
      return `<p class="em-muted" style="margin:0 0 14px;font-size:12px;line-height:1.9;color:#9ca3af">${escapeHtml(item.label || 'اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:')}<br><a href="${escapeHtml(item.href)}" dir="ltr" style="color:${accent};word-break:break-all;text-decoration:none">${escapeHtml(item.href)}</a></p>`
    case 'quote':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 16px"><tr><td class="em-quote" style="padding:12px 16px;border-right:4px solid ${accent};background:#f8f8fc;border-radius:10px;font-size:14px;line-height:2;color:#4b5563">${lines(item.text)}</td></tr></table>`
    case 'card':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 18px"><tr><td bgcolor="${accent}" style="padding:26px 24px;border-radius:18px;background:${accent};background-image:linear-gradient(135deg,${accent} 0%,${warm} 100%);color:#ffffff">
<div style="font-size:13px;line-height:1.8;color:#ffffff;opacity:.85">${escapeHtml(item.label)}</div>
<div style="margin:6px 0 ${item.code ? '14px' : '0'};font-size:30px;line-height:1.4;font-weight:800;color:#ffffff">${escapeHtml(item.value)}</div>
${item.code ? `<span dir="ltr" style="display:inline-block;padding:10px 16px;border-radius:10px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:19px;letter-spacing:3px;color:#ffffff">${escapeHtml(item.code)}</span>` : ''}
</td></tr></table>`
    case 'note':
      return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 4px"><tr><td class="em-note" style="padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;font-size:12.5px;line-height:1.9;color:#92400e">${lines(item.text)}</td></tr></table>`
  }
}

/** The complete RTL email document. */
export function emailDocument(input: EmailDocumentInput): string {
  const accent = emailAccent(input.accent)
  const warm = accent === DEFAULT_ACCENT ? '#8b5cf6' : mixHex(accent, '#ec4899', .35)
  const soft = mixHex(accent, '#ffffff', .92)
  const site = input.site.replace(/\/+$/, '')
  const host = site.replace(/^https?:\/\//, '')
  const initial = escapeHtml(Array.from(input.brand.trim())[0] || 'M')
  const fonts = site ? `@font-face{font-family:'Vazirmatn';font-weight:400;src:url('${site}/fonts/Vazirmatn-Regular.ttf') format('truetype')}@font-face{font-family:'Vazirmatn';font-weight:700;src:url('${site}/fonts/Vazirmatn-Bold.ttf') format('truetype')}` : ''
  const footer = (input.footer || []).map((line) => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`).join('')
  const links = (input.footerLinks || []).map(([label, href]) => `<a href="${escapeHtml(href)}" style="color:#6b7280;text-decoration:underline">${escapeHtml(label)}</a>`).join(' &nbsp;·&nbsp; ')
  const font = `'Vazirmatn',Tahoma,'Segoe UI',Arial,sans-serif`
  return `<!doctype html>
<html lang="fa" dir="rtl" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(input.title)}</title>
<style>
${fonts}
body,table,td,a,p,div,h1{font-family:${font}}
a{color:${accent}}
@media (max-width:600px){.em-pad{padding-left:20px!important;padding-right:20px!important}.em-title{font-size:20px!important}.em-code{font-size:28px!important;letter-spacing:7px!important}}
@media (prefers-reduced-motion:no-preference){.em-card{animation:em-rise .7s cubic-bezier(.2,.8,.2,1) both}.em-icon{animation:em-pop .8s .25s cubic-bezier(.2,1.4,.4,1) both}.em-btn{animation:em-glow 2.8s 1s ease-in-out infinite}}
@keyframes em-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes em-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@keyframes em-glow{0%,100%{box-shadow:0 10px 24px ${mixHex(accent, '#ffffff', .55)}}50%{box-shadow:0 12px 34px ${mixHex(warm, '#ffffff', .3)}}}
@media (prefers-color-scheme:dark){
.em-bg{background:#0f1020!important}.em-card{background:#1a1b2e!important;border-color:#2c2e48!important}
.em-title,.em-greet,.em-brand{color:#f3f4f6!important}.em-text,.em-text p{color:#d1d5db!important}.em-muted,.em-foot,.em-foot a{color:#9ca3af!important}
.em-foot-cell{background:#15162a!important;border-color:#2c2e48!important}.em-quote{background:#22233a!important;color:#d1d5db!important}
.em-code-wrap{background:#22233a!important}.em-icon-cell{background:#26264a!important}
}
</style></head>
<body class="em-bg" style="margin:0;padding:0;background:#eef0f7;-webkit-text-size-adjust:100%;font-family:${font}">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(input.preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" bgcolor="#eef0f7" style="background:#eef0f7;background-image:linear-gradient(180deg,${soft} 0%,#eef0f7 320px)"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="padding:0 6px 18px;text-align:right" dir="rtl">
<table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>
<td bgcolor="${accent}" width="40" height="40" align="center" style="width:40px;height:40px;border-radius:12px;background:${accent};background-image:linear-gradient(135deg,${accent},${warm});color:#ffffff;font-size:19px;font-weight:bold;line-height:40px;text-align:center">${initial}</td>
<td style="padding-right:12px;text-align:right"><a href="${escapeHtml(site || '#')}" class="em-brand" style="color:#111827;text-decoration:none;font-size:17px;font-weight:bold;line-height:1.3">${escapeHtml(input.brand)}</a>${host ? `<div class="em-muted" dir="ltr" style="font-size:11.5px;line-height:1.5;color:#9ca3af;text-align:right">${escapeHtml(host)}</div>` : ''}</td>
</tr></table>
</td></tr>
<tr><td class="em-card" style="background:#ffffff;border:1px solid #e6e8f0;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(31,35,72,.10)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td height="6" bgcolor="${accent}" style="height:6px;line-height:6px;font-size:0;background:${accent};background-image:linear-gradient(90deg,${warm},${accent})">&nbsp;</td></tr>
<tr><td class="em-pad" dir="rtl" style="padding:34px 36px 10px;text-align:right">
${input.icon ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td class="em-icon em-icon-cell" width="56" height="56" align="center" style="width:56px;height:56px;border-radius:18px;background:${soft};font-size:26px;line-height:56px;text-align:center">${ICONS[input.icon]}</td></tr></table>` : ''}
${input.eyebrow ? `<p style="margin:0 0 6px;font-size:12.5px;font-weight:bold;line-height:1.6;color:${accent}">${escapeHtml(input.eyebrow)}</p>` : ''}
<h1 class="em-title" style="margin:0 0 14px;font-size:23px;line-height:1.7;font-weight:800;color:#111827">${escapeHtml(input.title)}</h1>
${input.greeting ? `<p class="em-greet" style="margin:0 0 10px;font-size:15px;line-height:2;color:#111827;font-weight:bold">${escapeHtml(input.greeting)}</p>` : ''}
${input.blocks.map((item) => block(item, accent, soft, warm)).join('\n')}
</td></tr>
${footer || links ? `<tr><td class="em-pad em-foot-cell" dir="rtl" style="padding:18px 36px 22px;background:#f8f9fc;border-top:1px solid #eef0f5;text-align:right"><div class="em-foot" style="font-size:12px;line-height:1.9;color:#6b7280">${footer}${links ? `<p style="margin:0">${links}</p>` : ''}</div></td></tr>` : '<tr><td height="22" style="height:22px;line-height:22px;font-size:0">&nbsp;</td></tr>'}
</table>
</td></tr>
<tr><td class="em-foot" align="center" style="padding:20px 12px 0;font-size:11.5px;line-height:1.9;color:#9ca3af;text-align:center">${escapeHtml(input.brand)}${host ? ` · <a href="${escapeHtml(site)}" style="color:#9ca3af;text-decoration:none" dir="ltr">${escapeHtml(host)}</a>` : ''}</td></tr>
</table>
</td></tr></table>
${input.trailer || ''}
</body></html>`
}
