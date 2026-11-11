'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Notice, faDate } from '../store/shared'
import { ServerShell, useServerApi, useServerJson } from '../server/shared'
import PackageUpdates from './PackageUpdates'
import UpdateSpace from './UpdateSpace'

type Release = { version: string; tag: string; notes: string; url: string; publishedAt: string; prerelease: boolean }
type Run = { status: 'idle' | 'running' | 'done' | 'failed' | 'rolled-back'; step: string; target: string; previous: string; at: string; log: string }
type Status = {
  current: { version: string; sha: string }
  latest: Release | null
  releases: Release[]
  checkedAt: string
  checkError: string
  environment: { method: 'systemd' | 'package' | 'hook' | 'docker' | 'manual'; repo: string; feed: string; hookUrl: string }
  run: Run
  migrations: { supported: boolean; available: number; applied: number; pending: string[]; error?: string }
}

const RUN_LABEL: Record<Run['status'], string> = { idle: '', running: 'در حال انجام', done: 'کامل شد', failed: 'ناموفق', 'rolled-back': 'به نسخهٔ قبلی برگشت' }
const RUN_TONE: Record<Run['status'], string> = { idle: '', running: 'is-info', done: 'is-ok', failed: 'is-bad', 'rolled-back': 'is-warn' }
const fa = (n: number) => n.toLocaleString('fa-IR')

export default function UpdatesPage() {
  return <ServerShell title="به‌روزرسانی امن"><UpdatesPanel /></ServerShell>
}

function UpdatesPanel() {
  const api = useServerApi()
  const { data, error, reload } = useServerJson<Status>('/api/admin/server/updates')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [backupDone, setBackupDone] = useState(false)
  const [packageRefresh, setPackageRefresh] = useState(0)
  const [run, setRun] = useState<Run | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const say = (tone: 'ok' | 'error', text: string) => setNotice({ tone, text })
  useEffect(() => { if (data) setRun(data.run) }, [data])

  // While an update runs the site restarts: requests fail for a moment, so polling simply keeps going.
  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/server/updates?view=progress', { cache: 'no-store' })
      if (r.ok) {
        const next: Run = await r.json()
        setRun(next)
        if (next.status !== 'running') { void reload(); return }
      }
    } catch { /* the service is restarting */ }
    timer.current = setTimeout(() => void poll(), 3000)
  }, [reload])
  useEffect(() => { if (run?.status === 'running' && !timer.current) timer.current = setTimeout(() => void poll(), 1500); return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } } }, [run?.status, poll])

  async function act(op: string, extra: Record<string, unknown> = {}, ok = 'انجام شد.') {
    setBusy(op); setNotice(null)
    const result = await api('/api/admin/server/updates', { body: { op, ...extra } })
    setBusy('')
    if (!result.ok) { say('error', result.error); return false }
    say('ok', ok)
    return true
  }
  async function refresh() {
    setBusy('refresh')
    try {
      const r = await fetch('/api/admin/server/updates?refresh=1', { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      const body = await r.json()
      if (!r.ok) throw Error(body.error || 'بررسی نسخه انجام نشد')
      await reload(); say(body.checkError ? 'error' : 'ok', body.checkError || 'فهرست نسخه‌ها به‌روز شد.')
    } catch (error) { say('error', error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'پاسخ GitHub در زمان مجاز نرسید؛ مسیر به‌روزرسانی پروکسی یا بارگذاری بسته را بررسی کنید') }
    finally { setBusy('') }
  }
  async function apply(tag: string) {
    if (!window.confirm(`سایت به نسخهٔ ${tag} به‌روزرسانی شود؟ سرویس چند دقیقه دوباره راه‌اندازی می‌شود.`)) return
    if (await act('apply', { ref: tag, backupConfirmed: backupDone }, 'به‌روزرسانی شروع شد؛ این صفحه را باز نگه دارید.')) { setRun({ status: 'running', step: 'در صف اجرا', target: tag, previous: '', at: new Date().toISOString(), log: '' }) }
  }

  if (error) return <div className="sa" dir="rtl"><Notice tone="error">{error}</Notice></div>
  if (!data) return <div className="sa" dir="rtl"><div className="sa-skeleton" aria-busy="true" /></div>
  const { current, latest, environment: env, migrations } = data
  const running = run?.status === 'running'

  return <div className="sa upd" dir="rtl">
    <header className="sa-head"><div><h1>به‌روزرسانی سایت</h1><p className="sa-hint">نسخهٔ تازه را ببینید و با یک کلیک نصب کنید؛ مهاجرت پایگاه داده خودکار انجام می‌شود.</p></div>
      <div className="sa-head-actions"><button type="button" className="btn btn-ghost" disabled={!!busy || running} onClick={() => void refresh()}>{busy === 'refresh' ? 'در حال بررسی…' : 'بررسی نسخه'}</button></div></header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {data.checkError && <Notice tone="error">{data.checkError}</Notice>}

    <section className="sa-card upd-versions">
      <div><small>نسخهٔ نصب‌شده</small><b className="num" dir="ltr">{current.version}</b>{current.sha && <span className="sa-sub" dir="ltr">{current.sha}</span>}</div>
      <div><small>آخرین نسخهٔ بررسی‌شده</small><b className="num" dir="ltr">{latest ? latest.version : current.version}</b><span className="sa-sub">{env.method === 'package' ? 'بستهٔ امضاشده؛ دریافت از GitHub یا بارگذاری فایل' : latest ? `منتشر شده ${latest.publishedAt ? faDate(latest.publishedAt) : ''}` : 'شما به‌روز هستید'}</span></div>
      <div><small>آخرین بررسی</small><b>{data.checkedAt ? faDate(data.checkedAt, true) : '—'}</b><span className="sa-sub" dir="ltr">{env.feed === 'package' ? 'Signed release package' : env.feed === 'custom' ? 'custom feed' : env.repo}</span></div>
    </section>

    {run && run.status !== 'idle' && <section className="sa-card" aria-live="polite">
      <header className="sa-card-head"><h2>وضعیت به‌روزرسانی {run.target ? `به ${run.target}` : ''}</h2><span className={`sa-state ${RUN_TONE[run.status]}`}>{RUN_LABEL[run.status]}</span></header>
      {running && <p className="upd-step"><span className="upd-spin" aria-hidden="true" /> {run.step || 'در حال انجام…'} — سرویس ممکن است لحظه‌ای قطع شود.</p>}
      {run.status === 'done' && <Notice tone="ok">به‌روزرسانی کامل شد. صفحه را تازه کنید.</Notice>}
      {run.status === 'rolled-back' && <Notice tone="error">نسخهٔ جدید بالا نیامد و سایت خودکار به نسخهٔ قبلی برگشت. لاگ را بخوانید.</Notice>}
      {run.status === 'failed' && <Notice tone="error">{run.step || 'به‌روزرسانی ناموفق بود'}</Notice>}
      {run.log && <pre className="upd-log" dir="ltr">{run.log}</pre>}
    </section>}

    {env.method === 'package' && <PackageUpdates key={packageRefresh} running={running || !!busy} onApply={async item => {
      if (!window.confirm(`نسخهٔ ${item.version} پس از پشتیبان‌گیری نصب شود؟`)) return
      if (await act('package', { id: item.id, backupConfirmed: true }, 'نصب بسته شروع شد؛ این صفحه را باز نگه دارید.')) setRun({ status: 'running', step: 'در صف اجرا', target: item.version, previous: current.version, at: new Date().toISOString(), log: '' })
    }} />}
    {latest ? <section className="sa-card">
      <header className="sa-card-head"><h2>نسخهٔ {latest.version} آماده است</h2>{latest.url && <a className="sa-link" href={latest.url} target="_blank" rel="noopener noreferrer">صفحهٔ انتشار ↗</a>}</header>
      {latest.notes ? <pre className="upd-notes">{latest.notes}</pre> : <p className="sa-hint">توضیحی برای این نسخه ثبت نشده است.</p>}
      {env.method === 'package' && <div className="upd-howto"><p>بستهٔ امضاشده از GitHub دریافت و با کلید ناشر همین سرور بررسی می‌شود. دریافت فایل به معنی نصب نیست؛ نصب را پس از بررسی نسخه و تأیید بکاپ شروع کنید.</p><button type="button" className="btn btn-primary" disabled={!!busy || running} onClick={() => void act('github-package', { ref: latest.tag }, 'بسته دریافت و امضای ناشر تأیید شد؛ اکنون از فهرست بسته‌ها نصب کنید.').then(ok => { if (ok) setPackageRefresh(v => v + 1) })}>{busy === 'github-package' ? 'دریافت و بررسی امضای بسته…' : `دریافت امن ${latest.version} از GitHub`}</button><p className="sa-hint">اگر مسیر اینترنت محدود است، پروفایل «به‌روزرسانی» را در پنل پروکسی تنظیم کنید. بارگذاری دستی mbrelease همچنان در دسترس است.</p></div>}
      {env.method === 'systemd' && <>
        <ul className="upd-steps"><li>پشتیبان کامل گرفته می‌شود (پیشنهاد می‌شود).</li><li>کد نسخهٔ جدید دریافت و ساخته می‌شود.</li><li>سرویس دوباره راه‌اندازی و مهاجرت‌ها اجرا می‌شود.</li><li>اگر نسخهٔ جدید بالا نیامد، خودکار به نسخهٔ قبلی برمی‌گردد.</li></ul>
        <div className="sa-row-actions"><button type="button" className="btn btn-ghost" disabled={!!busy || running} onClick={() => void act('backup', {}, 'پشتیبان‌گیری شروع شد؛ نتیجه در «پشتیبان‌گیری» دیده می‌شود.')}>پشتیبان‌گیری اکنون</button></div>
        <label className="sa-check"><input type="checkbox" checked={backupDone} onChange={(e) => setBackupDone(e.target.checked)} /> پشتیبان تازه دارم و می‌خواهم ادامه دهم</label>
        <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!backupDone || !!busy || running} onClick={() => void apply(latest.tag)}>{running ? 'در حال به‌روزرسانی…' : `به‌روزرسانی به ${latest.version}`}</button></div>
      </>}
      {env.method === 'hook' && <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void act('hook', {}, 'درخواست استقرار ارسال شد؛ پس از ساخت نسخه، سرویس خودش دوباره بالا می‌آید.')}>استقرار نسخهٔ جدید (وب‌هوک)</button><small className="sa-hint">{env.hookUrl}</small></div>}
      {env.method === 'docker' && <div className="upd-howto"><b>این سایت در Docker اجرا می‌شود.</b><p>ایمیج را از میزبان جدید بسازید: در Coolify روی «Redeploy» بزنید (یا برای یک‌کلیکی، آدرس Deploy Webhook را در متغیر <code dir="ltr">UPDATE_DEPLOY_HOOK_URL</code> بگذارید). مهاجرت‌ها هنگام بالا آمدن خودکار اجرا می‌شوند.</p></div>}
      {env.method === 'manual' && <div className="upd-howto"><b>روی این سرور به‌روزرسانی از پنل فعال نیست.</b><p>روی سرور اجرا کنید: <code dir="ltr">bash deploy/ubuntu/update.sh</code>. برای فعال‌کردن دکمهٔ یک‌کلیکی یک بار <code dir="ltr">sudo bash deploy/ubuntu/updater-install.sh</code> را اجرا کنید (نیازمند systemd و پوشهٔ git).</p></div>}
    </section> : env.method !== 'package' && <section className="sa-card"><p className="sa-hint">نسخهٔ جدیدی وجود ندارد. سرور هر ۶ ساعت خودکار بررسی می‌کند و در صورت انتشار نسخهٔ تازه به مدیران اعلان می‌دهد.</p></section>}

    {env.method !== 'docker' && env.method !== 'hook' && <UpdateSpace running={running || !!busy} />}

    <section className="sa-card">
      <header className="sa-card-head"><h2>مهاجرت‌های پایگاه داده</h2></header>
      {!migrations.supported ? <p className="sa-hint">در نسخهٔ SQLite (توسعه) مهاجرت‌ها با «db push» انجام می‌شود.</p> : <>
        <p>{fa(migrations.applied)} مهاجرت اعمال‌شده از {fa(migrations.available)}. {migrations.error ? migrations.error : migrations.pending.length ? `${fa(migrations.pending.length)} مورد منتظر اجرا است.` : 'همه اعمال شده‌اند.'}</p>
        {migrations.pending.length > 0 && <>
          <ul className="upd-pending" dir="ltr">{migrations.pending.map((m) => <li key={m}>{m}</li>)}</ul>
          <p className="sa-hint">معمولاً هنگام راه‌اندازی سرویس خودکار اجرا می‌شوند. اگر <code dir="ltr">RUN_MIGRATIONS_ON_START=false</code> است، اینجا اجرا کنید.</p>
          <div className="sa-row-actions"><button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => { if (window.confirm('مهاجرت‌های منتظر اجرا شوند؟ پیش از آن پشتیبان بگیرید.')) void act('migrate', {}, 'مهاجرت‌ها اجرا شد.').then((ok) => { if (ok) void reload() }) }}>{busy === 'migrate' ? 'در حال اجرا…' : 'اجرای مهاجرت‌ها'}</button></div>
        </>}
      </>}
    </section>

    {data.releases.length > 0 && <section className="sa-card">
      <header className="sa-card-head"><h2>انتشارهای اخیر</h2></header>
      <ul className="upd-releases">{data.releases.map((r) => <li key={r.tag}><b dir="ltr">{r.version}</b>{r.prerelease && <span className="sa-state is-warn">پیش‌انتشار</span>}{r.version === current.version && <span className="sa-state is-ok">نصب‌شده</span>}<span className="sa-sub">{r.publishedAt ? faDate(r.publishedAt) : ''}</span>{r.url && <a className="sa-link" href={r.url} target="_blank" rel="noopener noreferrer">جزئیات</a>}</li>)}</ul>
    </section>}
  </div>
}
