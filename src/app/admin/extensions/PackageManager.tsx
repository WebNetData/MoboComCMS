'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'

type Setting = { key: string; label: string; labelEn?: string; type: 'text' | 'textarea'; default?: string }
type Manifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string; version: string; author?: string
  kind: 'plugin' | 'theme'; runtime: 'declarative' | 'code'; slots?: Record<string, unknown>; pages?: { slug: string; title: { fa: string; en: string } }[]; settings?: Setting[]
}
export type PackageRow = {
  id: string; manifest: Manifest; uninstalledAt?: string; enabled: boolean; settings: Record<string, string>; files: { path: string; bytes: number; editable: boolean }[]
  bytes: number; updatedAt: string; revisions: number; codeStatus?: 'staged' | 'applied'; active?: boolean
  codeApply?: { id: string; mode: 'git' | 'local'; phase: 'prepared' | 'planned' | 'effect' | 'applied' | 'cancelled'; intent?: 'cancel'; deploy?: 'claimed' | 'accepted' | 'failed' | 'unknown' } | null
}

type CodeStatus = { mode: 'git' | 'local' | 'off'; ready: boolean; detail: string; deployHook: boolean; owner: boolean }
type Builtin = { id: string; kind: 'plugin' | 'theme'; name: string }

const kb = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

/** Uploaded plugins and themes: install from .zip, switch on, configure, edit, export or remove. */
export default function PackageManager({ fa, onChanged }: { fa: boolean; onChanged?: () => void }) {
  const L = useCallback((en: string, persian: string) => (fa ? persian : en), [fa])
  const [rows, setRows] = useState<PackageRow[]>([])
  const [code, setCode] = useState<CodeStatus | null>(null)
  const [builtins, setBuiltins] = useState<Builtin[]>([])
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState('')
  const [drag, setDrag] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const hasPending = rows.some(row => row.codeApply && row.codeApply.phase !== 'applied' && row.codeApply.phase !== 'cancelled')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/packages', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (res.ok) { setRows(data.packages || []); setCode(data.code || null); setBuiltins(data.builtins || []) }
    else setMessage({ text: data?.error || L('Could not load packages.', 'دریافت بسته‌ها ناموفق بود.'), error: true })
  }, [L])
  useEffect(() => { void load() }, [load])

  async function call(id: string, request: () => Promise<Response>, success: string) {
    setBusy(id); setMessage(null)
    try {
      const res = await request()
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || L('The request failed.', 'درخواست ناموفق بود.'))
      await load()
      onChanged?.()
      setMessage({ text: success, error: false })
      return data
    } catch (error) { await load().catch(() => {}); setMessage({ text: error instanceof Error ? error.message : String(error), error: true }) }
    finally { setBusy('') }
  }

  async function upload(file: File | undefined) {
    if (!file || hasPending) return
    if (!/\.zip$/i.test(file.name)) { setMessage({ text: L('Choose a .zip package.', 'یک فایل ‎.zip انتخاب کنید.'), error: true }); return }
    const form = new FormData()
    form.append('file', file)
    const data = await call('upload', () => fetch('/api/admin/packages', { method: 'POST', body: form }), L('Package installed.', 'بسته نصب شد.'))
    if (data?.package) setMessage({ text: data.upgraded ? L(`${data.package.manifest.name} was updated to v${data.package.manifest.version}.`, `«${data.package.manifest.name}» به نسخهٔ ${data.package.manifest.version} به‌روز شد.`) : data.package.manifest.runtime === 'code' ? L(`${data.package.manifest.name} was uploaded. Apply trusted source, then review the build and deployment before activation.`, `«${data.package.manifest.name}» آپلود شد. سورس مورد اعتماد را اعمال کنید و پیش از فعال‌سازی، build و استقرار را بررسی کنید.`) : L(`${data.package.manifest.name} is installed. Turn it on when you are ready.`, `«${data.package.manifest.name}» نصب شد. هر وقت آماده بودید فعالش کنید.`), error: false })
    if (input.current) input.current.value = ''
  }

  const patch = (row: PackageRow, body: Record<string, unknown>, success: string) =>
    call(row.id, () => fetch(`/api/admin/packages/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), success)
  const remove = (row: PackageRow) => {
    if (!window.confirm(L(`Uninstall ${row.manifest.name}? Its files, settings and history are retained privately. Reinstall with a validated package upload.`, `«${row.manifest.name}» حذف نصب شود؟ فایل‌ها، تنظیمات و سوابق به‌صورت خصوصی حفظ می‌شوند. نصب دوباره با بارگذاری بستهٔ معتبر انجام می‌شود.`))) return
    void call(row.id, () => fetch(`/api/admin/packages/${row.id}`, { method: 'DELETE' }), L('Uninstalled; data retained.', 'حذف نصب شد؛ داده‌ها حفظ شدند.'))
  }
  const name = (m: Manifest) => (fa ? m.name : m.nameEn || m.name)
  async function apply(row: PackageRow) {
    if (row.codeApply?.intent === 'cancel' && row.codeApply.phase !== 'cancelled' && row.codeApply.phase !== 'applied') {
      if (!window.confirm(L('Continue the previous cancellation?', 'لغو قبلی ادامه پیدا کند؟'))) return
      await call(row.id, () => fetch(`/api/admin/packages/${row.id}/apply`, { method: 'POST' }), L('Cancellation completed; package data and backup retained.', 'لغو کامل شد؛ داده‌ها و نسخهٔ پشتیبان بسته حفظ شدند.'))
      return
    }
    const where = code?.mode === 'git' ? L(`The source is committed to ${code.detail}; a commit does not confirm deployment.`, `سورس در ${code.detail} ثبت می‌شود؛ commit به معنی استقرار نیست.`) : L('The local source is written; a reviewed build and restart are needed.', 'سورس محلی نوشته می‌شود؛ build بازبینی‌شده و راه‌اندازی دوباره لازم است.')
    if (!window.confirm(L(`Apply the code of ${row.manifest.name}? Code packages have full server access; apply only trusted code. ${where}`, `کد «${row.manifest.name}» اعمال شود؟ بسته‌های کددار به کل سرور دسترسی دارند؛ فقط کد مورد اعتماد را اعمال کنید. ${where}`))) return
    const data = await call(row.id, () => fetch(`/api/admin/packages/${row.id}/apply`, { method: 'POST' }), L('Applied.', 'اعمال شد.'))
    if (data) setMessage({ text: data.mode === 'git' ? L('Source prepared in Git. A commit or accepted deployment request does not confirm deployment; review the build and deployment before activation.', 'سورس در Git آماده شد. ثبت commit یا پذیرش درخواست استقرار، اجرای استقرار را تأیید نمی‌کند؛ پیش از فعال‌سازی، build و استقرار را بررسی کنید.') : L('Source written locally. A reviewed build and restart are needed before activation.', 'سورس محلی نوشته شد. پیش از فعال‌سازی، build بازبینی‌شده و راه‌اندازی دوباره لازم است.'), error: false })
  }
  async function cancelApply(row: PackageRow) {
    const local = row.codeApply?.mode === 'local'
    if (!window.confirm(local
      ? L('Cancel this apply and restore the recorded original source only if it is unchanged? Package files, settings, history and backup are retained.', 'این اعمال لغو و سورس اصلی ثبت‌شده فقط در صورت تغییرنکردن بازیابی شود؟ فایل‌ها، تنظیمات، سوابق و نسخهٔ پشتیبان بسته حفظ می‌شوند.')
      : L('Cancel this apply plan? Only a verified unpublishable plan can be cancelled; a published commit is never reverted.', 'برنامهٔ اعمال لغو شود؟ فقط برنامه‌ای که منتشرنشدنی بودن آن تأیید شده لغو می‌شود؛ commit منتشرشده بازگردانده نمی‌شود.'))) return
    await call(row.id, () => fetch(`/api/admin/packages/${row.id}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) }), L('Apply cancelled; package data and backup retained.', 'اعمال لغو شد؛ داده‌ها و نسخهٔ پشتیبان بسته حفظ شدند.'))
  }
  async function editBuiltin(id: string) {
    if (!id) return
    const data = await call('source', () => fetch('/api/admin/packages/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }), L('Source opened as a code package.', 'سورس به‌صورت بستهٔ کددار باز شد.'))
    if (data?.package) window.location.href = `/admin/extensions/editor?package=${data.package.id}`
  }

  return <section className="xm-section" aria-labelledby="pm-title">
    <h2 id="pm-title">{L('Uploaded plugins & themes', 'افزونه‌ها و قالب‌های آپلودی')}</h2>
    <label className={`pm-drop${drag ? ' is-drag' : ''}`} onDragOver={event => { event.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); void upload(event.dataTransfer.files?.[0]) }} aria-busy={busy === 'upload'}>
      <input ref={input} type="file" accept=".zip,application/zip" className="sr-only" onChange={event => void upload(event.target.files?.[0])} disabled={busy === 'upload' || hasPending}/>
      <Icon name="upload" size={26}/>
      <strong>{busy === 'upload' ? L('Installing…', 'در حال نصب…') : L('Upload a plugin or theme (.zip)', 'آپلود افزونه یا قالب (‎.zip)')}</strong>
      <small>{L('Drop a file here or click to choose. Uploading a newer version of an installed package updates it and keeps its settings.', 'فایل را اینجا رها کنید یا کلیک کنید. آپلود نسخهٔ جدید یک بستهٔ نصب‌شده، آن را به‌روز می‌کند و تنظیماتش حفظ می‌شود.')}</small>
      {hasPending && <small>{L('Resume or cancel the pending apply before uploading packages.', 'پیش از بارگذاری بسته، اعمال ناتمام را ادامه دهید یا لغو کنید.')}</small>}
    </label>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {code && <div className="pm-code">
      <span className={`xm-chip${code.ready ? '' : ' is-warn'}`}>{L('Code packages', 'بسته‌های کددار')}: {code.mode === 'git' ? `Git · ${code.detail}` : code.mode === 'local' ? L('local source', 'سورس محلی') : L('off', 'غیرفعال')}</span>
      {!code.ready && <small className="muted">{code.mode === 'off' ? L('Installing code packages is off on this server. To turn it on, set PACKAGE_APPLY_MODE to git or local (see docs/packages).', 'نصب بستهٔ کددار روی این سرور خاموش است. برای روشن‌کردن، PACKAGE_APPLY_MODE را روی git یا local تنظیم کنید (راهنما: docs/packages).') : code.detail}</small>}
      {code.owner && code.ready && builtins.length > 0 && <label className="pm-builtin"><span>{L('Edit code of a built-in theme/plugin', 'ویرایش کد قالب/افزونهٔ داخلی')}</span><select className="input" value="" disabled={busy === 'source'} onChange={event => void editBuiltin(event.target.value)}><option value="">{L('Choose…', 'انتخاب…')}</option>{builtins.map(item => <option key={item.id} value={item.id}>{item.kind === 'theme' ? L('Theme', 'قالب') : L('Plugin', 'افزونه')} · {item.name}</option>)}</select></label>}
    </div>}
    {!rows.length ? <div className="tb-empty">{L('No packages uploaded yet. Sample packages live in docs/packages/examples.', 'هنوز بسته‌ای آپلود نشده است. نمونه‌ها در docs/packages/examples هستند.')}</div>
      : <div className="xm-grid">{rows.map(row => {
        const m = row.manifest
        const installed = !row.uninstalledAt
        const active = installed && (row.enabled || !!row.active)
        const isCode = m.runtime === 'code'
        const pending = !!row.codeApply && row.codeApply.phase !== 'applied' && row.codeApply.phase !== 'cancelled'
        const expanded = active && !pending && open === row.id
        return <article key={row.id} className={`xm-card${row.enabled || row.active ? ' is-on' : ''}`} aria-busy={busy === row.id}>
          <div className="xm-card-head">
            <span className="xm-icon" aria-hidden="true"><Icon name={m.kind === 'theme' ? 'palette' : isCode ? 'code' : 'sparkles'} size={22}/></span>
            <div className="xm-title"><h3>{name(m)}</h3><small dir="ltr">{m.id} · v{m.version}{m.author ? ` · ${m.author}` : ''}</small></div>
            {installed && m.kind === 'plugin' && !isCode && <label className="xm-switch"><input type="checkbox" aria-label={`${name(m)} — ${L('activation', 'فعال‌سازی')}`} checked={row.enabled} disabled={busy === row.id} onChange={event => void patch(row, { enabled: event.target.checked }, event.target.checked ? L('Plugin is on.', 'افزونه فعال شد.') : L('Plugin is off.', 'افزونه غیرفعال شد.'))}/><span>{row.enabled ? L('On', 'فعال') : L('Off', 'غیرفعال')}</span></label>}
            {installed && m.kind === 'theme' && !isCode && (row.active ? <span className="xm-chip">{L('Active theme', 'قالب فعال')}</span> : <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id} onClick={() => void patch(row, { activate: true }, L('Theme activated.', 'قالب فعال شد.'))}>{L('Activate', 'فعال‌سازی')}</button>)}
          </div>
          {(fa ? m.description : m.descriptionEn || m.description) && <p className="xm-desc">{fa ? m.description : m.descriptionEn || m.description}</p>}
          <div className="xm-meta">
            <span className="xm-chip is-muted">{m.kind === 'theme' ? L('theme', 'قالب') : L('plugin', 'افزونه')}</span>
            <span className={`xm-chip${isCode ? ' is-warn' : ' is-muted'}`}>{isCode ? (row.codeStatus === 'applied' ? L('code · applied', 'کددار · اعمال‌شده') : L('code · needs rebuild', 'کددار · نیازمند build')) : L('instant', 'نصب فوری')}</span>
            {Object.keys(m.slots || {}).map(slot => <span className="xm-chip is-muted" dir="ltr" key={slot}>{slot}</span>)}
            {(active ? m.pages || [] : []).map(page => <a className="xm-chip" dir="ltr" key={page.slug} href={`/ext/${m.id}/${page.slug}`} target="_blank" rel="noreferrer">/ext/{m.id}/{page.slug}</a>)}
            <span className="xm-chip is-muted">{row.files.length} {L('files', 'فایل')} · {kb(row.bytes)}</span>
          </div>
          {row.codeApply && <p className="xm-desc" role="status">{L('Apply receipt', 'رسید اعمال')}: <span dir="ltr">{row.codeApply.id} · {row.codeApply.mode}</span> · {L(row.codeApply.phase, { prepared: 'آماده‌شده', planned: 'برنامه‌ریزی‌شده', effect: 'در حال اعمال', applied: 'اعمال‌شده', cancelled: 'لغوشده' }[row.codeApply.phase])}{row.codeApply.deploy && <> · {L(row.codeApply.deploy, { claimed: 'درخواست ثبت‌شده', accepted: 'درخواست پذیرفته‌شده', failed: 'درخواست ناموفق', unknown: 'نتیجه نامشخص' }[row.codeApply.deploy])}</>}{pending && <> — {L('Changes are locked until this operation is resumed or cancelled.', 'تا ادامه یا لغو این عملیات، تغییر بسته قفل است.')}</>}{(row.codeApply.deploy === 'claimed' || row.codeApply.deploy === 'unknown') && <> {L('The deployment request will not be resent automatically; verify its outcome.', 'درخواست استقرار خودکار دوباره ارسال نمی‌شود؛ نتیجه را بررسی کنید.')}</>}{row.codeApply.deploy === 'accepted' && <> {L('The deployment request was accepted; deployment is not yet confirmed.', 'درخواست استقرار پذیرفته شده؛ استقرار هنوز تأیید نشده است.')}</>}</p>}
          {pending && row.codeApply?.intent === 'cancel' && <p className="xm-desc" role="status">{L('The previous cancellation is being completed. Continue recovery to finish it.', 'لغو قبلی در حال تکمیل است؛ برای پایان آن بازیابی را ادامه دهید.')}</p>}
          {installed && <div className="xm-foot">
            {pending ? <span className="btn btn-ghost btn-sm" aria-disabled="true">{L('Editor locked', 'ویرایشگر قفل است')}</span> : <Link className="btn btn-ghost btn-sm" href={`/admin/extensions/editor?package=${row.id}`}><Icon name="code" size={15}/> {L('Editor', 'ویرایشگر')}</Link>}
            {active && !!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : row.id)}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
            {code && m.runtime === 'code' && <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id || !code?.ready || !code?.owner || (!pending && row.codeStatus === 'applied')} title={!code?.ready ? code?.detail : !code?.owner ? L('Needs the extensions.code permission', 'نیازمند دسترسی extensions.code') : undefined} onClick={() => void apply(row)}>{pending ? row.codeApply?.intent === 'cancel' ? L('Continue recovery', 'ادامهٔ بازیابی') : L('Resume apply', 'ادامهٔ اعمال') : row.codeStatus === 'applied' ? L('Applied', 'اعمال‌شده') : L('Apply source', 'اعمال سورس')}</button>}
            {pending && row.codeApply?.intent !== 'cancel' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === row.id || !code?.owner} onClick={() => void cancelApply(row)}>{row.codeApply?.mode === 'local' ? L('Cancel and restore previous source', 'لغو و بازیابی سورس قبلی') : L('Cancel apply plan', 'لغو برنامهٔ اعمال')}</button>}
            <a className="btn btn-ghost btn-sm" href={`/api/admin/packages/${row.id}/export`}>{L('Export .zip', 'خروجی zip')}</a>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || pending || active || row.codeStatus === 'applied'} title={pending ? L('Resume or cancel the pending apply first', 'ابتدا اعمال ناتمام را ادامه دهید یا لغو کنید') : active ? L('Deactivate first', 'ابتدا غیرفعال کنید') : row.codeStatus === 'applied' ? L('Source removal requires a reviewed build/deploy', 'حذف سورس به build/deploy بازبینی‌شده نیاز دارد') : undefined} onClick={() => remove(row)}>{L('Uninstall; retain data', 'حذف نصب با حفظ داده‌ها')}</button>
          </div>}
          {!installed && <p className="xm-desc" role="status">{L('Uninstalled; settings, files and history retained privately. Upload a validated package to reinstall; it stays inactive.', 'حذف نصب شده؛ تنظیمات، فایل‌ها و سوابق خصوصی حفظ شده‌اند. برای نصب دوباره بستهٔ معتبر بارگذاری کنید؛ فعال‌سازی جداگانه است.')}</p>}
          {expanded && <form className="xm-settings" onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); void patch(row, { settings: data }, L('Settings saved.', 'تنظیمات ذخیره شد.')) }}>
            {m.settings!.map(setting => <label className="studio-field" key={setting.key}><span>{fa ? setting.label : setting.labelEn || setting.label}</span>{setting.type === 'textarea' ? <textarea className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/> : <input className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/>}</label>)}
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === row.id}>{L('Save settings', 'ذخیرهٔ تنظیمات')}</button>
          </form>}
        </article>
      })}</div>}
  </section>
}
