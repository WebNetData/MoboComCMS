'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

type Mode = 'INHERIT' | 'ALLOWLIST' | 'DISABLED'
type Gateway = { ref: string; name: string; provider: string; manual: boolean; automatic?: boolean; isDefault: boolean; id: number | null }
type Policy = { mode: Mode; refs: string[]; version: number }
type AccessView = {
  catalog: Gateway[]
  merchant: { id: string; name: string; policy: Policy }
  terminals: { id: string; name: string; active: boolean; policy: Policy; effectiveRefs: string[] }[]
}

const modeNames: Record<Mode, string> = { INHERIT: 'استفاده از تنظیمات پذیرنده', ALLOWLIST: 'محدودکردن به درگاه‌های منتخب', DISABLED: 'توقف پذیرش پرداخت تازه' }
const reasonMin = 3

export default function MerchantGatewayAccess({ merchantId, disabled = false }: { merchantId: string; disabled?: boolean }) {
  const [view, setView] = useState<AccessView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [reload, setReload] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, { mode: Mode; refs: string[]; note: string; confirmed: boolean }>>({})

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setView(null); setDrafts({})
    api<AccessView>(`/api/admin/mobocom-pay/gateway-access?id=${encodeURIComponent(merchantId)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setView(result) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'دسترسی درگاه‌ها دریافت نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [merchantId, reload])

  const sortedCatalog = useMemo(() => view?.catalog ?? [], [view])
  const getDraft = useCallback((key: string, policy: Policy) => drafts[key] ?? { mode: policy.mode, refs: [...policy.refs], note: '', confirmed: false }, [drafts])
  const edit = (key: string, policy: Policy, update: Partial<ReturnType<typeof getDraft>>) => {
    setDrafts(current => ({ ...current, [key]: { ...(current[key] ?? { mode: policy.mode, refs: [...policy.refs], note: '', confirmed: false }), ...update } }))
    setFeedback('')
  }
  const save = async (terminalId: string | undefined, policy: Policy, draft: ReturnType<typeof getDraft>, key: string) => {
    if (!view || busy || disabled || draft.note.trim().length < reasonMin || !draft.confirmed) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const result = await api<AccessView>(`/api/admin/mobocom-pay/gateway-access?id=${encodeURIComponent(merchantId)}`, json('PATCH', {
        merchantId, ...(terminalId ? { terminalId } : {}), version: policy.version,
        mode: draft.mode, refs: draft.mode === 'ALLOWLIST' ? draft.refs : [], note: draft.note.trim(), confirmed: true,
      }))
      setView(result); setDrafts(current => { const next = { ...current }; delete next[key]; return next })
      setFeedback('سیاست دسترسی ذخیره شد و وضعیت جاری بازخوانی شد.')
    } catch (e) { setError(e instanceof Error ? e.message : 'ذخیرهٔ سیاست دسترسی ناموفق بود') }
    finally { setBusy(false) }
  }

  const renderPolicy = (title: string, policy: Policy, key: string, terminalId?: string, active?: boolean, effectiveRefs?: string[]) => {
    const draft = getDraft(key, policy)
    const selected = new Set(draft.refs)
    const ordered = draft.refs.map(ref => sortedCatalog.find(item => item.ref === ref)).filter((item): item is Gateway => Boolean(item))
    const unselected = sortedCatalog.filter(item => !selected.has(item.ref))
    const unsaved = draft.mode !== policy.mode || draft.refs.join('\0') !== policy.refs.join('\0')
    const inheritedOrder = effectiveRefs ?? sortedCatalog.slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map(gateway => gateway.ref)
    const disabledForm = disabled || busy || loading
    const toggle = (ref: string) => edit(key, policy, { refs: selected.has(ref) ? draft.refs.filter(value => value !== ref) : [...draft.refs, ref] })
    const move = (index: number, delta: number) => {
      const target = index + delta
      if (target < 0 || target >= draft.refs.length) return
      const refs = [...draft.refs]; [refs[index], refs[target]] = [refs[target], refs[index]]
      edit(key, policy, { refs })
    }
    return <section className={o.gatewayPolicy} aria-label={title} key={key}>
      <div className={o.gatewayHeading}><div><h4>{title}</h4>{typeof active === 'boolean' && <p className={s.muted}>{active ? 'پایانه فعال است.' : 'پایانه متوقف است؛ سیاست برای پرداخت‌های تازه پس از فعال‌سازی اعمال می‌شود.'}</p>}</div></div>
      <Field label="سیاست درگاه">
        <select value={draft.mode} disabled={disabledForm} onChange={e => edit(key, policy, { mode: e.target.value as Mode })}>
          {(Object.keys(modeNames) as Mode[]).map(mode => <option key={mode} value={mode}>{modeNames[mode]}</option>)}
        </select>
      </Field>
      <p className={`${s.muted} ${o.gatewayHelp}`}>
        {draft.mode === 'INHERIT' ? 'پایانه از ترتیب پذیرنده استفاده می‌کند. ترتیب پیش‌فرض پذیرنده از کاتالوگ می‌آید.' : draft.mode === 'ALLOWLIST' ? 'اولین درگاه آماده در این فهرست، روش پیشنهادی صفحهٔ پرداخت است.' : 'ساخت پرداخت تازه و شروع پرداخت‌های در انتظار متوقف می‌شود. پیگیری تراکنش‌های شروع‌شده ادامه دارد.'}
      </p>
      {draft.mode === 'ALLOWLIST' && <div className={o.gatewayChoices}>
        <fieldset disabled={disabledForm} className={o.gatewayFieldset}><legend>درگاه‌های مجاز</legend>
          {ordered.length === 0 && <p className={s.muted}>هنوز درگاهی انتخاب نشده است.</p>}
          <ol className={o.gatewayOrder}>
            {ordered.map((gateway, index) => <li key={gateway.ref}>
              <span className={o.gatewayPriority} aria-label={`اولویت ${index + 1}`}>{(index + 1).toLocaleString('fa-IR')}</span>
              <label className={o.gatewayLabel}><input type="checkbox" checked onChange={() => toggle(gateway.ref)} /><span>{gateway.name}<small>{gateway.provider}{gateway.isDefault ? ' · پیش‌فرض' : ''}</small></span></label>
              <div className={o.gatewayReorder}>
                <button type="button" className={s.secondary} aria-label={`بالاتر بردن ${gateway.name}`} disabled={disabledForm || index === 0} onClick={() => move(index, -1)}>بالاتر</button>
                <button type="button" className={s.secondary} aria-label={`پایین‌تر آوردن ${gateway.name}`} disabled={disabledForm || index === ordered.length - 1} onClick={() => move(index, 1)}>پایین‌تر</button>
              </div>
            </li>)}
          </ol>
          {unselected.length > 0 && <div className={o.gatewayAvailable}><p>افزودن درگاه</p>{unselected.map(gateway => <label key={gateway.ref} className={o.gatewayLabel}><input type="checkbox" checked={false} disabled={disabledForm} onChange={() => toggle(gateway.ref)} /><span>{gateway.name}<small>{gateway.provider}{gateway.isDefault ? ' · پیش‌فرض' : ''}</small></span></label>)}</div>}
        </fieldset>
      </div>}
      {draft.mode === 'INHERIT' && <p className={o.gatewayEffective}>ترتیب مؤثر: <bdi>{inheritedOrder.map(ref => sortedCatalog.find(item => item.ref === ref)?.name ?? ref).join(' ← ') || 'درگاه فعالی در کاتالوگ نیست'}</bdi></p>}
      {draft.mode === 'ALLOWLIST' && draft.refs.length === 0 && <p className={o.gatewayWarning} role="status">با فهرست خالی، پرداخت تازه امکان‌پذیر نیست. برای واگذاری ترتیب به پذیرنده، حالت استفاده از تنظیمات پذیرنده را انتخاب کنید.</p>}
      <div className={o.gatewaySave}>
        <Field label="دلیل تغییر"><textarea rows={2} minLength={reasonMin} maxLength={300} required value={draft.note} disabled={disabledForm} onChange={e => edit(key, policy, { note: e.target.value })} /></Field>
        <label className={s.check}><input type="checkbox" checked={draft.confirmed} disabled={disabledForm} onChange={e => edit(key, policy, { confirmed: e.target.checked })} />اثر این سیاست بر درخواست‌های پرداخت تازه را بررسی و تأیید می‌کنم.</label>
        <button type="button" className={s.button} disabled={disabledForm || !unsaved || draft.note.trim().length < reasonMin || !draft.confirmed || (draft.mode === 'ALLOWLIST' && draft.refs.length === 0)} onClick={() => void save(terminalId, policy, draft, key)}>ذخیرهٔ سیاست</button>
      </div>
    </section>
  }

  return <section className={`${s.stack} ${o.gatewayAccess}`} aria-labelledby="merchant-gateway-access-title" aria-busy={loading || busy}>
    <div className={s.row}><h3 id="merchant-gateway-access-title">دسترسی درگاه‌های پرداخت</h3><button type="button" className={s.secondary} disabled={loading || busy} onClick={() => setReload(value => value + 1)}>بازخوانی</button></div>
    <p className={s.muted}>سیاست پذیرنده سقف دسترسی همهٔ پایانه‌های اوست. هر پایانه می‌تواند فهرست را محدودتر کند.</p>
    <ErrorNotice error={error} />{feedback && <p className={s.notice} role="status">{feedback}</p>}{loading && <p role="status">در حال دریافت فهرست درگاه‌ها…</p>}
    {!loading && view && <>
      <div className={o.gatewayCatalog}><strong>درگاه‌های فعال پلتفرم</strong><span>{view.catalog.length.toLocaleString('fa-IR')} درگاه · {view.catalog.filter(g => g.manual).length.toLocaleString('fa-IR')} دستی · {view.catalog.filter(g => g.automatic).length.toLocaleString('fa-IR')} خودکار</span></div>
      {renderPolicy('سیاست پیش‌فرض پذیرنده', view.merchant.policy, 'merchant')}
      {view.terminals.map(terminal => renderPolicy(`پایانه: ${terminal.name}`, terminal.policy, `terminal:${terminal.id}`, terminal.id, terminal.active, terminal.effectiveRefs))}
      {!view.terminals.length && <p className={s.muted}>برای این پذیرنده پایانه‌ای ثبت نشده است.</p>}
    </>}
  </section>
}
