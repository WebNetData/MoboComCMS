'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import StatusBadge from '@/components/StatusBadge'
import { useI18n } from '@/i18n/LocaleProvider'
import { formatCurrency, BASE_CURRENCY } from '@/shared/money/client'

interface InvoiceRow {
  id: number; number: string; user: { id: number; email: string; name: string } | null
  orderId: number | null; planName: string; productName: string; subtotal: number; discount: number; tax: number
  total: number; walletApplied: number; amountDue: number; currency: string; status: string; gatewayName: string
  paidCrypto: string; paidAmount: number; issuedAt: string; dueAt: string | null; paidAt: string | null; notes: string
}
const STATUSES = ['', 'UNPAID', 'PAID', 'VOID', 'REFUNDED', 'DRAFT']

export default function AdminInvoicesPage() {
  const { t, locale } = useI18n(); const isFa = locale === 'fa'
  const [rows, setRows] = useState<InvoiceRow[]>([]); const [counts, setCounts] = useState<Record<string, number>>({})
  const [paidTotal, setPaidTotal] = useState(0); const [status, setStatus] = useState(''); const [q, setQ] = useState('')
  const [currency, setCurrency] = useState(BASE_CURRENCY); const [currencies, setCurrencies] = useState<string[]>([BASE_CURRENCY])
  const [loading, setLoading] = useState(true); const [msg, setMsg] = useState(''); const [msgOk, setMsgOk] = useState(false); const [showForm, setShowForm] = useState(false)
  const [users, setUsers] = useState<any[]>([]); const [plans, setPlans] = useState<any[]>([]); const [products, setProducts] = useState<any[]>([]); const [gateways, setGateways] = useState<any[]>([])
  const [form, setForm] = useState<any>({ userId:'', kind:'plan', planId:'', productId:'', subtotal:'', discount:'', tax:'', currency:BASE_CURRENCY, gatewayId:'', dueDays:7, notes:'', status:'UNPAID' })

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ status, q, currency })
    const res = await fetch(`/api/admin/invoices?${qs}`)
    if (res.ok) { const data = await res.json(); setRows(data.invoices || []); setCounts(data.counts || {}); setPaidTotal(data.paidTotal || 0); setCurrencies(data.currencies || [data.currency || currency]) }
    setLoading(false)
  }, [status, q, currency])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/users?slim=1').then(r=>r.ok?r.json():{users:[]}),
      fetch('/api/plans').then(r=>r.ok?r.json():[]),
      fetch('/api/public/cms?type=products').then(r=>r.ok?r.json():[]),
      fetch('/api/admin/gateways').then(r=>r.ok?r.json():{gateways:[]}),
    ]).then(([u,p,pr,g]) => { setUsers(u.users||[]); setPlans(Array.isArray(p)?p:p.plans||[]); setProducts(Array.isArray(pr)?pr:[]); setGateways(g.gateways||[]) })
  }, [])

  const money = (n:number, c=currency) => formatCurrency(n || 0, c, isFa?'fa-IR':'en-US')
  const fmtDate = (d:string|null) => d ? new Date(d).toLocaleDateString(isFa?'fa-IR':'en-US') : '—'
  const unpaidTotal = rows.filter(i=>i.status==='UNPAID').reduce((a,i)=>a+i.amountDue,0)
  const filteredNotices = useMemo(()=>msg,[msg])
  const itemCurrency = form.kind==='plan' ? plans.find(p=>String(p.id)===String(form.planId))?.currency : form.kind==='product' ? products.find(p=>String(p.id)===String(form.productId))?.currency : form.currency

  async function act(id:number, action:string, extra:Record<string,unknown>={}) {
    setMsg(''); const res=await fetch('/api/admin/invoices',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,...extra})}); const data=await res.json().catch(()=>null)
    setMsgOk(res.ok); setMsg(res.ok ? (data?.warning ? `⚠ ${data.warning}` : `${action} ✓`) : data?.error||t.errGeneric); load()
  }
  async function remove(id:number) { if(!confirm(t.confirmDelete))return; const res=await fetch(`/api/admin/invoices?id=${id}`,{method:'DELETE'}); const data=await res.json().catch(()=>null); if(!res.ok){setMsgOk(false);setMsg(data?.error||t.errGeneric)}; load() }
  async function create(e:React.FormEvent) {
    e.preventDefault(); setMsg('')
    const body:any={userId:Number(form.userId),discount:form.discount||0,tax:form.tax||0,subtotal:form.subtotal||0,currency:itemCurrency||form.currency,gatewayId:form.gatewayId?Number(form.gatewayId):null,dueDays:Number(form.dueDays)||7,notes:form.notes,status:form.status}
    if(form.kind==='plan')body.planId=Number(form.planId); if(form.kind==='product')body.productId=Number(form.productId)
    const res=await fetch('/api/admin/invoices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await res.json().catch(()=>null)
    if(!res.ok){setMsgOk(false);setMsg(data?.error||t.errGeneric);return} setMsgOk(true);setMsg(`${t.invoiceCreated}: ${data.number}`);setShowForm(false);setForm((f:any)=>({...f,userId:'',subtotal:'',discount:'',tax:'',notes:''}));setCurrency(data.currency||currency);load()
  }
  const activePlans=plans.filter(p=>p.active!==false)

  return <div>
    <div className="flex items-center justify-between flex-wrap gap-3 mb-6"><div><h1 className="h2">{t.invoicesAdmin}</h1><p className="muted">{t.invoicesHint}</p></div><div className="flex items-center gap-2">
      <select className="select imp-w-24" value={currency} onChange={e=>setCurrency(e.target.value)} aria-label={t.currency}>{currencies.map(c=><option key={c}>{c}</option>)}</select>
      <Link href="/admin/finance" className="btn btn-ghost">{t.financeAdmin}</Link><button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?t.cancel:`+ ${t.addInvoice}`}</button>
    </div></div>

    <div className="grid-4 mb-6">
      <div className="card kpi kpi-green"><div className="kpi-icon">✓</div><div><div className="muted text-xs">{t.collected}</div><div className="num text-2xl font-extrabold">{money(paidTotal)}</div></div></div>
      <div className="card kpi kpi-amber"><div className="kpi-icon">⌛</div><div><div className="muted text-xs">{t.unpaidAmount}</div><div className="num text-2xl font-extrabold">{money(unpaidTotal)}</div></div></div>
      <div className="card kpi"><div className="kpi-icon">#</div><div><div className="muted text-xs">{t.invoices}</div><div className="num text-2xl font-extrabold">{rows.length}</div></div></div>
      <div className="card kpi"><div className="kpi-icon">↩</div><div><div className="muted text-xs">{t.refunds}</div><div className="num text-2xl font-extrabold">{counts.REFUNDED||0}</div></div></div>
    </div>

    {showForm && <form onSubmit={create} className="card mb-6 grid-3 items-end">
      <div><label className="label">{t.customer}</label><select className="select" value={form.userId} onChange={e=>setForm({...form,userId:e.target.value})} required><option value="">{t.selectCustomer}</option>{users.map(u=><option key={u.id} value={u.id}>{u.email}{u.name?` — ${u.name}`:''}</option>)}</select></div>
      <div><label className="label">{t.itemType}</label><select className="select" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value,planId:'',productId:'',subtotal:''})}><option value="plan">{t.plan}</option><option value="product">{t.product}</option><option value="custom">{t.customAmount}</option></select></div>
      {form.kind==='plan'&&<div><label className="label">{t.plan}</label><select className="select" value={form.planId} onChange={e=>{const p=activePlans.find(x=>String(x.id)===e.target.value);setForm({...form,planId:e.target.value,subtotal:p?String(p.price):'',currency:p?.currency||form.currency})}} required><option value="">{t.selectPlan}</option>{activePlans.map(p=><option key={p.id} value={p.id}>{p.name} — {money(p.price,p.currency||'USD')}</option>)}</select></div>}
      {form.kind==='product'&&<div><label className="label">{t.product}</label><select className="select" value={form.productId} onChange={e=>{const p=products.find(x=>String(x.id)===e.target.value);setForm({...form,productId:e.target.value,subtotal:p?String(p.price):'',currency:p?.currency||form.currency})}} required><option value="">{t.selectProduct}</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {money(p.price,p.currency||'USD')}</option>)}</select></div>}
      {form.kind==='custom'&&<div><label className="label">{t.currency}</label><input className="input" dir="ltr" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})} required /></div>}
      <div><label className="label">{t.subtotal} ({itemCurrency||form.currency})</label><input className="input num" inputMode="decimal" value={form.subtotal} onChange={e=>setForm({...form,subtotal:e.target.value})} required /></div>
      <div><label className="label">{t.discount}</label><input className="input num" inputMode="decimal" value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})}/></div>
      <div><label className="label">{t.tax}</label><input className="input num" inputMode="decimal" value={form.tax} onChange={e=>setForm({...form,tax:e.target.value})}/></div>
      <div><label className="label">{t.gateway}</label><select className="select" value={form.gatewayId} onChange={e=>setForm({...form,gatewayId:e.target.value})}><option value="">{t.manualTransfer}</option>{gateways.filter(g=>!itemCurrency||!g.fiat||g.fiat===itemCurrency).map(g=><option key={g.id} value={g.id}>{g.name} ({g.fiat||'USD'})</option>)}</select></div>
      <div><label className="label">{t.dueDays}</label><input className="input num" type="number" min="0" max="365" value={form.dueDays} onChange={e=>setForm({...form,dueDays:e.target.value})}/></div>
      <div><label className="label">{t.status}</label><select className="select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="UNPAID">{t.stUNPAID}</option><option value="DRAFT">{t.stDRAFT}</option></select></div>
      <div className="grid-column-span-3"><label className="label">{t.notes}</label><input className="input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      <div className="flex gap-2"><button className="btn btn-primary flex-1">{t.createInvoice}</button><button type="button" className="btn btn-ghost" onClick={()=>setShowForm(false)}>{t.cancel}</button></div>
    </form>}

    <div className="card mb-6"><div className="flex items-center justify-between flex-wrap gap-3"><div className="tabs">{STATUSES.map(s=><button key={s||'all'} className={`tab ${status===s?'tab-active':''}`} onClick={()=>setStatus(s)}>{s?(t as Record<string,string>)[`st${s}`]||s:t.all}{s&&counts[s]?<span className="tab-count">{counts[s]}</span>:null}</button>)}</div><input className="input imp-w-56" placeholder={t.searchInvoices} value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    {filteredNotices&&<p className={`${msgOk?'success-text':'error-text'} mb-4`}>{msg}</p>}
    <div className="card overflow-x-auto">{loading?<p className="muted text-center py-8">{t.loading}</p>:rows.length===0?<p className="muted text-center py-8">{t.noInvoices}</p>:<table className="data"><thead><tr><th>{t.invoiceNo}</th><th>{t.customer}</th><th>{t.item}</th><th>{t.total}</th><th>{t.walletCreditApplied}</th><th>{t.amountDue}</th><th>{t.status}</th><th>{t.gateway}</th><th>{t.issuedAt}</th><th>{t.dueAt}</th><th>{t.actions}</th></tr></thead><tbody>{rows.map(i=><tr key={i.id}><td className="num font-semibold" dir="ltr">{i.number}</td><td dir="ltr">{i.user?.email||'—'}</td><td>{i.planName||i.productName||t.customAmount}</td><td className="num font-semibold">{money(i.total,i.currency)}</td><td className="num">{i.walletApplied>0?`−${money(i.walletApplied,i.currency)}`:'—'}</td><td className="num">{i.status==='PAID'?'—':money(i.amountDue,i.currency)}</td><td><StatusBadge value={i.status}/></td><td>{i.gatewayName||t.manualTransfer}</td><td className="num">{fmtDate(i.issuedAt)}</td><td className="num">{fmtDate(i.dueAt)}</td><td><div className="flex gap-1 flex-wrap"><Link href={`/invoice/${i.number}`} className="badge badge-gray">{t.view}</Link>{!['PAID','REFUNDED'].includes(i.status)&&<button className="badge badge-green" onClick={()=>act(i.id,'markPaid')}>{t.markPaid}</button>}{i.status==='PAID'&&<button className="badge badge-amber" onClick={()=>act(i.id,'refund')}>{t.refund}</button>}{!['PAID','VOID'].includes(i.status)&&<button className="badge badge-gray" onClick={()=>act(i.id,'void')}>{t.voidInvoice}</button>}{['VOID','DRAFT'].includes(i.status)&&<button className="badge badge-purple" onClick={()=>act(i.id,'update',{status:'UNPAID'})}>↺ {t.stUNPAID}</button>}{['DRAFT','VOID','UNPAID'].includes(i.status)&&<button className="badge badge-red" onClick={()=>remove(i.id)}>✕</button>}</div></td></tr>)}</tbody></table>}</div>
  </div>
}
