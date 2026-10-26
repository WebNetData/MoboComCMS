'use client'

import { useEffect, useRef, useState } from 'react'
import { BADGE_METRICS, BADGE_RULE_LABEL, parseThresholdRule } from '@/modules/forum/domain/community'
import { BadgeRulePicker } from './LevelsTab'
import { TIER_LABEL, fa, type Badge, type Call } from './shared'

type Draft = Omit<Badge, 'grantCount'>
const EMPTY: Draft = { id: 0, slug: '', name: '', description: '', icon: '🏅', tier: 'BRONZE', rule: '', enabled: true }

/** A badge's rule in words: by hand, a fixed rule, or the number it is given at. */
const ruleLabel = (rule: string) => { const parsed = parseThresholdRule(rule); return parsed ? `${BADGE_METRICS[parsed.metric]} ≥ ${parsed.value.toLocaleString('fa-IR')}` : rule ? BADGE_RULE_LABEL[rule] || rule : 'دستی' }

/** Badges: their rule (by hand, fixed, or a threshold) and tier; a badge is given or taken back from its own row. */
export default function BadgesTab({ badges, rules, busy, call, remove }: { badges: Badge[]; rules: string[]; busy: boolean; call: Call; remove: (section: string, id: number, label: string) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [granting, setGranting] = useState<Badge | null>(null)
  const ordered = [...badges].sort((a, b) => Number(b.enabled) - Number(a.enabled))
  return <section className="sa-card">
    <div className="sa-card-head">
      <div><h2>نشان‌ها</h2><small>{fa(badges.filter((b) => b.enabled).length)} نشان فعال از {fa(badges.length)}؛ نشان‌های دارای قاعده خودکار داده می‌شوند و بقیه دستی.</small></div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { setGranting(null); setDraft({ ...EMPTY }) }}>+ نشان تازه</button>
    </div>
    {draft && <BadgeForm key={draft.id} draft={draft} rules={rules} busy={busy} call={call} onClose={() => setDraft(null)} />}
    {granting && <GrantForm key={granting.id} badge={granting} busy={busy} call={call} onClose={() => setGranting(null)} />}
    <div className="sa-table-wrap"><table className="data sa-table sa-cards">
      <thead><tr><th>نشان</th><th>درجه</th><th>قاعده</th><th>دریافت</th><th>وضعیت</th><th><span className="sr-only">کارها</span></th></tr></thead>
      <tbody>
        {ordered.map((b) => <tr key={b.id}>
          <td className="sa-card-main"><div className="fa-node"><span className="fa-node-icon" aria-hidden="true">{b.icon}</span><span><b>{b.name}</b>{b.description && <small className="sa-sub">{b.description}</small>}</span></div></td>
          <td data-label="درجه">{TIER_LABEL[b.tier] || b.tier}</td>
          <td data-label="قاعده">{ruleLabel(b.rule)}</td>
          <td data-label="دریافت">{fa(b.grantCount)}</td>
          <td data-label="وضعیت"><span className={`sa-state ${b.enabled ? 'is-ok' : ''}`}>{b.enabled ? 'فعال' : 'خاموش'}</span></td>
          <td className="sa-card-foot"><div className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setGranting(null); setDraft({ id: b.id, slug: b.slug, name: b.name, description: b.description, icon: b.icon, tier: b.tier, rule: b.rule, enabled: b.enabled }) }}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={granting?.id === b.id} onClick={() => { setDraft(null); setGranting(granting?.id === b.id ? null : b) }}>اعطا یا پس‌گرفتن</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove('badges', b.id, b.name)}>حذف</button>
          </div></td>
        </tr>)}
        {!badges.length && <tr><td colSpan={6} className="sa-empty">هنوز نشانی ساخته نشده است.</td></tr>}
      </tbody>
    </table></div>
  </section>
}

function BadgeForm({ draft, rules, busy, call, onClose }: { draft: Draft; rules: string[]; busy: boolean; call: Call; onClose: () => void }) {
  const [badge, setBadge] = useState(draft)
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => { name.current?.focus(); name.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const heading = badge.id ? `ویرایش نشان «${draft.name}»` : 'نشان تازه'
  return <form className="fr-admin-form fa-panel" aria-label={heading} onSubmit={async (event) => { event.preventDefault(); if (await call(badge.id ? 'PATCH' : 'POST', { section: 'badges', ...badge }, badge.id ? 'نشان به‌روز شد' : 'نشان ساخته شد')) onClose() }}>
    <div className="fa-panel-head"><h3>{heading}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div>
    <label className="studio-field"><span>نام</span><input ref={name} className="input" value={badge.name} onChange={(e) => setBadge({ ...badge, name: e.target.value })} required maxLength={60} /></label>
    <label className="studio-field"><span>آیکون</span><input className="input" value={badge.icon} onChange={(e) => setBadge({ ...badge, icon: e.target.value })} maxLength={8} /></label>
    <label className="studio-field"><span>درجه</span><select className="input" value={badge.tier} onChange={(e) => setBadge({ ...badge, tier: e.target.value })}>{Object.entries(TIER_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <BadgeRulePicker rule={badge.rule} fixed={rules} onChange={(rule) => setBadge({ ...badge, rule })} />
    <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={badge.description} onChange={(e) => setBadge({ ...badge, description: e.target.value })} maxLength={300} /></label>
    <label className="studio-switch"><input type="checkbox" checked={badge.enabled} onChange={(e) => setBadge({ ...badge, enabled: e.target.checked })} />فعال</label>
    <div className="fr-admin-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{badge.id ? 'ذخیرهٔ تغییرات' : 'افزودن نشان'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>انصراف</button></div>
  </form>
}

function GrantForm({ badge, busy, call, onClose }: { badge: Badge; busy: boolean; call: Call; onClose: () => void }) {
  const [grant, setGrant] = useState({ username: '', reason: '' })
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const send = async (give: boolean) => { if (await call('POST', { section: 'grant', badgeId: badge.id, ...grant, grant: give }, give ? 'نشان اعطا شد' : 'نشان پس گرفته شد')) setGrant({ username: '', reason: '' }) }
  return <form className="fr-admin-form fa-panel" aria-label={`اعطای «${badge.name}»`} onSubmit={(event) => { event.preventDefault(); void send(true) }}>
    <div className="fa-panel-head"><h3>{badge.icon} اعطای «{badge.name}» <small className="muted">{fa(badge.grantCount)} نفر دارند</small></h3><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>بستن</button></div>
    <label className="studio-field"><span>نام کاربری</span><input ref={input} className="input" dir="ltr" value={grant.username} onChange={(e) => setGrant({ ...grant, username: e.target.value })} placeholder="@username" required /></label>
    <label className="studio-field fr-admin-wide"><span>دلیل (اختیاری)</span><input className="input" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} maxLength={200} /></label>
    <div className="fr-admin-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>اعطای نشان</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !grant.username} onClick={() => void send(false)}>پس‌گرفتن</button></div>
  </form>
}
