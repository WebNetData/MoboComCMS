'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import type { ExtensionManifest, ExtensionRow } from './extension-types'

type Props = {
  row: ExtensionRow
  fa: boolean
  byId: ReadonlyMap<string, ExtensionRow>
  dependents: readonly ExtensionRow[]
  busy: boolean
  expanded: boolean
  onToggle: (enabled: boolean) => void
  onSettingsToggle: () => void
  onEdit: (key: string, value: unknown) => void
  onSave: (settings: Record<string, unknown>) => void
}

export default function BuiltinExtensionCard({ row, fa, byId, dependents, busy, expanded, onToggle, onSettingsToggle, onEdit, onSave }: Props) {
  const m = row.manifest
  const on = row.state.enabled
  const L = (en: string, persian: string) => fa ? persian : en
  const name = (manifest: ExtensionManifest) => fa ? manifest.name : manifest.nameEn || manifest.name
  const missing = (m.requires || []).filter(id => !byId.get(id)?.state.enabled)
  const names = (ids: readonly string[]) => ids.map(id => byId.get(id) ? name(byId.get(id)!.manifest) : id).join(fa ? '، ' : ', ')
  const dependentNames = dependents.map(d => name(d.manifest)).join(fa ? '، ' : ', ')
  const locked = on && dependents.length > 0
  const manage = on && !m.adminNavigation?.length ? (m.adminPaths || [])[0] : undefined
  const settingsId = `extension-settings-${m.id}`

  return <article className={`xm-card${on ? ' is-on' : ''}${m.kind === 'module' ? ' is-module' : ''}`} aria-busy={busy}>
    <div className="xm-card-head">
      <span className="xm-icon" aria-hidden="true"><Icon name={m.icon || (m.kind === 'module' ? 'grid' : 'sparkles')} size={22} /></span>
      <div className="xm-title"><h3>{name(m)}</h3><small dir="ltr">{m.id} · v{m.version}</small></div>
      <label className="xm-switch" title={locked ? L(`On while ${dependentNames} needs it`, `تا «${dependentNames}» روشن است خاموش نمی‌شود`) : on ? L('Turn off', 'غیرفعال‌کردن') : L('Turn on', 'فعال‌کردن')}>
        <input type="checkbox" aria-label={`${name(m)} — ${L('activation', 'فعال‌سازی')}`} checked={row.state.requestedEnabled ?? on} disabled={busy || locked} onChange={e => onToggle(e.target.checked)} />
        <span>{on ? L('On', 'فعال') : L('Off', 'غیرفعال')}</span>
      </label>
    </div>
    <p className="xm-desc">{fa ? m.description : m.descriptionEn || m.description}</p>
    {locked && <p className="xm-switch-note">{L('Required by an active extension; turn it off first.', 'برای یک افزونهٔ فعال لازم است؛ ابتدا آن را غیرفعال کنید.')}</p>}
    {row.state.compatibilityError && <p className="xm-alert" role="status">{L('Compatibility issue: review the extension requirements before enabling it.', 'مشکل سازگاری: پیش از فعال‌سازی، نیازمندی‌های افزونه را بررسی کنید.')} <span dir="auto">{row.state.compatibilityError}</span></p>}
    {(row.state.unavailable || row.state.requestedEnabled && !on) && <div className="xm-card-state">
      {row.state.unavailable && <span className="xm-chip is-warn">{L('Stored configuration needs recovery', 'تنظیمات ذخیره‌شده نیازمند بازیابی است')}</span>}
      {!!row.state.requestedEnabled && !on && <span className="xm-chip is-warn">{L('Waiting for a dependency', 'در انتظار وابستگی')}</span>}
    </div>}
    {missing.length > 0 && <p className="xm-alert">{L('Unavailable dependencies:', 'وابستگی‌های غیردردسترس:')} {names(missing)}</p>}
    <details className="xm-details"><summary>{L('Details and dependencies', 'جزئیات و وابستگی‌ها')}</summary><dl className="xm-facts">
      <dt>{L('Installation', 'نصب')}</dt><dd>{L('Included in this build', 'همراه این نسخه')}</dd>
      {!!m.publicPaths?.length && <><dt>{L('Public paths', 'مسیرهای عمومی')}</dt><dd>{m.publicPaths.map(path => <div key={path}><bdi dir="ltr">{path}</bdi></div>)}</dd></>}
      {!!m.adminPaths?.length && <><dt>{L('Admin paths', 'مسیرهای مدیریت')}</dt><dd>{m.adminPaths.map(path => <div key={path}><bdi dir="ltr">{path}</bdi></div>)}</dd></>}
      {!!m.requires?.length && <><dt>{L('Requires', 'نیازمند')}</dt><dd>{names(m.requires)}</dd></>}
      {dependents.length > 0 && <><dt>{L('Used by', 'مورد استفادهٔ')}</dt><dd>{dependentNames}</dd></>}
      {m.kind !== 'module' && !!m.capabilities?.length && <><dt>{L('Capabilities', 'قابلیت‌ها')}</dt><dd>{m.capabilities.join('، ')}</dd></>}
    </dl></details>
    {on && (!!m.settings?.length || !!m.adminNavigation?.length || !!manage) && <div className="xm-foot">
      {manage && <Link className="btn btn-ghost btn-sm" href={manage}>{L('Manage section', 'مدیریت بخش')}</Link>}
      {(m.adminNavigation || []).map(item => <Link className="btn btn-ghost btn-sm" href={item.href} key={item.href}>{fa ? item.label : item.labelEn || item.label}</Link>)}
      {!!m.settings?.length && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded} aria-controls={settingsId} onClick={onSettingsToggle}>{expanded ? L('Hide settings', 'بستن تنظیمات') : L('Settings', 'تنظیمات')}</button>}
    </div>}
    {on && m.id === 'businesses' && <SectionSettingsHistoryLink section="businesses" />}
    <div id={settingsId} hidden={!on || !expanded}>{on && expanded && !!m.settings?.length && <div className="xm-settings">{m.settings.map(def => <label className="studio-field" key={def.key}><span>{fa ? def.label : def.labelEn || def.label}</span>{def.type === 'boolean' ? <input type="checkbox" checked={Boolean(row.state.settings[def.key])} disabled={busy} onChange={e => onSave({ [def.key]: e.target.checked })}/> : def.type === 'select' ? <select className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy} onChange={e => onSave({ [def.key]: e.target.value })}>{def.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : def.type === 'textarea' ? <textarea className="input" value={String(row.state.settings[def.key] ?? '')} disabled={busy} onChange={e => onEdit(def.key, e.target.value)} onBlur={e => onSave({ [def.key]: e.target.value })}/> : <input className="input" type={def.type === 'secret' ? 'password' : def.type === 'number' ? 'number' : 'text'} value={String(row.state.settings[def.key] ?? '')} disabled={busy} onChange={e => onEdit(def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)} onBlur={e => onSave({ [def.key]: def.type === 'number' ? Number(e.target.value) : e.target.value })}/>}{def.description && <small className="muted">{fa ? def.description : def.descriptionEn || def.description}</small>}</label>)}</div>}</div>
  </article>
}
