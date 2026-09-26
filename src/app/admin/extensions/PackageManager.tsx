'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/site/Icon'

type Setting = { key: string; label: string; labelEn?: string; type: 'text' | 'textarea'; default?: string }
type Manifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string; version: string; author?: string
  kind: 'plugin' | 'theme'; runtime: 'declarative' | 'code'; slots?: Record<string, unknown>; pages?: { slug: string; title: { fa: string; en: string } }[]; settings?: Setting[]
}
export type PackageRow = {
  id: string; manifest: Manifest; enabled: boolean; settings: Record<string, string>; files: { path: string; bytes: number; editable: boolean }[]
  bytes: number; updatedAt: string; revisions: number; codeStatus?: 'staged' | 'applied'; active?: boolean
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
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : String(error), error: true }) }
    finally { setBusy('') }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    if (!/\.zip$/i.test(file.name)) { setMessage({ text: L('Choose a .zip package.', 'یک فایل ‎.zip انتخاب کنید.'), error: true }); return }
    const form = new FormData()
    form.append('file', file)
    const data = await call('upload', () => fetch('/api/admin/packages', { method: 'POST', body: form }), L('Package installed.', 'بسته نصب شد.'))
    if (data?.package) setMessage({ text: data.upgraded ? L(`${data.package.manifest.name} was updated to v${data.package.manifest.version}.`, `«${data.package.manifest.name}» به نسخهٔ ${data.package.manifest.version} به‌روز شد.`) : data.package.manifest.runtime === 'code' ? L(`${data.package.manifest.name} was uploaded. Code packages run after “Apply & rebuild”.`, `«${data.package.manifest.name}» آپلود شد. بسته‌های کددار بعد از «اعمال و build» اجرا می‌شوند.`) : L(`${data.package.manifest.name} is installed. Turn it on when you are ready.`, `«${data.package.manifest.name}» نصب شد. هر وقت آماده بودید فعالش کنید.`), error: false })
    if (input.current) input.current.value = ''
  }

  const patch = (row: PackageRow, body: Record<string, unknown>, success: string) =>
    call(row.id, () => fetch(`/api/admin/packages/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), success)
  const remove = (row: PackageRow) => {
    if (!window.confirm(L(`Delete ${row.manifest.name}? Its files and settings are removed. Export it first if you may need it again.`, `«${row.manifest.name}» حذف شود؟ فایل‌ها و تنظیماتش پاک می‌شود. اگر بعداً لازمش دارید، اول خروجی بگیرید.`))) return
    void call(row.id, () => fetch(`/api/admin/packages/${row.id}`, { method: 'DELETE' }), L('Package deleted.', 'بسته حذف شد.'))
  }
  const name = (m: Manifest) => (fa ? m.name : m.nameEn || m.name)
  async function apply(row: PackageRow) {
    const where = code?.mode === 'git' ? L(`It is committed to ${code.detail} and the site rebuilds (a few minutes).`, `در ${code.detail} ثبت می‌شود و سایت دوباره build می‌شود (چند دقیقه).`) : L('It is written to the local source tree; rebuild/restart afterwards.', 'در سورس محلی نوشته می‌شود؛ بعد از آن build یا ری‌استارت کنید.')
    if (!window.confirm(L(`Apply the code of ${row.manifest.name}? Code packages run with full server access — apply only code you trust. ${where} If the build or its checks fail, the current site keeps running.`, `کد «${row.manifest.name}» اعمال شود؟ بسته‌های کددار به کل سرور دسترسی دارند؛ فقط کدی را اعمال کنید که به آن اعتماد دارید. ${where} اگر build یا بررسی‌ها خطا بدهند، سایت فعلی دست‌نخورده می‌ماند.`))) return
    const data = await call(row.id, () => fetch(`/api/admin/packages/${row.id}/apply`, { method: 'POST' }), L('Applied.', 'اعمال شد.'))
    if (data) setMessage({ text: !data.changed ? L('Nothing changed since the last apply.', 'از آخرین اعمال تغییری نبوده است.') : data.mode === 'git' ? L(`Committed ${String(data.commit).slice(0, 7)}. ${data.deploy || 'The deployment starts from the push.'} After it is live, switch the extension on in the list above.`, `commit ${String(data.commit).slice(0, 7)} ثبت شد. ${data.deploy ? (data.deploy === 'deployment triggered' ? 'استقرار شروع شد.' : data.deploy) : 'استقرار با push شروع می‌شود.'} بعد از بالا آمدن نسخهٔ جدید، افزونه را در فهرست بالا فعال کنید.`) : L('Written to the source tree. Rebuild or restart to load it.', 'در سورس نوشته شد. برای بارگذاری، build یا ری‌استارت کنید.'), error: false })
  }
  async function editBuiltin(id: string) {
    if (!id) return
    const data = await call('source', () => fetch('/api/admin/packages/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }), L('Source opened as a code package.', 'سورس به‌صورت بستهٔ کددار باز شد.'))
    if (data?.package) window.location.href = `/admin/extensions/editor?package=${data.package.id}`
  }

  return <section className="xm-section" aria-labelledby="pm-title">
    <h2 id="pm-title">{L('Uploaded plugins & themes', 'افزونه‌ها و قالب‌های آپلودی')}</h2>
    <label className={`pm-drop${drag ? ' is-drag' : ''}`} onDragOver={event => { event.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={event => { event.preventDefault(); setDrag(false); void upload(event.dataTransfer.files?.[0]) }} aria-busy={busy === 'upload'}>
      <input ref={input} type="file" accept=".zip,application/zip" className="sr-only" onChange={event => void upload(event.target.files?.[0])} disabled={busy === 'upload'}/>
      <Icon name="upload" size={26}/>
      <strong>{busy === 'upload' ? L('Installing…', 'در حال نصب…') : L('Upload a plugin or theme (.zip)', 'آپلود افزونه یا قالب (‎.zip)')}</strong>
      <small>{L('Drop a file here or click to choose. Uploading a newer version of an installed package updates it and keeps its settings.', 'فایل را اینجا رها کنید یا کلیک کنید. آپلود نسخهٔ جدید یک بستهٔ نصب‌شده، آن را به‌روز می‌کند و تنظیماتش حفظ می‌شود.')}</small>
    </label>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}
    {code && <div className="pm-code">
      <span className={`xm-chip${code.ready ? '' : ' is-warn'}`}>{L('Code packages', 'بسته‌های کددار')}: {code.mode === 'git' ? `Git · ${code.detail}` : code.mode === 'local' ? L('local source', 'سورس محلی') : L('off', 'غیرفعال')}</span>
      {!code.ready && <small className="muted">{code.detail}</small>}
      {code.owner && code.ready && builtins.length > 0 && <label className="pm-builtin"><span>{L('Edit code of a built-in theme/plugin', 'ویرایش کد قالب/افزونهٔ داخلی')}</span><select className="input" value="" disabled={busy === 'source'} onChange={event => void editBuiltin(event.target.value)}><option value="">{L('Choose…', 'انتخاب…')}</option>{builtins.map(item => <option key={item.id} value={item.id}>{item.kind === 'theme' ? L('Theme', 'قالب') : L('Plugin', 'افزونه')} · {item.name}</option>)}</select></label>}
    </div>}
    {!rows.length ? <div className="tb-empty">{L('No packages uploaded yet. Sample packages live in docs/packages/examples.', 'هنوز بسته‌ای آپلود نشده است. نمونه‌ها در docs/packages/examples هستند.')}</div>
      : <div className="xm-grid">{rows.map(row => {
        const m = row.manifest
        const expanded = open === row.id
        const isCode = m.runtime === 'code'
        return <article key={row.id} className={`xm-card${row.enabled || row.active ? ' is-on' : ''}`} aria-busy={busy === row.id}>
          <div className="xm-card-head">
            <span className="xm-icon" aria-hidden="true"><Icon name={m.kind === 'theme' ? 'palette' : isCode ? 'code' : 'sparkles'} size={22}/></span>
            <div className="xm-title"><h3>{name(m)}</h3><small dir="ltr">{m.id} · v{m.version}{m.author ? ` · ${m.author}` : ''}</small></div>
            {m.kind === 'plugin' && !isCode && <label className="xm-switch"><input type="checkbox" checked={row.enabled} disabled={busy === row.id} onChange={event => void patch(row, { enabled: event.target.checked }, event.target.checked ? L('Plugin is on.', 'افزونه فعال شد.') : L('Plugin is off.', 'افزونه غیرفعال شد.'))}/><span>{row.enabled ? L('On', 'فعال') : L('Off', 'غیرفعال')}</span></label>}
            {m.kind === 'theme' && !isCode && (row.active ? <span className="xm-chip">{L('Active theme', 'قالب فعال')}</span> : <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id} onClick={() => void patch(row, { activate: true }, L('Theme activated.', 'قالب فعال شد.'))}>{L('Activate', 'فعال‌سازی')}</button>)}
          </div>
          {(fa ? m.description : m.descriptionEn || m.description) && <p className="xm-desc">{fa ? m.description : m.descriptionEn || m.description}</p>}
          <div className="xm-meta">
            <span className="xm-chip is-muted">{m.kind === 'theme' ? L('theme', 'قالب') : L('plugin', 'افزونه')}</span>
            <span className={`xm-chip${isCode ? ' is-warn' : ' is-muted'}`}>{isCode ? (row.codeStatus === 'applied' ? L('code · applied', 'کددار · اعمال‌شده') : L('code · needs rebuild', 'کددار · نیازمند build')) : L('instant', 'نصب فوری')}</span>
            {Object.keys(m.slots || {}).map(slot => <span className="xm-chip is-muted" dir="ltr" key={slot}>{slot}</span>)}
            {(m.pages || []).map(page => <a className="xm-chip" dir="ltr" key={page.slug} href={`/ext/${m.id}/${page.slug}`} target="_blank" rel="noreferrer">/ext/{m.id}/{page.slug}</a>)}
            <span className="xm-chip is-muted">{row.files.length} {L('files', 'فایل')} · {kb(row.bytes)}</span>
          </div>
          <div className="xm-foot">
            <Link className="btn btn-ghost btn-sm" href={`/admin/extensions/editor?package=${row.id}`}><Icon name="code" size={15}/> {L('Editor', 'ویرایشگر')}</Link>
            {!!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : row.id)}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
            {code && m.runtime === 'code' && <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id || !code?.ready || !code?.owner || row.codeStatus === 'applied'} title={!code?.ready ? code?.detail : !code?.owner ? L('Needs the extensions.code permission', 'نیازمند دسترسی extensions.code') : undefined} onClick={() => void apply(row)}>{row.codeStatus === 'applied' ? L('Applied', 'اعمال‌شده') : L('Apply & rebuild', 'اعمال و build')}</button>}
            <a className="btn btn-ghost btn-sm" href={`/api/admin/packages/${row.id}/export`}>{L('Export .zip', 'خروجی zip')}</a>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === row.id} onClick={() => remove(row)}>{L('Delete', 'حذف')}</button>
          </div>
          {expanded && <form className="xm-settings" onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); void patch(row, { settings: data }, L('Settings saved.', 'تنظیمات ذخیره شد.')) }}>
            {m.settings!.map(setting => <label className="studio-field" key={setting.key}><span>{fa ? setting.label : setting.labelEn || setting.label}</span>{setting.type === 'textarea' ? <textarea className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/> : <input className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/>}</label>)}
            <button className="btn btn-primary btn-sm" disabled={busy === row.id}>{L('Save settings', 'ذخیرهٔ تنظیمات')}</button>
          </form>}
        </article>
      })}</div>}
  </section>
}
