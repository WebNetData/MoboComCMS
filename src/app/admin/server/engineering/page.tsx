'use client'
import Link from '@/components/AppLink'
import { useEffect, useRef, useState } from 'react'
import { ENGINEERING_ACTIVE } from '@/modules/ai/domain/engineering'
import { ServerShell, useServerApi, useServerJson } from '../shared'
import PolicyEditor from './PolicyEditor'
import RunCard from './RunCard'
import type { EngineeringView } from './types'
import { useWorkspaceBrief } from '@/components/admin/ai/use-workspace-brief'
import { workspaceInstruction } from '@/modules/ai/domain/workspace'
import './engineering.css'

const endpoint = '/api/admin/server/engineering'
function EngineeringDesk() {
  const api = useServerApi(), { data, error, loading, reload, setData } = useServerJson<EngineeringView>(endpoint)
  const [instruction, setInstruction] = useState(''), [mode, setMode] = useState('DEVELOP'), [skillIds, setSkillIds] = useState<string[]>([]), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [failed, setFailed] = useState(false)
  const running = useRef(false), request = useRef<{ body: string; id: string } | null>(null)
  const brief = useWorkspaceBrief('engineering')
  useEffect(() => { if (!brief) return; setInstruction(workspaceInstruction(brief.instruction, brief.source)); if (brief.mode) setMode(brief.mode) }, [brief])
  const active = data?.runs.some(r => ENGINEERING_ACTIVE.includes(r.status)) || false
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if (!document.hidden && !running.current) void reload() }, 5000); return () => clearInterval(timer) }, [active, reload])
  async function call(body: Record<string, unknown>) {
    if (running.current) return false
    running.current = true; setBusy(true); setNotice('')
    try { const result = await api<EngineeringView>(endpoint, { method: 'POST', body }); if (!result.ok) { setNotice(result.error); setFailed(true); return false } setData(result.data); setNotice(body.action === 'settings' ? 'تنظیمات و مهارت‌ها ذخیره شدند.' : 'درخواست ثبت شد؛ نتیجه در تاریخچه نمایش داده می‌شود.'); setFailed(false); return true }
    finally { running.current = false; setBusy(false) }
  }
  async function submit() {
    const body = { instruction, mode, skillIds: skillIds.filter(id => data?.policy.skills.some(s => s.id === id && s.enabled)) }, key = JSON.stringify(body), saved = request.current?.body === key ? request.current : { body: key, id: crypto.randomUUID() }
    request.current = saved
    if (await call({ action: 'request', requestId: saved.id, ...body })) { request.current = null; setInstruction('') }
  }
  return <div className="ae-workbench">
    <header className="ae-header"><div><span className="sa-eyebrow">هستهٔ هوش مصنوعی موبوکام</span><h2>مهندسی و نگهداری سایت</h2><p>مشکل یا قابلیت دلخواه را توضیح دهید؛ توسعه در محیط جدا انجام می‌شود و انتشار روی سایت اصلی با تأیید شماست.</p></div><div className="ae-row"><Link className="btn btn-ghost" href="/admin/ai">اتصال و مدل هوش مصنوعی</Link><button className="btn btn-ghost" onClick={() => void reload()} disabled={busy || loading}>تازه‌کردن وضعیت</button></div></header>
    {(notice || error) && <p className={failed || error ? 'error-text' : 'success-text'} role={failed || error ? 'alert' : 'status'}>{notice || error}</p>}
    {!data ? <p role="status">{loading ? 'در حال دریافت محیط و تاریخچه…' : 'اطلاعات دریافت نشده است؛ دوباره تلاش کنید.'}</p> : <>
      <section className="sa-card ae-environment" aria-label="وضعیت محیط جدا"><strong>{data.host.ready ? 'محیط جدا آماده است' : 'راه‌اندازی محیط سرور لازم است'}</strong><p>{data.host.diagnostics}</p>{!data.host.ready && <a href="https://github.com/WebNetData/MoboComCMS/blob/main/docs/AI-ENGINEERING-FA.md" target="_blank" rel="noreferrer">راهنمای نصب ابزار مستقل و محیط جدا</a>}<p className="sa-hint">توسعه و ساخت PR خودکار است. بیلد موفق به معنی آماده‌شدن سرویس یا انتشار نیست؛ تغییرات پایگاه داده و ابزار میزبان مسیر بررسی جدا دارند.</p></section>
      <ol className="ae-trail" aria-label="مراحل مهندسی"><li>درخواست و مهارت مرتبط</li><li>توسعه و بررسی جدا</li><li>PR و بررسی شما</li><li>انتشار تأییدشده و بازگشت کد</li></ol>
      {data.knowledge && <details className="sa-card"><summary>دانش و قواعد الزامی موبوکام · {data.knowledge.sources.length.toLocaleString('fa-IR')} منبع</summary><p>قواعد اصلی در هر درخواست مهندسی حضور دارند؛ متن مرتبط با کار در بودجهٔ زمینه انتخاب می‌شود. ثبت تغییر در معماری پیش از پایان توسعه الزامی است. مهارت‌های شخصی پایین صفحه به همین قواعد افزوده می‌شوند و مجوز تازه ایجاد نمی‌کنند.</p><ul>{data.knowledge.sources.map(source => <li key={source.path}><bdi>{source.path}</bdi> <small dir="ltr">{source.sha256.slice(0, 12)}</small></li>)}</ul></details>}
      <form className="sa-card ae-request" onSubmit={e => { e.preventDefault(); void submit() }}>
        <h3>درخواست جدید</h3><label>نوع کار<select className="input" value={mode} onChange={e => setMode(e.target.value)}><option value="DEVELOP">رفع مشکل یا توسعهٔ قابلیت در محیط جدا</option><option value="REPAIR">بررسی و پیشنهاد بازیابی مشخص سرور با تأیید من</option><option value="DIAGNOSE">عیب‌یابی و گزارش؛ بدون تغییر کد</option></select></label>
        <label>چه مشکلی پیش آمده یا چه قابلیتی لازم دارید؟<textarea className="input" rows={5} minLength={8} maxLength={4000} value={instruction} required onChange={e => setInstruction(e.target.value)} placeholder="رفتار فعلی، نتیجهٔ دلخواه و بخش درگیر را توضیح دهید؛ رمز، کلید API یا اطلاعات مشتریان نفرستید." /></label>
        {data.policy.skills.some(s => s.enabled) && <fieldset className="ae-skill"><legend>مهارت‌های شخصی مرتبط با این درخواست</legend>{data.policy.skills.filter(s => s.enabled).map(s => <label className="ae-check" key={s.id}><input type="checkbox" checked={skillIds.includes(s.id)} onChange={e => setSkillIds(old => e.target.checked ? [...old, s.id] : old.filter(id => id !== s.id))} />{s.title}</label>)}</fieldset>}
        <div className="ae-row"><button className="btn btn-primary" type="submit" disabled={busy || active || !data.host.ready || !data.policy.enabled}>{busy ? 'در حال ثبت…' : mode === 'DIAGNOSE' ? 'شروع عیب‌یابی بدون تغییر' : mode === 'REPAIR' ? 'بررسی و پیشنهاد بازیابی سرور' : 'شروع توسعه در محیط جدا'}</button><p className="sa-hint">{active ? 'یک کار در حال اجرا دارید؛ پیشرفت آن را پایین ببینید.' : !data.policy.enabled ? 'ابتدا مهندسی هوشمند را در تنظیمات پایین فعال کنید.' : 'سقف مراحل و زمینه از تنظیمات همین صفحه خوانده می‌شود.'}</p></div>
      </form>
      <PolicyEditor initial={data.policy} busy={busy} save={policy => call({ action: 'settings', policy })} />
      <section className="ae-history" aria-label="تاریخچهٔ درخواست‌های شما"><h2>تاریخچه و نتیجهٔ کارها</h2>{!data.runs.length ? <p className="sa-card">هنوز درخواستی ثبت نکرده‌اید. گزارش، تغییرات و لینک PR هر کار اینجا نگه داشته می‌شوند.</p> : data.runs.map(run => <RunCard key={run.id + ':' + (run.result.artifact || '')} run={run} busy={busy} decide={body => { void call(body) }} />)}</section>
    </>}
  </div>
}
export default function EngineeringPage() { return <ServerShell title="مهندسی هوشمند"><EngineeringDesk /></ServerShell> }
