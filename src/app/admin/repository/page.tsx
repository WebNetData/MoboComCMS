'use client'

import { useState } from 'react'
import { Notice, RepoShell, fa, kb, KIND, send, useJson } from './shared'

type Latest = { version: string; size: number; requiresCore: string; runtime: string; changelog: string; publishedAt: string }
type Product = {
  slug: string; kind: string; name: string; summary: string; icon: string; author: string; price: string; free: boolean; siteLimit: number; supportDays: number; featured: boolean
  latest: Latest | null; unverified: boolean; compatible: boolean; installed: { version: string; enabled: boolean } | null; update: string
  license: { state: string; last5: string; updatesUntil: string; checkedAt: string } | null
}
type Data = { connected: boolean; defaultUrl?: string; repository?: { url: string; name: string; fingerprint: string }; products?: Product[] }
type Meta = { url: string; name: string; fingerprint: string }

export default function BrowsePage() {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const { data, error, reload } = useJson<Data>(`/api/admin/repository/client?q=${encodeURIComponent(q)}&kind=${kind}`)
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [askKey, setAskKey] = useState<string | null>(null)

  const say = (tone: 'ok' | 'error', text: string) => setNotice({ tone, text })
  async function op(name: string, body: Record<string, unknown>, ok: string, busyKey = name) {
    setBusy(busyKey); setNotice(null)
    const result = await send<Record<string, unknown>>('/api/admin/repository/client', 'POST', { op: name, ...body })
    setBusy('')
    if (!result.ok) { say('error', result.error); return null }
    say('ok', ok)
    return result.data
  }
  async function check() { const r = await op('meta', { url: url || data?.defaultUrl || '' }, 'مخزن پیدا شد؛ اثر انگشت کلید را با ارائه‌دهنده تطبیق دهید.', 'meta'); if (r) setMeta(r as unknown as Meta) }
  async function connect() { if (!meta) return; if (await op('connect', { url: meta.url, fingerprint: meta.fingerprint }, 'به مخزن وصل شدید.', 'connect')) { setMeta(null); void reload() } }
  async function install(p: Product) { const r = await op('install', { slug: p.slug }, `«${p.name}» نصب شد. برای فعال‌سازی به «افزونه‌ها و ماژول‌ها» بروید.`, p.slug); if (r) void reload() }
  async function activate(p: Product) { const r = await op('activate', { slug: p.slug, key: keys[p.slug] || '' }, 'لایسنس روی این سایت فعال شد.', `k:${p.slug}`); if (r) { setAskKey(null); setKeys({ ...keys, [p.slug]: '' }); void reload() } }

  if (error) return <RepoShell title="مخزن افزونه و قالب"><Notice tone="error">{error}</Notice></RepoShell>
  if (!data) return <RepoShell title="مخزن افزونه و قالب"><div className="sa-skeleton" aria-busy="true" /></RepoShell>

  if (!data.connected) return <RepoShell title="مخزن افزونه و قالب">
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <section className="sa-card rp-connect">
      <header className="sa-card-head"><h2>اتصال به یک مخزن</h2></header>
      <p className="sa-hint">نشانی سایتی را وارد کنید که افزونه و قالب منتشر می‌کند. کلید امضای آن مخزن پس از تأیید شما ذخیره می‌شود و همهٔ نسخه‌ها و لایسنس‌ها با آن سنجیده می‌شوند؛ بستهٔ بدون امضای معتبر هرگز نصب نمی‌شود.</p>
      <label className="sa-field"><span>نشانی مخزن</span><input className="input" dir="ltr" type="url" value={url} placeholder={data.defaultUrl || 'https://plugins.example.com'} onChange={(e) => setUrl(e.target.value)} /></label>
      <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!!busy || (!url && !data.defaultUrl)} onClick={() => void check()}>{busy === 'meta' ? 'در حال بررسی…' : 'بررسی مخزن'}</button></div>
      {meta && <div className="rp-confirm" role="group" aria-label="تأیید کلید">
        <b>{meta.name || meta.url}</b>
        <p className="sa-hint">اثر انگشت کلید امضا را از راه دیگری (وب‌سایت یا پشتیبانی مخزن) با این مقدار تطبیق دهید:</p>
        <code dir="ltr">{meta.fingerprint}</code>
        <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void connect()}>تطبیق دادم؛ اتصال</button><button type="button" className="btn btn-ghost" onClick={() => setMeta(null)}>انصراف</button></div>
      </div>}
    </section>
  </RepoShell>

  const products = data.products || []
  return <RepoShell title="مخزن افزونه و قالب" actions={<>
    <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void op('refresh', {}, 'لایسنس‌ها بررسی شد.', 'refresh').then(() => reload())}>بررسی لایسنس‌ها</button>
    <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => { if (window.confirm('اتصال به این مخزن قطع شود؟ بسته‌های نصب‌شده می‌مانند.')) void op('disconnect', {}, 'قطع شد.', 'disconnect').then(() => reload()) }}>قطع اتصال</button>
  </>}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <p className="sa-hint">مخزن: <b>{data.repository?.name || data.repository?.url}</b> <span dir="ltr">({data.repository?.url})</span> · کلید <span dir="ltr">{data.repository?.fingerprint}</span></p>
    <div className="sa-filters">
      <div className="ad-range" role="group" aria-label="نوع">{[['', 'همه'], ['PLUGIN', 'افزونه‌ها'], ['THEME', 'قالب‌ها']].map(([k, label]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>)}</div>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو…" aria-label="جست‌وجو" />
    </div>
    <div className="rp-grid">{products.map((p) => <article key={p.slug} className="rp-card">
      <header><b>{p.name}</b><span className="sa-state">{KIND[p.kind]}</span></header>
      <p className="rp-sum">{p.summary || '—'}</p>
      <dl className="rp-meta">
        <div><dt>قیمت</dt><dd>{p.free ? 'رایگان' : `${fa(Number(p.price))} تومان`}</dd></div>
        <div><dt>آخرین نسخه</dt><dd dir="ltr">{p.latest?.version || '—'}{p.latest ? ` · ${kb(p.latest.size)}` : ''}</dd></div>
        {p.installed && <div><dt>نصب‌شده</dt><dd dir="ltr">{p.installed.version} {p.installed.enabled ? '' : '(غیرفعال)'}</dd></div>}
        {p.license && <div><dt>لایسنس</dt><dd>…{p.license.last5} · {p.license.state === 'active' ? 'فعال' : p.license.state === 'revoked' ? 'باطل‌شده' : 'بررسی نشد'}</dd></div>}
      </dl>
      {p.unverified && <p className="rp-warn" role="alert">امضای این نسخه با کلید مخزن تأیید نشد؛ نصب غیرفعال است.</p>}
      {!p.compatible && p.latest && <p className="rp-warn">به هستهٔ {p.latest.requiresCore} نیاز دارد.</p>}
      {p.latest?.changelog && <details><summary>تغییرات</summary><pre className="rp-notes">{p.latest.changelog}</pre></details>}
      <footer>
        {p.update && <span className="sa-state is-warn">نسخهٔ {p.update} آماده است</span>}
        {(!p.free && !p.license) || p.license?.state === 'revoked'
          ? (askKey === p.slug
            ? <span className="rp-key"><input className="input" dir="ltr" aria-label="کلید لایسنس" placeholder="MBC-XXXXX-XXXXX-XXXXX-XXXXX" value={keys[p.slug] || ''} onChange={(e) => setKeys({ ...keys, [p.slug]: e.target.value })} /><button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void activate(p)}>فعال‌سازی</button></span>
            : <button type="button" className="btn btn-primary btn-sm" onClick={() => setAskKey(p.slug)}>وارد کردن کلید لایسنس</button>)
          : <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !p.latest || !p.compatible || (!!p.installed && !p.update)} onClick={() => void install(p)}>{busy === p.slug ? 'در حال نصب…' : p.update ? `به‌روزرسانی به ${p.update}` : p.installed ? 'نصب‌شده' : 'نصب'}</button>}
        {p.license && p.license.state !== 'revoked' && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => { if (window.confirm('لایسنس از این سایت برداشته شود تا جای آن آزاد شود؟')) void op('deactivate', { slug: p.slug }, 'لایسنس از این سایت برداشته شد.', `d:${p.slug}`).then(() => reload()) }}>برداشتن لایسنس</button>}
      </footer>
    </article>)}
    {!products.length && <p className="sa-empty">محصولی پیدا نشد.</p>}</div>
  </RepoShell>
}
