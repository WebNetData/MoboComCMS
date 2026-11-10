'use client'
import { configurableAiBase } from '@/modules/ai/domain/ai'
import { useEffect, useRef, useState } from 'react'

type Provider = { id: string; label: string; model: string }
type Config = { provider: string; model: string; baseUrl: string; hasKey: boolean }
type Route = { id: string; label: string; personal: boolean; source: string; config: Config | null; effective: { source: string; provider: string; model: string; inheritedFrom: string }; readiness?: { configured: boolean; source: string; provider: string; model: string; message: string } }
const endpoint = '/api/admin/ai/routing'

export default function AiRouting() {
  const [data, setData] = useState<{ routes: Route[]; providers: Provider[] } | null>(null), [error, setError] = useState(''), [forbidden, setForbidden] = useState(false), [purpose, setPurpose] = useState('support'), [revision, setRevision] = useState(0), [saving, setSaving] = useState(false), [saved, setSaved] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 403) { setForbidden(true); return }
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'دریافت کاربردها انجام نشد')
      setData(body)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [])
  if (forbidden) return null
  const selected = data?.routes.find(r => r.id === purpose)
  return <section className="card seo-form" aria-label="سرویس هوش مصنوعی هر بخش">
    <header className="seo-wide"><h2>سرویس و مدل هر بخش</h2><p className="muted">برای نمونه، پشتیبانی با Gemini و ابزارهای مدیریت با حساب شخصی ChatGPT کار کنند. انتخاب هر بخش مستقل است؛ مجموعهٔ کلیدها در صورت فعال‌بودن فقط در همان سرویس و مقصد جابه‌جا می‌شود.</p></header>
    <nav className="seo-actions seo-wide" aria-label="ابزارهای هستهٔ هوش مصنوعی"><a className="btn btn-ghost" href="/admin/ai/operations">دستیار عملیاتی</a><a className="btn btn-ghost" href="/admin/server/engineering">مهندسی، مهارت‌ها و معماری</a><a className="btn btn-ghost" href="/admin/chat">پشتیبانی و دانش پاسخ‌گویی</a></nav>
    {error && <p className="xm-notice is-error seo-wide" role="alert">{error}</p>}
    {!data && !error && <p className="seo-wide" role="status">در حال دریافت تنظیمات بخش‌ها…</p>}
    {data && selected && <>
      {saved && <p className="xm-notice seo-wide" role="status">{saved}</p>}
      <label className="studio-field seo-wide"><span>بخش یا کاربرد</span><select className="input" value={purpose} disabled={saving} onChange={e => { setPurpose(e.target.value); setSaved('') }}>{data.routes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      {selected.readiness && <div className="xm-notice seo-wide" role="status"><strong>{selected.readiness.configured ? 'پیکربندی آماده است' : 'نیازمند تنظیم'} · {selected.label}</strong><p>{selected.readiness.message}</p>{selected.readiness.provider && <p dir="ltr">{selected.readiness.provider} · {selected.readiness.model}</p>}<small>این بررسی سهمیه مصرف نمی‌کند و جایگزین آزمایش اتصال زنده نیست.</small></div>}
      <RoutingForm key={`${purpose}:${revision}`} route={selected} providers={data.providers} routes={data.routes} onBusy={setSaving} onSaved={routes => { setData(current => current ? { ...current, routes } : current); setRevision(v => v + 1); setSaved(`تنظیم ${selected.label} ذخیره شد`) }} />
    </>}
  </section>
}

function RoutingForm({ route, providers, routes, onSaved, onBusy }: { route: Route; providers: Provider[]; routes: Route[]; onSaved: (routes: Route[]) => void; onBusy: (busy: boolean) => void }) {
  const [source, setSource] = useState(route.source), [form, setForm] = useState({ provider: route.config?.provider || providers[0]?.id || 'gemini', model: route.config?.model || '', baseUrl: route.config?.baseUrl || '', apiKey: '', clearKey: false })
  const [patch, setPatch] = useState<Record<string, unknown>>({}), [sourceChanged, setSourceChanged] = useState(false), [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(false)
  const running = useRef(false), dirty = sourceChanged || Object.keys(patch).length > 0
  const edit = (values: Partial<typeof form>) => { setForm(current => ({ ...current, ...values })); setPatch(current => ({ ...current, ...values })) }
  const inherited = route.id !== 'admin' && route.personal ? 'پیش‌فرض ابزارهای مدیریت' : 'پیش‌فرض سایت'
  const effective = route.effective.source === 'personal' ? 'حساب شخصی ChatGPT هر مدیر' : route.effective.source === 'api' ? `${providers.find(p => p.id === route.effective.provider)?.label || route.effective.provider} · ${route.effective.model || 'مدل پیش‌فرض سرویس'}` : 'تنظیمات پیش‌فرض سایت'
  async function run(command: 'save' | 'test') {
    if (running.current) return
    running.current = true; onBusy(true); setBusy(command); setNotice(''); setError(false)
    try {
      const response = await fetch(command === 'save' ? endpoint : '/api/admin/ai', { method: command === 'save' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command === 'save' ? { purpose: route.id, ...(sourceChanged ? { source } : {}), ...(Object.keys(patch).length ? { config: patch } : {}) } : { action: 'test', purpose: route.id }) })
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'عملیات انجام نشد')
      if (command === 'save') onSaved(body.routes)
      else setNotice(`اتصال ${route.label} برقرار است؛ مدل: ${body.model}. ${body.reply}`)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'عملیات انجام نشد'); setError(true) }
    finally { running.current = false; onBusy(false); setBusy('') }
  }
  return <>
    <p className="muted seo-wide">تنظیم ذخیره‌شده: {effective}{route.effective.inheritedFrom && `؛ ارث‌برده از ${routes.find(r => r.id === route.effective.inheritedFrom)?.label || inherited}`}</p>
    <label className="studio-field seo-wide"><span>روش اتصال {route.label}</span><select className="input" value={source} disabled={!!busy} onChange={e => { setSource(e.target.value); setSourceChanged(true) }}><option value="inherit">استفاده از {inherited}</option><option value="api">API و مدل مستقل</option>{route.personal && <option value="personal">حساب شخصی ChatGPT همان مدیر</option>}</select></label>
    {source === 'personal' && <p className="xm-notice seo-wide">هر مدیر باید اتصال شخصی خودش را در کارت ChatGPT فعال کند. این انتخاب حساب شما را در اختیار کاربران یا مدیران دیگر نمی‌گذارد؛ بدون اتصال فعال، خطا نمایش داده می‌شود.</p>}
    {source === 'api' && <>
      <label className="studio-field"><span>سرویس API</span><select className="input" value={form.provider} disabled={!!busy} onChange={e => edit({ provider: e.target.value, model: '', baseUrl: '', apiKey: '' })}>{providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label className="studio-field"><span>مدل این بخش</span><input className="input" dir="ltr" value={form.model} disabled={!!busy} maxLength={120} placeholder={providers.find(p => p.id === form.provider)?.model || 'Model ID'} onChange={e => edit({ model: e.target.value })} /></label>
      {configurableAiBase(form.provider) && <label className="studio-field seo-wide"><span>نشانی API سازگار با OpenAI</span><input className="input" type="url" dir="ltr" value={form.baseUrl} disabled={!!busy} maxLength={300} placeholder="https://api.openai.com/v1" onChange={e => edit({ baseUrl: e.target.value })} /></label>}
      <label className="studio-field"><span>کلید API این بخش</span><input className="input" type="password" autoComplete="new-password" dir="ltr" value={form.apiKey} disabled={!!busy} maxLength={400} placeholder={route.config?.hasKey ? 'کلید ذخیره شده؛ خالی یعنی حفظ' : 'API key'} onChange={e => edit({ apiKey: e.target.value, clearKey: false })} /></label>
      <label className="studio-switch" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.clearKey} disabled={!!busy} onChange={e => edit({ clearKey: e.target.checked, apiKey: '' })} />پاک‌کردن کلید ذخیره‌شده</label>
      <p className="muted seo-wide">کلید فقط در سرور نگهداری می‌شود. تغییر سرویس یا نشانی، کلید قبلی را حذف می‌کند؛ برای مقصد تازه کلید مناسب وارد کنید. برای OpenAI API گزینهٔ سازگار با OpenAI را با نشانی رسمی و مدل مجاز حسابتان تنظیم کنید؛ هزینهٔ آن از اتصال شخصی ChatGPT جداست.</p>
    </>}
    {notice && <p className={`xm-notice seo-wide${error ? ' is-error' : ''}`} role="status">{notice}</p>}
    <div className="seo-actions seo-wide"><button className="btn btn-primary" type="button" disabled={!!busy || !dirty} onClick={() => void run('save')}>{busy === 'save' ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیم این بخش'}</button><button className="btn btn-ghost" type="button" disabled={!!busy || !!dirty || route.id === 'production-image'} onClick={() => void run('test')}>{busy === 'test' ? 'در حال آزمایش…' : 'آزمایش کاربرد انتخاب‌شده'}</button><span className="muted">{dirty ? 'ابتدا تغییرات را ذخیره کنید' : route.id === 'production-image' ? 'آزمایش تصویر از صفحهٔ تولید انبوه انجام می‌شود؛ این مدل برای درخواست متنی آزمایش نمی‌شود' : 'آزمایش یک درخواست از سرویس ذخیره‌شده مصرف می‌کند'}</span></div>
  </>
}
