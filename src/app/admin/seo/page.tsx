'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

type Config = {
  titleTemplate: string; homeTitle: string; description: string; keywords: string[]; brandLatin: string; ogImage: string; logo: string
  verification: { google: string; bing: string; yandex: string }; sameAs: string[]
  organization: { legalName: string; email: string; phone: string; address: string }
  indexNow: { enabled: boolean; key: string }; allowAiCrawlers: boolean
}
type Check = { id: string; ok: boolean; severity: 'error' | 'warning' | 'info'; fa: string; hint: string }
type Issue = { severity: 'error' | 'warning'; code: string; kind: string; title: string; path: string }
type LogEntry = { at: string; count: number; status: number; urls: string[]; error?: string }
type Audit = { base: string; score: number; checks: Check[]; issues: Issue[]; totals: { items: number; errors: number; warnings: number }; log: LogEntry[] }

const ISSUE_LABEL: Record<string, string> = {
  'description-missing': 'بدون توضیح (meta description)', 'description-short': 'توضیح کوتاه‌تر از ۵۰ حرف', 'description-long': 'توضیح بلندتر از ۱۷۰ حرف',
  'image-missing': 'بدون تصویر شاخص', 'thin-content': 'متن کم (زیر ۱۲۰ کلمه)', 'title-long': 'عنوان بلندتر از ۷۰ حرف', 'title-duplicate': 'عنوان تکراری',
}
const KIND_LABEL: Record<string, string> = { post: 'مجله', product: 'محصول', software: 'نرم‌افزار', page: 'صفحه', game: 'بازی', cinema: 'فیلم/سریال' }
const EDIT_LINK: Record<string, string> = { post: '/admin/posts', product: '/admin/products', software: '/admin/software/titles', page: '/admin/pages', game: '/admin/games', cinema: '/admin/cinema/titles' }

/** SEO center: readiness score, settings, instant indexing and a content audit. */
export default function AdminSeoPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [filter, setFilter] = useState('')
  const revision = useRef('')
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/seo', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) { setMessage({ text: data?.error || 'دریافت اطلاعات ناموفق بود', error: true }); return }
    setConfig(data.config); setAudit(data.audit); revision.current = data.settingsRevision || ''
  }, [])
  useEffect(() => { void load() }, [load])

  async function call(method: string, body: unknown, success: string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/seo', { method, headers: { 'Content-Type': 'application/json', ...(method === 'PUT' && revision.current ? { 'If-Match': revision.current } : {}) }, body: JSON.stringify(body) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: data?.error || 'انجام نشد', error: true }); return null }
    setMessage({ text: success, error: false })
    await load()
    return data
  }
  if (!config || !audit) return <div className="xm-page" dir="rtl"><div className="tb-empty">{message?.text || 'در حال بارگذاری…'}</div></div>
  const set = <K extends keyof Config>(key: K, value: Config[K]) => setConfig({ ...config, [key]: value })
  const tone = audit.score >= 85 ? 'is-good' : audit.score >= 60 ? 'is-mid' : 'is-bad'
  const shown = audit.issues.filter((issue) => !filter || issue.code === filter)
  const codes = [...new Set(audit.issues.map((issue) => issue.code))]

  return <div className="xm-page seo-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">سئو</span><h1>مرکز سئو</h1><p>تنظیمات موتورهای جست‌وجو و دستیارهای هوش مصنوعی، ایندکس فوری با IndexNow و بررسی محتوای سایت.</p><div className="xm-head-actions"><SectionSettingsHistoryLink section="seo" /></div></div></header>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    <section className="seo-overview">
      <div className={`card seo-score ${tone}`}><b>{audit.score.toLocaleString('fa-IR')}</b><span>امتیاز آمادگی سئو</span><small>{audit.totals.items.toLocaleString('fa-IR')} صفحهٔ محتوا · {audit.totals.errors.toLocaleString('fa-IR')} خطا · {audit.totals.warnings.toLocaleString('fa-IR')} هشدار</small></div>
      <ul className="card seo-checks">{audit.checks.map((check) => <li key={check.id} className={check.ok ? 'is-ok' : `is-${check.severity}`}><span aria-hidden="true">{check.ok ? '✓' : check.severity === 'error' ? '✕' : '!'}</span><div><b>{check.fa}</b>{!check.ok && <small>{check.hint}</small>}</div></li>)}</ul>
    </section>

    <section className="card seo-links">
      <b>فایل‌های عمومی</b>
      {[['/sitemap.xml', 'نقشهٔ سایت'], ['/robots.txt', 'robots.txt'], ['/llms.txt', 'llms.txt (برای هوش مصنوعی)'], ['/feed.xml', 'خبرخوان RSS'], ['/og.png', 'تصویر اشتراک‌گذاری']].map(([href, label]) => <a key={href} href={href} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">{label} ↗</a>)}
    </section>

    <form className="xm-section" onSubmit={(event) => { event.preventDefault(); void call('PUT', config, 'تنظیمات سئو ذخیره شد') }}>
      <h2>تنظیمات</h2>
      <div className="card seo-form">
        <label className="studio-field"><span>عنوان صفحهٔ اول</span><input className="input" value={config.homeTitle} onChange={(e) => set('homeTitle', e.target.value)} maxLength={120} placeholder="موبوکام | فروشگاه و سرگرمی دیجیتال"/><small className="muted">حداکثر ۶۰ تا ۷۰ حرف؛ مهم‌ترین کلمهٔ کلیدی اول.</small></label>
        <label className="studio-field"><span>قالب عنوان صفحه‌ها</span><input className="input" dir="ltr" value={config.titleTemplate} onChange={(e) => set('titleTemplate', e.target.value)} maxLength={120}/><small className="muted">%s = عنوان صفحه، {'{brand}'} = نام سایت</small></label>
        <label className="studio-field seo-wide"><span>توضیحات سایت (meta description)</span><textarea className="input" rows={3} value={config.description} onChange={(e) => set('description', e.target.value)} maxLength={320}/><small className={`muted${config.description.length > 160 ? ' error-text' : ''}`}>{config.description.length.toLocaleString('fa-IR')} حرف — بهترین طول ۷۰ تا ۱۶۰</small></label>
        <label className="studio-field seo-wide"><span>کلمات کلیدی اصلی (با ویرگول)</span><input className="input" value={config.keywords.join('، ')} onChange={(e) => set('keywords', e.target.value.split(/[,،]/).map((k) => k.trim()).filter(Boolean))}/></label>
        <label className="studio-field"><span>نام لاتین برند</span><input className="input" dir="ltr" value={config.brandLatin} onChange={(e) => set('brandLatin', e.target.value)} maxLength={40}/></label>
        <label className="studio-field"><span>تصویر اشتراک‌گذاری (۱۲۰۰×۶۳۰)</span><input className="input" dir="ltr" value={config.ogImage} onChange={(e) => set('ogImage', e.target.value)} placeholder="/og.png"/></label>
        <label className="studio-field"><span>لوگوی سازمان (مربعی)</span><input className="input" dir="ltr" value={config.logo} onChange={(e) => set('logo', e.target.value)} placeholder="https://…/logo.png"/></label>
        <label className="studio-field"><span>نام حقوقی شرکت</span><input className="input" value={config.organization.legalName} onChange={(e) => set('organization', { ...config.organization, legalName: e.target.value })}/></label>
        <label className="studio-field"><span>ایمیل پشتیبانی</span><input className="input" dir="ltr" value={config.organization.email} onChange={(e) => set('organization', { ...config.organization, email: e.target.value })}/></label>
        <label className="studio-field"><span>تلفن</span><input className="input" dir="ltr" value={config.organization.phone} onChange={(e) => set('organization', { ...config.organization, phone: e.target.value })}/></label>
        <label className="studio-field seo-wide"><span>نشانی</span><input className="input" value={config.organization.address} onChange={(e) => set('organization', { ...config.organization, address: e.target.value })}/></label>
        <label className="studio-field seo-wide"><span>صفحه‌های رسمی (هر خط یک نشانی: اینستاگرام، تلگرام، لینکدین…)</span><textarea className="input" dir="ltr" rows={3} value={config.sameAs.join('\n')} onChange={(e) => set('sameAs', e.target.value.split('\n'))}/></label>
      </div>
      <h2>تأیید مالکیت</h2>
      <div className="card seo-form">
        <label className="studio-field"><span>Google Search Console</span><input className="input" dir="ltr" value={config.verification.google} onChange={(e) => set('verification', { ...config.verification, google: e.target.value })} placeholder="کد یا کل تگ meta"/></label>
        <label className="studio-field"><span>Bing Webmaster (منبع ChatGPT و Copilot)</span><input className="input" dir="ltr" value={config.verification.bing} onChange={(e) => set('verification', { ...config.verification, bing: e.target.value })}/></label>
        <label className="studio-field"><span>Yandex Webmaster</span><input className="input" dir="ltr" value={config.verification.yandex} onChange={(e) => set('verification', { ...config.verification, yandex: e.target.value })}/></label>
      </div>
      <h2>ایندکس فوری و هوش مصنوعی</h2>
      <div className="card seo-form">
        <label className="studio-switch seo-wide"><input type="checkbox" checked={config.indexNow.enabled} onChange={(e) => set('indexNow', { ...config.indexNow, enabled: e.target.checked })}/>ارسال خودکار صفحه‌های جدید و ویرایش‌شده به IndexNow (Bing، Yandex و موتورهای شریک)</label>
        <label className="studio-switch seo-wide"><input type="checkbox" checked={config.allowAiCrawlers} onChange={(e) => set('allowAiCrawlers', e.target.checked)}/>اجازه به ChatGPT، Claude، Perplexity، Gemini و دیگر دستیارها برای خواندن صفحه‌های عمومی</label>
        {config.indexNow.key && <small className="muted seo-wide" dir="ltr">IndexNow key: {config.indexNow.key}</small>}
      </div>
      <div className="seo-actions"><button type="submit" className="btn btn-primary" disabled={busy}>ذخیرهٔ تنظیمات</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void call('POST', { action: 'submit-all' }, 'همهٔ صفحه‌های نقشهٔ سایت به IndexNow ارسال شد')}>ارسال همهٔ صفحه‌ها به IndexNow</button></div>
    </form>

    {audit.log.length > 0 && <section className="xm-section"><h2>آخرین ارسال‌های IndexNow</h2><div className="card"><table className="table"><thead><tr><th>زمان</th><th>تعداد</th><th>نتیجه</th></tr></thead><tbody>{audit.log.map((entry, index) => <tr key={index}><td>{new Date(entry.at).toLocaleString('fa-IR')}</td><td>{entry.count.toLocaleString('fa-IR')}</td><td>{entry.status >= 200 && entry.status < 300 ? <span className="badge badge-green">موفق ({entry.status})</span> : <span className="badge badge-red" title={entry.error}>{entry.status || 'خطا'}</span>}</td></tr>)}</tbody></table></div></section>}

    <section className="xm-section">
      <h2>بررسی محتوا</h2>
      <nav className="md-chips seo-filter"><button type="button" className={!filter ? 'is-active' : ''} onClick={() => setFilter('')}>همه ({audit.issues.length.toLocaleString('fa-IR')})</button>{codes.map((code) => <button type="button" key={code} className={filter === code ? 'is-active' : ''} onClick={() => setFilter(code)}>{ISSUE_LABEL[code] || code} ({audit.issues.filter((i) => i.code === code).length.toLocaleString('fa-IR')})</button>)}</nav>
      {shown.length ? <div className="card table-wrap"><table className="table"><thead><tr><th>مورد</th><th>بخش</th><th>مشکل</th><th /></tr></thead><tbody>{shown.slice(0, 150).map((issue, index) => <tr key={`${issue.path}-${issue.code}-${index}`}><td><a href={issue.path} target="_blank" rel="noreferrer">{issue.title}</a></td><td>{KIND_LABEL[issue.kind] || issue.kind}</td><td><span className={`badge ${issue.severity === 'error' ? 'badge-red' : 'badge-amber'}`}>{ISSUE_LABEL[issue.code] || issue.code}</span></td><td><a className="btn btn-ghost btn-sm" href={EDIT_LINK[issue.kind] || '/admin'}>ویرایش</a></td></tr>)}</tbody></table></div> : <div className="tb-empty">مشکلی پیدا نشد 🎉</div>}
    </section>
  </div>
}
