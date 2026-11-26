'use client'

import { useState } from 'react'
import { HOSTING_DRIVERS, PROVIDER_FAMILIES, driverMeta } from '@/modules/hosting/domain/catalog'
import { Notice, faDate, send, useJson } from '../../store/shared'
import { HostingShell, type AdminProvider, type HostingData } from '../shared'

type Draft = { id?: number; name: string; driver: string; url: string; username: string; secret: string; location: string; capacity: number; active: boolean; hasSecret?: boolean; authMode: 'API_TOKEN' | 'PASSWORD' }
const EMPTY: Draft = { name: '', driver: 'CPANEL', url: '', username: '', secret: '', location: '', capacity: 0, active: true, authMode:'API_TOKEN' }
const CONNECTION = { api: 'API', direct: 'اتصال مستقیم', ssh: 'SSH' } as const

export default function HostingProvidersPage() {
  const { data, error, reload } = useJson<HostingData>('/api/admin/hosting')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [packages,setPackages]=useState<{id:string;name:string}[]|null>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true)
    setPackages(null)
    const result = await send<{ ok?: boolean; message?: string;packages?:{id:string;name:string}[] }>('/api/admin/hosting', 'POST', body)
    setBusy(false)
    if (!result.ok) { setNotice({ tone: 'error', text: result.error }); return false }
    setNotice(body.op === 'test-provider' ? { tone: result.data.ok ? 'ok' : 'error', text: result.data.message || done } : { tone: 'ok', text: done })
    if(body.op==='test-provider'&&result.data.ok&&result.data.packages)setPackages(result.data.packages)
    void reload()
    return true
  }
  async function save() {
    if (!draft) return
    const { hasSecret: _hasSecret, ...provider } = draft
    if (await run({ op: 'save-provider', provider }, 'سامانه ذخیره شد.')) setDraft(null)
  }
  const edit = (row: AdminProvider) => { setNotice(null); setPackages(null); setDraft({ id: row.id, name: row.name, driver: row.driver, url: row.url, username: row.username, secret: '', location: row.location, capacity: row.capacity, active: row.active, hasSecret: row.hasSecret,authMode:['CPANEL','JOKER'].includes(row.driver)&&row.authMode==='PASSWORD'?'PASSWORD':'API_TOKEN' }); window.scrollTo({ top: 0 }) }
  const remove = (row: AdminProvider) => { if (window.confirm(`سامانهٔ «${row.name}» حذف شود؟ رمز ذخیره‌شده هم پاک می‌شود.`)) void run({ op: 'delete-provider', id: row.id }, 'سامانه حذف شد.') }
  const meta = draft ? driverMeta(draft.driver) : undefined

  return <HostingShell
    title="سامانه‌های متصل"
    hint="کنترل‌پنل‌های هاست، مجازی‌سازها و API ارائه‌دهندگان سرور و ثبت دامنه. رمزها رمزگذاری‌شده نگه داشته می‌شوند و دوباره نمایش داده نمی‌شوند."
    actions={!draft && <button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setDraft({ ...EMPTY }) }}>اتصال تازه</button>}
  >
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <div aria-live="polite"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    {packages&&<section className="sa-card" aria-label="بسته‌های WHM"><header className="sa-card-head"><h2>بسته‌های قابل دسترس در WHM</h2></header><p className="sa-hint">کد بسته را برای تنظیم پلن یادداشت کنید. خواندن بسته‌ها به معنی فعال بودن ساخت خودکار حساب نیست.</p>{packages.length?<ul className="hx-provider-packages">{packages.map(item=><li key={item.id}><span>{item.name}</span><code dir="ltr">{item.id}</code></li>)}</ul>:<p className="sa-hint">بسته‌ای برای این نمایندگی در دسترس نیست.</p>}</section>}

    {draft && <div className="hx-form">
      <section className="sa-card" aria-label="نوع سامانه">
        <header className="sa-card-head"><h2>{draft.id ? 'ویرایش اتصال' : 'اتصال تازه'}</h2></header>
        {PROVIDER_FAMILIES.map((family) => <fieldset key={family.id} className="hx-choice"><legend>{family.label}</legend><div>
          {HOSTING_DRIVERS.filter((driver) => driver.family === family.id).map((driver) => <label key={driver.id} className={draft.driver === driver.id ? 'is-on' : ''}><input type="radio" name="driver" checked={draft.driver === driver.id} onChange={() => setDraft(current=>current?{...current,driver:driver.id,url:'',username:'',secret:'',authMode:'API_TOKEN',hasSecret:false}:null)} /><span>{driver.label}</span><small>{data?.supportedDrivers?.includes(driver.id)?`${CONNECTION[driver.connection]} · آزمون اتصال`:'اتصال آماده نیست'}</small></label>)}
        </div></fieldset>)}
      </section>
      <section className="sa-card" aria-label="اتصال">
        <header className="sa-card-head"><h2>اطلاعات اتصال {meta?.label}</h2></header>
        {['CPANEL','JOKER'].includes(draft.driver)&&<label className="sa-field"><span>روش ورود</span><select className="input" value={draft.authMode} onChange={event=>set('authMode',event.target.value as Draft['authMode'])}><option value="API_TOKEN">{draft.driver==='CPANEL'?'API Token حساب WHM':'API Key حساب Joker'}</option><option value="PASSWORD">{draft.driver==='CPANEL'?'رمز ورود WHM':'رمز ورود Joker'}</option></select></label>}
        {draft.driver==='CPANEL'&&<p className="sa-hint">حساب root یا نمایندگی WHM را وارد کنید. اگر رمز ورود دارید، روش «رمز ورود WHM» را انتخاب کنید. توکن cPanel و رمز WHM جایگزین یکدیگر نیستند؛ محدودیت IP یا ورود دومرحله‌ای ممکن است استفاده از توکن مجاز WHM را لازم کند.</p>}
        {draft.driver==='JOKER'&&<p className="sa-hint">برای DMAPI از دسترسی حساب نمایندگی Joker استفاده کنید. آزمون ورود، مجوز ثبت یا تمدید پولی دامنه را تأیید نمی‌کند.</p>}
        {draft.driver==='IRNIC'&&<Notice tone="error">حساب معمولی nic.ir اتصال API نمایندگی نیست. قرارداد API این اتصال هنوز تأیید نشده؛ رمز ورود وب‌سایت را اینجا وارد نکنید. سفارش دامنهٔ ir فعلاً با کارشناس انجام می‌شود.</Notice>}
        {data?.supportedDrivers&&!data.supportedDrivers.includes(draft.driver)&&draft.driver!=='IRNIC'&&<Notice tone="error">آداپتور این سامانه هنوز آماده نیست؛ ثبت اطلاعات، آن را به اتصال یا تحویل خودکار تبدیل نمی‌کند.</Notice>}
        <div className="hx-row">
          <label className="sa-field"><span>نام *</span><input className="input" value={draft.name} maxLength={80} placeholder="مثلاً هتزنر آلمان" onChange={(event) => set('name', event.target.value)} /></label>
          <label className="sa-field"><span>محل</span><input className="input" value={draft.location} maxLength={80} onChange={(event) => set('location', event.target.value)} /></label>
        </div>
        {meta?.fixedUrl
          ? <p className="sa-hint">نشانی ثابت است: <span dir="ltr">{meta.fixedUrl}</span></p>
          : <label className="sa-field"><span>نشانی *</span><input className="input" dir="ltr" value={draft.url} maxLength={300} placeholder={meta?.urlHint} onChange={(event) => set('url', event.target.value)} /></label>}
        <div className="hx-row">
          {(meta?.needsUsername||draft.authMode==='PASSWORD') && <label className="sa-field"><span>{draft.driver==='JOKER'?'ایمیل حساب Joker':'نام کاربری'} *</span><input className="input" dir="ltr" autoComplete="off" value={draft.username} maxLength={200} onChange={(event) => set('username', event.target.value)} /></label>}
          <label className="sa-field"><span>{draft.authMode==='PASSWORD'?(draft.driver==='CPANEL'?'رمز ورود WHM':'رمز ورود Joker'):meta?.secretLabel} {draft.id ? '' : '*'}</span>
            {meta?.connection === 'ssh'
              ? <textarea className="input" dir="ltr" rows={4} autoComplete="off" spellCheck={false} value={draft.secret} placeholder={draft.hasSecret ? 'ذخیره شده؛ برای تغییر کلید تازه را وارد کنید' : '-----BEGIN OPENSSH PRIVATE KEY-----'} onChange={(event) => set('secret', event.target.value)} />
              : <input className="input" dir="ltr" type="password" disabled={draft.driver==='IRNIC'} autoComplete="new-password" value={draft.secret} placeholder={draft.hasSecret ? 'ذخیره شده؛ برای تغییر مقدار تازه را وارد کنید' : ''} onChange={(event) => set('secret', event.target.value)} />}
          </label>
          <label className="sa-field"><span>ظرفیت (بیشترین سرویس، ۰ = بی‌سقف)</span><input className="input" inputMode="numeric" dir="ltr" value={String(draft.capacity)} onChange={(event) => set('capacity', Number(event.target.value.replace(/[^\d]/g, '')) || 0)} /></label>
        </div>
        {draft.id&&<p className="sa-hint">خالی گذاشتن رمز، مقدار قبلی را حفظ می‌کند. برای تغییر نشانی، روش ورود یا نام کاربری، رمز یا توکن را دوباره وارد کنید.</p>}
        <label className="sa-check"><input type="checkbox" checked={draft.active} onChange={(event) => set('active', event.target.checked)} />فعال برای انتخاب در محصولات؛ قابلیت تحویل خودکار جداگانه بررسی می‌شود</label>
      </section>
      <div className="hx-save">
        <button type="button" className="btn btn-primary" disabled={busy||draft.driver==='IRNIC'&&!draft.id} onClick={() => void save()}>ذخیره</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDraft(null)}>انصراف</button>
      </div>
    </div>}

    {!draft && <section className="sa-card" aria-label="فهرست سامانه‌ها">
      {data && !data.providers.length && <div className="hx-empty"><h2>هنوز سامانه‌ای ثبت نشده است</h2><p className="sa-hint">اطلاعات اتصال را ثبت و ورود API را بررسی کنید. ساخت سرویس یا ثبت دامنه فقط با آداپتور دارای همان قابلیت انجام می‌شود.</p></div>}
      {data && data.providers.length > 0 && <div className="sa-table-wrap"><table className="sa-table">
        <thead><tr><th>نام</th><th>نوع</th><th>آخرین بررسی</th><th>محصول</th><th>وضعیت</th><th><span className="sr-only">عملیات</span></th></tr></thead>
        <tbody>{data.providers.map((row) => <tr key={row.id}>
          <td><b>{row.name}</b>{row.location && <div className="hx-spec">{row.location}</div>}</td>
          <td>{driverMeta(row.driver)?.label || row.driver}<div className="hx-spec">{!row.built?'اتصال آماده نیست':row.capabilities?.includes('create')||row.capabilities?.includes('register')?'دارای عملیات خودکار':'آزمون اتصال؛ تحویل با کارشناس'}</div></td>
          <td>{row.lastCheckAt
            ? <span className={`hx-check ${row.lastCheckOk ? 'is-ok' : 'is-bad'}`} title={row.lastCheckMessage}>{row.lastCheckOk ? 'متصل' : 'ناموفق'} · {faDate(row.lastCheckAt, true)}</span>
            : <span className="hx-spec">بررسی نشده</span>}</td>
          <td className="num">{row.products.toLocaleString('fa-IR')}</td>
          <td><span className={`sa-state ${row.active ? 'is-ok' : ''}`}>{row.active ? 'فعال' : 'غیرفعال'}</span></td>
          <td><div className="hx-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run({ op: 'test-provider', id: row.id }, 'بررسی شد.')}>بررسی اتصال</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(row)}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove(row)}>حذف</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </HostingShell>
}
