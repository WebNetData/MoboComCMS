'use client'

import { useEffect, useState, type FormEvent, useRef } from 'react'
import { Notice } from '../store/shared'

type Seal = { id: string; kind: 'enamad' | 'samandehi' | 'custom'; title: string; href: string; image: string; enabled: boolean }
type Config = { enabled: boolean; title: string; seals: Seal[] }
type Tone = { tone: 'ok' | 'error'; text: string } | null

const KIND_HELP: Record<Seal['kind'], string> = {
  enamad: 'کد را از پنل enamad.ir ← «کد نماد» کپی کنید.',
  samandehi: 'کد را از پنل samandehi.ir ← «دریافت کد نشان» کپی کنید.',
  custom: 'هر نشان دیگری (مجوز اتحادیه، زرین‌پال، …) با نشانی تصویر و پیوند.',
}

/** Trust seals in the footer: paste the issuer's embed code; only its link and logo address are kept. */
export default function TrustSealsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [saved, setSaved] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<Tone>(null)
  const [busy, setBusy] = useState(false)

  // Set before the early return below: hooks run in the same order on every render.
  const addFromCodeRunning = useRef(false)
  useEffect(() => {
    fetch('/api/admin/trust-seals', { cache: 'no-store' }).then((r) => r.json().then((data) => ({ ok: r.ok, data }))).then(({ ok, data }) => {
      if (!ok) { setNotice({ tone: 'error', text: data?.error || 'بارگذاری انجام نشد' }); return }
      setConfig(data.config); setSaved(JSON.stringify(data.config)); setLabels(data.labels)
    }).catch(() => setNotice({ tone: 'error', text: 'ارتباط برقرار نشد' }))
  }, [])

  if (!config) return <div className="sa" dir="rtl">{notice ? <Notice tone="error">{notice.text}</Notice> : <div className="sa-skeleton" />}</div>
  const dirty = JSON.stringify(config) !== saved
  const update = (id: string, patch: Partial<Seal>) => setConfig({ ...config, seals: config.seals.map((seal) => seal.id === id ? { ...seal, ...patch } : seal) })
  const move = (index: number, delta: number) => { const seals = [...config.seals]; const [item] = seals.splice(index, 1); seals.splice(index + delta, 0, item); setConfig({ ...config, seals }) }

  async function addFromCode(e: FormEvent) {
    e.preventDefault()
    if (addFromCodeRunning.current) return
    addFromCodeRunning.current = true
    try {
      if (!config) return
      setNotice(null)
      const response = await fetch('/api/admin/trust-seals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => null)
      const data = await response?.json().catch(() => null)
      if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'کد خوانده نشد' }); return }
      const taken = new Set(config.seals.map((seal) => seal.id))
      let id = data.seal.kind, n = 2
      while (taken.has(id)) id = `${data.seal.kind}-${n++}`
      setConfig({ ...config, seals: [...config.seals, { id, enabled: true, ...data.seal }] })
      setCode('')
      setNotice({ tone: 'ok', text: `${data.seal.title} اضافه شد؛ برای انتشار «ذخیره» را بزنید.` })
    
    } finally { addFromCodeRunning.current = false }
  }

  function addCustom() {
    if (!config) return
    setConfig({ ...config, seals: [...config.seals, { id: `seal-${Date.now().toString(36)}`, kind: 'custom', title: 'نماد جدید', href: '', image: 'https://', enabled: true }] })
  }

  async function save() {
    if (!config) return
    setBusy(true); setNotice(null)
    const response = await fetch('/api/admin/trust-seals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice({ tone: 'error', text: data?.error || 'ذخیره انجام نشد' }); return }
    const dropped = config.seals.length - data.config.seals.length
    setConfig(data.config); setSaved(JSON.stringify(data.config))
    setNotice(dropped > 0 ? { tone: 'error', text: `${dropped.toLocaleString('fa-IR')} نماد به‌خاطر نشانی تصویر نامعتبر (فقط https) ذخیره نشد.` } : { tone: 'ok', text: 'ذخیره شد و در فوتر سایت نمایش داده می‌شود.' })
  }

  return <div className="sa" dir="rtl">
    <header className="sa-head">
      <div><h1>نمادهای اعتماد</h1><p className="sa-hint">اینماد، ساماندهی و مجوزهای دیگر در پایین همهٔ صفحه‌ها. کد صادرکننده را جای‌گذاری کنید؛ فقط پیوند و تصویر آن نگه داشته می‌شود و هیچ اسکریپتی وارد سایت نمی‌شود.</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

    <div className="sa-cols">
      <section className="sa-card">
        <header className="sa-card-head"><h2>نمادها</h2><small>{config.seals.filter((seal) => seal.enabled).length.toLocaleString('fa-IR')} فعال</small></header>
        {config.seals.length === 0 ? <p className="sa-empty">هنوز نمادی اضافه نشده است. کد اینماد یا ساماندهی را در کادر کناری جای‌گذاری کنید.</p> : <ol className="ts-list">
          {config.seals.map((seal, index) => <li key={seal.id} className={`ts-row${seal.enabled ? '' : ' is-off'}`}>
            <div className="ts-logo">{/^https:\/\/.+/.test(seal.image) ? <img src={seal.image} alt="" referrerPolicy="origin" /> : <span>?</span>}</div>
            <div className="ts-body">
              <div className="sa-grid">
                <label className="sa-field"><span>عنوان</span><input className="input" value={seal.title} maxLength={80} onChange={(e) => update(seal.id, { title: e.target.value })} /></label>
                <label className="sa-field"><span>نوع</span><input className="input" value={labels[seal.kind] || seal.kind} readOnly /></label>
              </div>
              {seal.kind === 'custom' ? <div className="sa-grid">
                <label className="sa-field"><span>نشانی تصویر (https)</span><input className="input" dir="ltr" value={seal.image} onChange={(e) => update(seal.id, { image: e.target.value })} /></label>
                <label className="sa-field"><span>پیوند (اختیاری)</span><input className="input" dir="ltr" value={seal.href} onChange={(e) => update(seal.id, { href: e.target.value })} /></label>
              </div> : <p className="sa-hint" dir="ltr">{seal.href || seal.image}</p>}
              <div className="sa-row-actions">
                <label className="sa-check"><input type="checkbox" checked={seal.enabled} onChange={(e) => update(seal.id, { enabled: e.target.checked })} />نمایش</label>
                <button type="button" className="sa-link" disabled={index === 0} onClick={() => move(index, -1)}>بالا</button>
                <button type="button" className="sa-link" disabled={index === config.seals.length - 1} onClick={() => move(index, 1)}>پایین</button>
                <button type="button" className="sa-link is-danger" onClick={() => setConfig({ ...config, seals: config.seals.filter((item) => item.id !== seal.id) })}>حذف</button>
              </div>
            </div>
          </li>)}
        </ol>}
        <button type="button" className="btn btn-ghost" onClick={addCustom}>+ نماد دلخواه با نشانی تصویر</button>
      </section>

      <div className="sa-stack">
        <form className="sa-card sa-form" onSubmit={addFromCode}>
          <header className="sa-card-head"><h2>افزودن از کد صادرکننده</h2></header>
          <label className="sa-field"><span>کد HTML نماد</span><textarea className="input" dir="ltr" rows={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder={'<a referrerpolicy=\'origin\' target=\'_blank\' href=\'https://trustseal.enamad.ir/?id=…&Code=…\'><img referrerpolicy=\'origin\' src=\'https://trustseal.enamad.ir/logo.aspx?id=…&Code=…\' …></a>'} required /></label>
          <ul className="ts-help">{(['enamad', 'samandehi', 'custom'] as const).map((kind) => <li key={kind}><b>{labels[kind]}:</b> {KIND_HELP[kind]}</li>)}</ul>
          <div className="sa-head-actions"><button type="submit" className="btn btn-primary" disabled={!code.trim()}>خواندن و افزودن</button></div>
        </form>
        <section className="sa-card sa-form">
          <header className="sa-card-head"><h2>نمایش</h2></header>
          <label className="sa-check"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />نمایش نمادها در فوتر سایت</label>
          <label className="sa-field"><span>عنوان بخش</span><input className="input" value={config.title} maxLength={80} onChange={(e) => setConfig({ ...config, title: e.target.value })} /></label>
          <p className="sa-hint">اینماد نشانی ارجاع‌دهنده را با دامنهٔ ثبت‌شده مقایسه می‌کند؛ نماد فقط روی دامنهٔ اصلی سایت (نه localhost) درست نمایش داده می‌شود.</p>
        </section>
      </div>
    </div>
  </div>
}
