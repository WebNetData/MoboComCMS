'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from '@/components/AppLink'

type Host = { host: string; method: 'nginx' | 'hmac'; secret: string; hasSecret?: boolean; ttlMinutes: number; expression: string; tokenParam: string; expiresParam: string }
type Settings = { enforceTokens: boolean; tokenTtlMinutes: number; requireLogin: boolean; guestDaily: number; memberDaily: number; vipDaily: number; hosts: Host[]; maskMode: 'external' | 'off'; maskExclude: string[]; maskTtlHours: number; renamePattern: string; scrubWords: string[]; scrubLinks: 'off' | 'listed' | 'all'; autoLocalize: boolean; cleanAudio: boolean; cleanVideo: boolean; cleanArchive: boolean; cleanMaxMb: number; cleanCacheGb: number; tagComment: string }
type ScrubReport = { sections: { label: string; pending: number; total: number }[]; pending: number; words: number }
type QueueEntry = {
  link: { id: number; label: string; quality: string; url: string; disabled: boolean; clicks: number; kind: string }
  owner: { title: string; path: string; admin: string }
  reports: { id: number; reason: string; note: string; createdAt: string; userId: number | null }[]
}
type Stats = { series: { day: string; count: number }[]; today: number; total: number; members: number; top: { key: string; count: number; title: string; path: string }[]; openReports: number; disabledLinks: number }
type Data = { settings: Settings; stats: Stats; queue: QueueEntry[]; reasons: { id: string; label: string }[]; tools: { ffmpeg: boolean; sevenZip: boolean; zip: boolean }; cleanCache: { files: number; bytes: number; working: number } }
type Tab = 'reports' | 'stats' | 'settings'

const fa = (n: number) => n.toLocaleString('fa-IR')
const EMPTY_HOST: Host = { host: '', method: 'nginx', secret: '', ttlMinutes: 120, expression: '{expires}{uri} {secret}', tokenParam: 'md5', expiresParam: 'expires' }

/** Download protection: broken-link reports, download stats, limits and origin signing. */
export default function AdminDownloadsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tab, setTab] = useState<Tab>('reports')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [probes, setProbes] = useState<Record<number, string>>({})
  const [wordsText, setWordsText] = useState('')
  const [scrub, setScrub] = useState<{ report: ScrubReport | null; running: boolean; progress: string }>({ report: null, running: false, progress: '' })

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/downloads', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok && body) { setData(body); setSettings(body.settings); setWordsText((body.settings.scrubWords || []).join('\n')) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])

  async function send(method: 'POST' | 'PATCH', body: unknown, success: string) {
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/downloads', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true }); return null }
    setMessage({ text: success, error: false })
    await load()
    return result
  }

  async function probe(linkId: number) {
    setProbes((current) => ({ ...current, [linkId]: 'در حال بررسی…' }))
    const response = await fetch('/api/admin/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'probe', linkId }) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setProbes((current) => ({ ...current, [linkId]: result ? `${result.ok ? '✓' : '✗'} ${result.detail}${result.size ? ` (${result.size})` : ''}` : 'بررسی انجام نشد' }))
  }

  async function scrubAction(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/downloads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = await response?.json().catch(() => null)
    if (!response?.ok) throw new Error(result?.error || 'انجام نشد')
    return result
  }

  async function checkTraces() {
    setScrub((current) => ({ ...current, running: true, progress: 'در حال بررسی محتوا…' }))
    try { setScrub({ report: await scrubAction({ action: 'scrub-preview' }), running: false, progress: '' }) }
    catch (error) { setScrub((current) => ({ ...current, running: false, progress: (error as Error).message })) }
  }

  async function cleanAll() {
    if (!window.confirm('همهٔ محتوای ذخیره‌شده بررسی و پاک‌سازی می‌شود و تصاویر سایت‌های دیگر روی این سرور کپی می‌شوند. این کار برگشت‌پذیر نیست. ادامه می‌دهید؟')) return
    let cursor = '', changed = 0, images = 0, failed = 0, scanned = 0
    setScrub((current) => ({ ...current, running: true, progress: 'شروع شد…' }))
    try {
      for (;;) {
        const result = await scrubAction({ action: 'scrub-run', cursor })
        changed += result.changed; images += result.imagesCopied; failed += result.imagesFailed; scanned += result.scanned
        setScrub((current) => ({ ...current, progress: `${fa(scanned)} مورد بررسی شد؛ ${fa(changed)} مورد پاک‌سازی و ${fa(images)} تصویر کپی شد…` }))
        if (result.done) break
        cursor = result.cursor
      }
      setScrub({ report: await scrubAction({ action: 'scrub-preview' }), running: false, progress: `تمام شد: ${fa(changed)} مورد پاک‌سازی و ${fa(images)} تصویر به این سرور کپی شد.${failed ? ` ${fa(failed)} تصویر دریافت نشد (سرور مبدأ در دسترس نبود یا اجازه نداد)؛ فردا دوباره امتحان می‌شود.` : ''}` })
    } catch (error) { setScrub((current) => ({ ...current, running: false, progress: (error as Error).message })) }
  }

  if (!data || !settings) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>

  const reasonLabel = (id: string) => data.reasons.find((reason) => reason.id === id)?.label || id
  const max = Math.max(1, ...data.stats.series.map((point) => point.count))
  const setHost = (index: number, patch: Partial<Host>) => setSettings({ ...settings, hosts: settings.hosts.map((host, i) => (i === index ? { ...host, ...patch } : host)) })

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">DOWNLOADS</span><h1>محافظت از لینک دانلود</h1>
      <p>امروز {fa(data.stats.today)} دانلود · {fa(data.stats.openReports)} گزارش باز · {fa(data.stats.disabledLinks)} لینک غیرفعال. لینک‌های سایت امضاشده و موقت‌اند و لینک کپی‌شده در کانال‌ها و سایت‌های دیگر بعد از {fa(Math.round(settings.tokenTtlMinutes / 60 * 10) / 10)} ساعت کار نمی‌کند.</p></div>
    </header>
    <nav className="tb-tabs" role="tablist" aria-label="بخش‌ها">
      {([['reports', 'گزارش لینک خراب', data.stats.openReports], ['stats', 'آمار دانلود', undefined], ['settings', 'تنظیمات و سرورها', undefined]] as const).map(([key, label, count]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => { setTab(key); setMessage(null) }}>{label}{count !== undefined && <span>{fa(count)}</span>}</button>
      ))}
    </nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    {tab === 'reports' && <section className="xm-section">
      <h2>لینک‌های گزارش‌شده</h2>
      <div className="fa-list">
        {data.queue.map((entry) => <article key={entry.link.id} className="card fa-flag">
          <header>
            <div><b>{entry.owner.title}</b> <small className="muted">— {entry.link.label || (entry.link.kind === 'STREAM' ? 'پخش آنلاین' : 'دانلود مستقیم')} {entry.link.quality}{entry.link.disabled ? ' · غیرفعال' : ''} · {fa(entry.link.clicks)} کلیک</small></div>
            <span className="badge">{fa(entry.reports.length)} گزارش</span>
          </header>
          <code className="fa-excerpt" dir="ltr">{entry.link.url}</code>
          <ul className="fa-reasons">{entry.reports.slice(0, 6).map((report) => <li key={report.id}><b>{reasonLabel(report.reason)}</b> · {new Date(report.createdAt).toLocaleString('fa-IR')}{report.userId ? ' · کاربر عضو' : ' · مهمان'}{report.note && <> · «{report.note}»</>}</li>)}</ul>
          {probes[entry.link.id] && <p className="muted" role="status">{probes[entry.link.id]}</p>}
          <div className="fa-inline fa-wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void probe(entry.link.id)}>🔍 بررسی لینک</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void send('POST', { action: 'fixed', linkId: entry.link.id }, 'گزارش‌ها «رفع شد» علامت خوردند')}>✓ رفع شد</button>
            {entry.link.disabled
              ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send('POST', { action: 'enable', linkId: entry.link.id }, 'لینک دوباره فعال شد')}>فعال‌کردن لینک</button>
              : <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send('POST', { action: 'disable', linkId: entry.link.id }, 'لینک از سایت برداشته شد')}>غیرفعال‌کردن لینک</button>}
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send('POST', { action: 'dismiss', linkId: entry.link.id }, 'گزارش‌ها رد شدند')}>رد گزارش</button>
            <Link className="btn btn-ghost btn-sm" href={entry.owner.admin}>ویرایش لینک‌ها</Link>
            <Link className="btn btn-ghost btn-sm" href={entry.owner.path} target="_blank">مشاهده ↗</Link>
          </div>
        </article>)}
        {!data.queue.length && <div className="tb-empty">گزارش بازی وجود ندارد ✓</div>}
      </div>
    </section>}

    {tab === 'stats' && <section className="xm-section">
      <h2>دانلودهای ۱۴ روز اخیر</h2>
      <div className="card an-chart" role="img" aria-label={`نمودار دانلود روزانه؛ مجموع ${fa(data.stats.total)}`}>
        {data.stats.series.map((point) => <div key={point.day} className="an-bar" title={`${new Date(point.day).toLocaleDateString('fa-IR')}: ${fa(point.count)}`}><span style={{ height: `${(point.count / max) * 100}%` }} /><small>{new Date(point.day).toLocaleDateString('fa-IR', { day: 'numeric' })}</small></div>)}
      </div>
      <p className="muted">مجموع {fa(data.stats.total)} دانلود؛ {fa(data.stats.members)} مورد توسط کاربران عضو.</p>
      <h2>پردانلودترین‌ها</h2>
      <div className="table-wrap card"><table className="table"><thead><tr><th>مورد</th><th>دانلود (۱۴ روز)</th></tr></thead><tbody>
        {data.stats.top.map((row) => <tr key={row.key}><td><Link href={row.path} target="_blank">{row.title}</Link></td><td>{fa(row.count)}</td></tr>)}
        {!data.stats.top.length && <tr><td colSpan={2} className="muted">هنوز دانلودی ثبت نشده است.</td></tr>}
      </tbody></table></div>
    </section>}

    {tab === 'settings' && <section className="xm-section">
      <form className="card fr-admin-form" onSubmit={(event) => { event.preventDefault(); void send('PATCH', settings, 'تنظیمات دانلود ذخیره شد') }}>
        <h2 className="fr-admin-wide">پنهان‌سازی لینک (دانلود از دامنهٔ خودتان)</h2>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.maskMode !== 'off'} onChange={(e) => setSettings({ ...settings, maskMode: e.target.checked ? 'external' : 'off' })} />فایل‌های سایت‌های دیگر از دامنهٔ همین سایت دانلود و پخش شوند؛ نشانی سرور اصلی هیچ‌جا دیده نمی‌شود</label>
        <p className="muted fr-admin-wide">مثلاً <bdi dir="ltr">https://dl.other-site.ir/Tak/song.mp3</bdi> برای کاربر به شکل <bdi dir="ltr">https://دامنهٔ‌شما/dl/…/song.mp3</bdi> دیده می‌شود. فایل از سرور اصلی از طریق همین سایت برای کاربر فرستاده می‌شود (ادامهٔ دانلود نیمه‌کاره و جلو/عقب کردن پخش هم کار می‌کند)، پس ترافیک این دانلودها از پهنای باند سرور سایت مصرف می‌شود. فایل‌های روی دامنه و زیردامنه‌های خودتان مستقیم داده می‌شوند.</p>
        <label className="studio-field"><span>اعتبار لینک پنهان (ساعت)</span><input className="input" type="number" min={1} max={336} value={settings.maskTtlHours} onChange={(e) => setSettings({ ...settings, maskTtlHours: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>سرورهایی که مستقیم لینک شوند (پنهان نشوند)</span><input className="input" dir="ltr" value={(settings.maskExclude || []).join(', ')} onChange={(e) => setSettings({ ...settings, maskExclude: e.target.value.split(/[\s,،]+/).filter(Boolean) })} placeholder="cdn.example.com, *.cloudfront.net" /></label>
        <h2 className="fr-admin-wide">حذف ردپای سایت‌های منبع</h2>
        <p className="muted fr-admin-wide">برای محتوایی که از سایت‌های دیگر کپی می‌کنید. محتوای تازه و ویرایش‌شده هر چند دقیقه خودکار پاک‌سازی می‌شود؛ برای محتوای قبلی از دکمهٔ «پاک‌سازی همهٔ محتوا» در پایین همین صفحه استفاده کنید.</p>
        <label className="studio-field fr-admin-wide"><span>نام و دامنهٔ سایت‌های منبع (هر کدام در یک خط)</span><textarea className="textarea" dir="ltr" rows={4} value={wordsText} onChange={(e) => { setWordsText(e.target.value); setSettings({ ...settings, scrubWords: e.target.value.split(/[\n,،]+/).map((word) => word.trim()).filter(Boolean) }) }} placeholder={'musicfa.ir\nFilm2Media\nsoft98.ir'} /><small className="muted">این نام‌ها (همراه عبارت‌هایی مثل «دانلود از سایت …») از متن‌ها، عنوان‌ها، عنوان لینک‌ها و نام فایل‌های دانلودی حذف می‌شوند.</small></label>
        <label className="studio-field"><span>لینک‌های داخل متن</span><select className="input" value={settings.scrubLinks} onChange={(e) => setSettings({ ...settings, scrubLinks: e.target.value as Settings['scrubLinks'] })}>
          <option value="listed">لینک به سایت‌های منبع حذف شود (متن لینک می‌ماند)</option>
          <option value="all">همهٔ لینک‌ها به سایت‌های دیگر حذف شود</option>
          <option value="off">لینک‌ها دست نخورد</option>
        </select></label>
        <label className="studio-switch"><input type="checkbox" checked={settings.autoLocalize} onChange={(e) => setSettings({ ...settings, autoLocalize: e.target.checked })} />تصاویر سایت‌های دیگر (کاور، پوستر، اسکرین‌شات و عکس‌های داخل متن) خودکار روی همین سرور کپی شوند</label>
        <label className="studio-field fr-admin-wide"><span>نام فایل هنگام دانلود</span><input className="input" value={settings.renamePattern} onChange={(e) => setSettings({ ...settings, renamePattern: e.target.value })} placeholder="{title} {quality} - {site}" /><small className="muted">
          جایگزین‌ها: <code dir="ltr">{'{title}'}</code> عنوان مطلب، <code dir="ltr">{'{quality}'}</code> کیفیت، <code dir="ltr">{'{label}'}</code> عنوان لینک، <code dir="ltr">{'{site}'}</code> نام سایت شما. پسوند فایل حفظ می‌شود. خالی بگذارید تا نام اصلی فایل بماند و فقط نام سایت‌های منبع از آن حذف شود.
          نمونه: <bdi>{(settings.renamePattern || '').replace('{title}', 'Oppenheimer').replace('{quality}', '1080p').replace('{label}', 'دانلود با کیفیت 1080p').replace('{site}', 'موبوکام').replace('{name}', 'Oppenheimer.2023.1080p') || 'Oppenheimer.2023.1080p'}.mkv</bdi>
        </small></label>

        <h2 className="fr-admin-wide">پاک‌سازی داخل فایل‌ها</h2>
        <p className="muted fr-admin-wide">با روشن کردن هر گزینه، اولین دانلود هر فایل یک‌بار روی این سرور دریافت و پاک‌سازی می‌شود و از آن به بعد نسخهٔ تمیز از همین سرور دانلود می‌شود. تا نسخهٔ تمیز آماده شود (برای فایل‌های بزرگ ممکن است چند دقیقه طول بکشد) فایل اصلی تحویل داده می‌شود. این کار فضای دیسک و پهنای باند سرور را مصرف می‌کند؛ همه به‌طور پیش‌فرض خاموش‌اند.</p>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.cleanAudio} onChange={(e) => setSettings({ ...settings, cleanAudio: e.target.checked })} />موزیک MP3: تگ‌ها، کاور و توضیحات سایت منبع حذف و عنوان، خواننده، آلبوم و کاور خودتان نوشته شود</label>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.cleanVideo} disabled={!data.tools.ffmpeg && !settings.cleanVideo} onChange={(e) => setSettings({ ...settings, cleanVideo: e.target.checked })} />فیلم و سریال (MP4، MKV، WebM، MOV): عنوان، توضیحات، فصل‌بندی و نام ترک‌های صدا و زیرنویس پاک شود (کیفیت و زبان ترک‌ها تغییری نمی‌کند){!data.tools.ffmpeg && <b className="muted"> — نیازمند ffmpeg روی سرور</b>}</label>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.cleanArchive} disabled={!data.tools.sevenZip && !settings.cleanArchive} onChange={(e) => setSettings({ ...settings, cleanArchive: e.target.checked })} />نرم‌افزار و بازی (ZIP و 7z): میان‌برها و صفحه‌های وب (url، html، lnk) و فایل‌های متنی که نام سایت منبع دارند حذف و توضیح فایل زیپ پاک شود{!data.tools.sevenZip && <b className="muted"> — نیازمند 7z روی سرور</b>}</label>
        <p className="muted fr-admin-wide">فایل‌های RAR و آرشیوهای رمزدار بدون تغییر تحویل داده می‌شوند. فایل‌های متنی فقط وقتی حذف می‌شوند که یکی از نام‌های سایت منبع (بخش بالا) در آن‌ها باشد.</p>
        <label className="studio-field"><span>متن توضیح داخل فایل (اختیاری)</span><input className="input" value={settings.tagComment} maxLength={150} onChange={(e) => setSettings({ ...settings, tagComment: e.target.value })} placeholder="دانلود از موبوکام" /></label>
        <label className="studio-field"><span>حداکثر حجم فایل برای پاک‌سازی (مگابایت)</span><input className="input" type="number" min={1} max={20000} value={settings.cleanMaxMb} onChange={(e) => setSettings({ ...settings, cleanMaxMb: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>فضای نگه‌داری نسخه‌های تمیز (گیگابایت)</span><input className="input" type="number" min={1} max={2000} value={settings.cleanCacheGb} onChange={(e) => setSettings({ ...settings, cleanCacheGb: Number(e.target.value) })} /></label>
        <div className="fr-admin-wide fa-inline fa-wrap">
          <span className="muted">نسخه‌های تمیز ذخیره‌شده: {fa(data.cleanCache.files)} فایل، {fa(Math.round(data.cleanCache.bytes / 1024 / 1024))} مگابایت{data.cleanCache.working ? ` — ${fa(data.cleanCache.working)} فایل در حال آماده‌سازی` : ''}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !data.cleanCache.files} onClick={() => { if (window.confirm('همهٔ نسخه‌های تمیز حذف شوند؟ دانلودهای بعدی دوباره آماده می‌شوند.')) void send('POST', { action: 'clean-cache-clear' }, 'نسخه‌های تمیز حذف شدند') }}>حذف نسخه‌های تمیز</button>
        </div>

        <h2 className="fr-admin-wide">لینک‌های موقت</h2>
        <label className="studio-switch fr-admin-wide"><input type="checkbox" checked={settings.enforceTokens} onChange={(e) => setSettings({ ...settings, enforceTokens: e.target.checked })} />لینک‌های دانلود امضاشده و موقت باشند (لینک کپی‌شده بعد از مدت اعتبار به صفحهٔ مطلب برمی‌گردد)</label>
        <label className="studio-field"><span>مدت اعتبار لینک صفحه (دقیقه)</span><input className="input" type="number" min={10} max={10080} value={settings.tokenTtlMinutes} onChange={(e) => setSettings({ ...settings, tokenTtlMinutes: Number(e.target.value) })} /></label>
        <label className="studio-switch"><input type="checkbox" checked={settings.requireLogin} onChange={(e) => setSettings({ ...settings, requireLogin: e.target.checked })} />دانلود فقط برای کاربران واردشده</label>
        <h2 className="fr-admin-wide">سقف دانلود روزانه (۲۴ ساعت اخیر؛ ۰ = نامحدود)</h2>
        <label className="studio-field"><span>مهمان</span><input className="input" type="number" min={0} value={settings.guestDaily} onChange={(e) => setSettings({ ...settings, guestDaily: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>کاربر عادی</span><input className="input" type="number" min={0} value={settings.memberDaily} onChange={(e) => setSettings({ ...settings, memberDaily: Number(e.target.value) })} /></label>
        <label className="studio-field"><span>عضو VIP</span><input className="input" type="number" min={0} value={settings.vipDaily} onChange={(e) => setSettings({ ...settings, vipDaily: Number(e.target.value) })} /></label>

        <h2 className="fr-admin-wide">امضای لینک روی سرور دانلود</h2>
        <p className="muted fr-admin-wide">اگر سرور دانلود شما nginx با ماژول <code dir="ltr">secure_link</code> است یا امضای HMAC را بررسی می‌کند، خود فایل هم لینک موقت می‌گیرد و حتی آدرس نهایی فایل قابل اشتراک نیست. برای nginx همان عبارت <code dir="ltr">secure_link_md5</code> سرور را وارد کنید؛ برای HMAC سرور باید <code dir="ltr">hex(HMAC-SHA256(secret, path + &quot;:&quot; + expires))</code> را با پارامتر token مقایسه کند.</p>
        {settings.hosts.map((host, index) => <fieldset key={index} className="fa-perms fr-admin-wide">
          <legend>{host.host || 'سرور جدید'}</legend>
          <div className="fa-inline fa-wrap">
            <label className="studio-field fa-grow"><span>دامنهٔ سرور فایل</span><input className="input" dir="ltr" value={host.host} onChange={(e) => setHost(index, { host: e.target.value })} placeholder="dl.example.com یا *.example.com" /></label>
            <label className="studio-field"><span>روش</span><select className="input" value={host.method} onChange={(e) => setHost(index, { method: e.target.value as Host['method'], tokenParam: e.target.value === 'hmac' ? 'token' : 'md5' })}><option value="nginx">nginx secure_link</option><option value="hmac">HMAC-SHA256</option></select></label>
            <label className="studio-field"><span>اعتبار (دقیقه)</span><input className="input" type="number" min={5} value={host.ttlMinutes} onChange={(e) => setHost(index, { ttlMinutes: Number(e.target.value) })} /></label>
          </div>
          <div className="fa-inline fa-wrap">
            <label className="studio-field fa-grow"><span>کلید مخفی {host.hasSecret ? '(ذخیره شده؛ برای تغییر مقدار تازه وارد کنید)' : ''}</span><input className="input" dir="ltr" type="password" autoComplete="new-password" value={host.secret} onChange={(e) => setHost(index, { secret: e.target.value })} placeholder={host.hasSecret ? '••••••••' : 'secret'} /></label>
            {host.method === 'nginx' && <label className="studio-field fa-grow"><span>عبارت secure_link_md5</span><input className="input" dir="ltr" value={host.expression} onChange={(e) => setHost(index, { expression: e.target.value })} placeholder="{expires}{uri} {secret}" /></label>}
            <label className="studio-field"><span>پارامتر امضا</span><input className="input" dir="ltr" value={host.tokenParam} onChange={(e) => setHost(index, { tokenParam: e.target.value })} /></label>
            <label className="studio-field"><span>پارامتر انقضا</span><input className="input" dir="ltr" value={host.expiresParam} onChange={(e) => setHost(index, { expiresParam: e.target.value })} /></label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings({ ...settings, hosts: settings.hosts.filter((_, i) => i !== index) })}>حذف</button>
          </div>
          {host.method === 'nginx' && <pre className="fa-excerpt" dir="ltr">{`location /files/ {\n  secure_link $arg_${host.tokenParam},$arg_${host.expiresParam};\n  secure_link_md5 "${host.expression.replace('{expires}', '$secure_link_expires').replace('{uri}', '$uri').replace('{ip}', '$remote_addr').replace('{secret}', 'YOUR_SECRET')}";\n  if ($secure_link = "")  { return 403; }\n  if ($secure_link = "0") { return 410; }\n}`}</pre>}
        </fieldset>)}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings({ ...settings, hosts: [...settings.hosts, { ...EMPTY_HOST }] })}>+ افزودن سرور دانلود</button>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ تنظیمات</button></div>
      </form>

      <div className="card fr-admin-form">
        <h2 className="fr-admin-wide">پاک‌سازی همهٔ محتوا</h2>
        <p className="muted fr-admin-wide">با تنظیمات ذخیره‌شدهٔ بالا، همهٔ مطالب مجله، موزیک، فیلم و سریال، بازی و نرم‌افزار بررسی می‌شوند: تصاویر سایت‌های دیگر روی این سرور کپی و نام و لینک سایت‌های منبع حذف می‌شود. اول تنظیمات را ذخیره کنید.</p>
        <div className="fr-admin-actions fr-admin-wide">
          <button type="button" className="btn btn-ghost btn-sm" disabled={scrub.running} onClick={() => void checkTraces()}>بررسی (بدون تغییر)</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={scrub.running} onClick={() => void cleanAll()}>پاک‌سازی همهٔ محتوا</button>
        </div>
        {scrub.progress && <p className="fr-admin-wide" role="status">{scrub.progress}</p>}
        {scrub.report && <div className="table-wrap fr-admin-wide"><table className="table"><thead><tr><th>بخش</th><th>نیازمند پاک‌سازی</th><th>کل</th></tr></thead><tbody>
          {scrub.report.sections.filter((row) => row.total).map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.pending ? <b>{fa(row.pending)}</b> : '✓'}</td><td>{fa(row.total)}</td></tr>)}
        </tbody></table>{!scrub.report.words && <p className="muted">هنوز نام سایت منبعی وارد نکرده‌اید؛ فقط تصاویر بررسی شدند.</p>}</div>}
      </div>
    </section>}
  </div>
}
