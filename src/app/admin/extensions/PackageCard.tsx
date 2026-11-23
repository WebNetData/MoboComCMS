'use client'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { PackageRow } from './package-types'
import PackageReceipt from './PackageReceipt'
import SolutionPackPanel from './SolutionPackPanel'

type CodeStatus = { mode: 'git' | 'local' | 'off'; ready: boolean; detail: string; deployHook: boolean; owner: boolean }
type Props = {
  row: PackageRow; fa: boolean; code: CodeStatus | null; busy: string; open: string
  L: (en: string, persian: string) => string
  setOpen: (id: string) => void
  patch: (row: PackageRow, body: Record<string, unknown>, success: string) => unknown
  remove: (row: PackageRow) => void
  apply: (row: PackageRow) => Promise<void>
  cancelApply: (row: PackageRow) => Promise<void>
  onSolutionApplied: () => void
}
const kb = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

export default function PackageCard({ row, fa, code, busy, open, L, setOpen, patch, remove, apply, cancelApply, onSolutionApplied }: Props) {
  const name = (m: PackageRow['manifest']) => fa ? m.name : m.nameEn || m.name
  const m = row.manifest
  const installed = !row.uninstalledAt
  const active = installed && (row.enabled || !!row.active)
  const isCode = m.runtime === 'code'
  const pending = !!row.codeApply && row.codeApply.phase !== 'applied' && row.codeApply.phase !== 'cancelled'
  const expanded = active && !pending && open === row.id
  return <article className={`xm-card pm-card${row.enabled || row.active ? ' is-on' : ''}`} aria-busy={busy === row.id}>
          <div className="xm-card-head">
            <span className="xm-icon" aria-hidden="true"><Icon name={m.kind === 'theme' ? 'palette' : isCode ? 'code' : 'sparkles'} size={22}/></span>
            <div className="xm-title"><h3>{name(m)}</h3><small dir="ltr">{m.id} · v{m.version}{m.author ? ` · ${m.author}` : ''}</small></div>
            {installed && m.kind === 'plugin' && !isCode && !m.solutionPack && <label className="xm-switch"><input type="checkbox" aria-label={`${name(m)} — ${L('activation', 'فعال‌سازی')}`} checked={row.enabled} disabled={!!busy || pending} onChange={event => void patch(row, { enabled: event.target.checked }, event.target.checked ? L('Plugin is on.', 'افزونه فعال شد.') : L('Plugin is off.', 'افزونه غیرفعال شد.'))}/><span>{row.enabled ? L('On', 'فعال') : L('Off', 'غیرفعال')}</span></label>}
            {installed && m.kind === 'theme' && !isCode && (row.active ? <span className="xm-chip">{L('Active theme', 'قالب فعال')}</span> : <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id} onClick={() => void patch(row, { activate: true }, L('Theme activated.', 'قالب فعال شد.'))}>{L('Activate', 'فعال‌سازی')}</button>)}
          </div>
          {(fa ? m.description : m.descriptionEn || m.description) && <p className="xm-desc">{fa ? m.description : m.descriptionEn || m.description}</p>}
          <div className="pm-facts">
            <span>{m.kind === 'theme' ? L('Theme', 'قالب') : L('Plugin', 'افزونه')} · {isCode ? (row.codeStatus === 'applied' ? L('code applied', 'کد اعمال‌شده') : L('code needs rebuild', 'کد نیازمند build')) : L('instant install', 'نصب فوری')} · {row.files.length} {L('files', 'فایل')} · {kb(row.bytes)}</span>
            {Object.keys(m.slots || {}).map(slot => <span dir="ltr" key={slot}>{slot}</span>)}
            {(active ? m.pages || [] : []).map(page => <a dir="ltr" key={page.slug} href={`/ext/${m.id}/${page.slug}`} target="_blank" rel="noreferrer">/ext/{m.id}/{page.slug}</a>)}
          </div>
          {installed && m.solutionPack && <SolutionPackPanel id={row.id} receipt={row.solutionApply} onApplied={onSolutionApplied}/>}
          {row.codeApply && <>
            {(pending || row.codeApply.deploy) && <div className="pm-recovery" role="status">
              {pending && <p>{row.codeApply.intent === 'cancel' ? L('The previous cancellation is being completed. Continue recovery to finish it.', 'لغو قبلی در حال تکمیل است؛ برای پایان آن بازیابی را ادامه دهید.') : L('Changes are locked until this operation is resumed or cancelled.', 'تا ادامه یا لغو این عملیات، تغییر بسته قفل است.')}</p>}
              {(row.codeApply.deploy === 'claimed' || row.codeApply.deploy === 'unknown') && <p>{L('Deployment outcome is unknown. The request will not be resent automatically; verify its outcome.', 'نتیجهٔ استقرار نامشخص است. درخواست خودکار دوباره ارسال نمی‌شود؛ نتیجه را بررسی کنید.')}</p>}
              {row.codeApply.deploy === 'accepted' && <p>{L('The deployment request was accepted; deployment is not yet confirmed.', 'درخواست استقرار پذیرفته شده؛ استقرار هنوز تأیید نشده است.')}</p>}
              {row.codeApply.deploy === 'failed' && <p>{L('The deployment request failed. Check the deployment service before trying again.', 'درخواست استقرار ناموفق بود؛ سرویس استقرار را بررسی کنید.')}</p>}
            </div>}
            <PackageReceipt receipt={row.codeApply} L={L}/>
          </>}
          {installed && <div className="pm-actions">
            <div className="pm-actions-main">
            {pending ? <button type="button" className="btn btn-ghost btn-sm" disabled>{L('Editor locked', 'ویرایشگر قفل است')}</button> : <Link className="btn btn-ghost btn-sm" href={`/admin/extensions/editor?package=${row.id}`}><Icon name="code" size={15}/> {L('Editor', 'ویرایشگر')}</Link>}
            {active && !!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-expanded={expanded} aria-controls={`pm-settings-${row.id}`} onClick={() => setOpen(expanded ? '' : row.id)}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
            {code && m.runtime === 'code' && <button type="button" className="btn btn-primary btn-sm" disabled={busy === row.id || !code?.ready || !code?.owner || (!pending && row.codeStatus === 'applied')} title={!code?.ready ? code?.detail : !code?.owner ? L('Needs the extensions.code permission', 'نیازمند دسترسی extensions.code') : undefined} onClick={() => void apply(row)}>{pending ? row.codeApply?.intent === 'cancel' ? L('Continue recovery', 'ادامهٔ بازیابی') : L('Resume apply', 'ادامهٔ اعمال') : row.codeStatus === 'applied' ? L('Applied', 'اعمال‌شده') : L('Apply source', 'اعمال سورس')}</button>}
            {pending && row.codeApply?.intent !== 'cancel' && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === row.id || !code?.owner} onClick={() => void cancelApply(row)}>{row.codeApply?.mode === 'local' ? L('Cancel and restore previous source', 'لغو و بازیابی سورس قبلی') : L('Cancel apply plan', 'لغو برنامهٔ اعمال')}</button>}
            </div><div className="pm-actions-secondary">
            <a className="btn btn-ghost btn-sm" href={`/api/admin/packages/${row.id}/export`}>{L('Export .zip', 'خروجی zip')}</a>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || pending || active || row.codeStatus === 'applied'} onClick={() => remove(row)}>{L('Uninstall', 'حذف نصب')}</button>
            </div>
          </div>}
          {installed && (pending || active || row.codeStatus === 'applied' || (isCode && code && (!code.ready || !code.owner))) && <p className="xm-desc">{pending ? L('Resume or cancel the pending apply first.', 'ابتدا اعمال ناتمام را ادامه دهید یا لغو کنید.') : active ? L('Deactivate before uninstalling.', 'پیش از حذف نصب، غیرفعال کنید.') : row.codeStatus === 'applied' ? L('Source removal requires a reviewed build and deployment.', 'حذف سورس به build و استقرار بازبینی‌شده نیاز دارد.') : !code?.ready ? code?.detail : L('Applying source requires the extensions.code permission.', 'اعمال سورس نیازمند دسترسی extensions.code است.')}</p>}
          {!installed && <p className="xm-desc" role="status">{L('Uninstalled; settings, files and history retained privately. Upload a validated package to reinstall; it stays inactive.', 'حذف نصب شده؛ تنظیمات، فایل‌ها و سوابق خصوصی حفظ شده‌اند. برای نصب دوباره بستهٔ معتبر بارگذاری کنید؛ فعال‌سازی جداگانه است.')}</p>}
          <div id={`pm-settings-${row.id}`} hidden={!expanded}>{expanded && <form className="xm-settings" onSubmit={event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); void patch(row, { settings: data }, L('Settings saved.', 'تنظیمات ذخیره شد.')) }}>
            {m.settings!.map(setting => <label className="studio-field" key={setting.key}><span>{fa ? setting.label : setting.labelEn || setting.label}</span>{setting.type === 'textarea' ? <textarea className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/> : <input className="input" name={setting.key} defaultValue={row.settings[setting.key] ?? ''}/>}</label>)}
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === row.id}>{L('Save settings', 'ذخیرهٔ تنظیمات')}</button>
          </form>}</div>
        </article>
}
