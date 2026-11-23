'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '@/components/site/Icon'

import type { PackageRow } from './package-types'
import PackageCard from './PackageCard'
export type { PackageRow } from './package-types'

type CodeStatus = { mode: 'git' | 'local' | 'off'; ready: boolean; detail: string; deployHook: boolean; owner: boolean }
type Builtin = { id: string; kind: 'plugin' | 'theme'; name: string }

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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const hasPending = rows.some(row => row.codeApply && row.codeApply.phase !== 'applied' && row.codeApply.phase !== 'cancelled')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/packages', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || L('Could not load packages.', 'دریافت بسته‌ها ناموفق بود.'))
      setRows(data.packages || []); setCode(data.code || null); setBuiltins(data.builtins || []); setLoadError(false)
    } catch (error) {
      setLoadError(true)
      setMessage({ text: error instanceof Error ? error.message : L('Could not load packages.', 'دریافت بسته‌ها ناموفق بود.'), error: true })
    } finally { setLoading(false) }
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
    if (!file || hasPending || busy || loading || loadError) return
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

  return <section id="uploaded-packages" className="xm-section" aria-labelledby="pm-title">
    <h2 id="pm-title">{L('Uploaded plugins & themes', 'افزونه‌ها و قالب‌های آپلودی')}</h2>
    <div className={`pm-drop${drag ? ' is-drag' : ''}`} onDragOver={event => { event.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); void upload(event.dataTransfer.files?.[0]) }} aria-busy={busy === 'upload'}>
      <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={event => void upload(event.target.files?.[0])} disabled={!!busy || hasPending || loading || loadError}/>
      <Icon name="upload" size={22}/>
      <div><strong>{busy === 'upload' ? L('Installing…', 'در حال نصب…') : drag ? L('Drop the package here', 'بسته را اینجا رها کنید') : L('Upload a plugin or theme', 'آپلود افزونه یا قالب')}</strong>
      <small>{L('Drop a zip file here. Updates retain package settings.', 'فایل zip را اینجا رها کنید. تنظیمات هنگام به‌روزرسانی حفظ می‌شوند.')}</small></div>
      <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || hasPending || loading || loadError} onClick={() => input.current?.click()}>{L('Choose zip file', 'انتخاب فایل zip')}</button>
      {hasPending && <small>{L('Resume or cancel the pending apply before uploading packages.', 'پیش از بارگذاری بسته، اعمال ناتمام را ادامه دهید یا لغو کنید.')}</small>}
    </div>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {code && <details className="pm-code"><summary>{L('Edit built-in source', 'ویرایش سورس داخلی')}</summary>
      <span className={`xm-chip${code.ready ? '' : ' is-warn'}`}>{L('Code packages', 'بسته‌های کددار')}: {code.mode === 'git' ? `Git · ${code.detail}` : code.mode === 'local' ? L('local source', 'سورس محلی') : L('off', 'غیرفعال')}</span>
      {!code.ready && <small className="muted">{code.mode === 'off' ? L('Installing code packages is off on this server. To turn it on, set PACKAGE_APPLY_MODE to git or local (see docs/packages).', 'نصب بستهٔ کددار روی این سرور خاموش است. برای روشن‌کردن، PACKAGE_APPLY_MODE را روی git یا local تنظیم کنید (راهنما: docs/packages).') : code.detail}</small>}
      {code.owner && code.ready && builtins.length > 0 && <label className="pm-builtin"><span>{L('Edit code of a built-in theme/plugin', 'ویرایش کد قالب/افزونهٔ داخلی')}</span><select className="input" value="" disabled={!!busy || hasPending} onChange={event => void editBuiltin(event.target.value)}><option value="">{L('Choose…', 'انتخاب…')}</option>{builtins.map(item => <option key={item.id} value={item.id}>{item.kind === 'theme' ? L('Theme', 'قالب') : L('Plugin', 'افزونه')} · {item.name}</option>)}</select></label>}
    </details>}
    {loading ? <div className="tb-empty" role="status">{L('Loading packages…', 'در حال دریافت بسته‌ها…')}</div>
      : loadError ? <div className="tb-empty"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); setMessage(null); void load() }}>{L('Retry', 'تلاش دوباره')}</button></div>
      : !rows.length ? <div className="tb-empty">{L('No packages uploaded yet. Sample packages live in docs/packages/examples.', 'هنوز بسته‌ای آپلود نشده است. نمونه‌ها در docs/packages/examples هستند.')}</div>
      : <div className="pm-grid">{rows.map(row => <PackageCard key={row.id} row={row} fa={fa} code={code} busy={busy} open={open} L={L} setOpen={setOpen} patch={patch} remove={remove} apply={apply} cancelApply={cancelApply}/>)}</div>}
  </section>
}
