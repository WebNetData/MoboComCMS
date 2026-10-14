'use client'

import { BADGE_METRICS, BADGE_RULE_LABEL, levelFor, parseThresholdRule, type BadgeMetric, type UserLevel } from '@/modules/forum/domain/community'

const fa = (n: number) => n.toLocaleString('fa-IR')
const num = (value: string) => Math.max(0, Math.trunc(Number(value)) || 0)

/**
 * Levels a member reaches by what they did. The last level in the list whose every threshold is met is the one
 * shown under their name, so the list runs from the easiest to the hardest.
 */
export default function LevelsTab({ levels, busy, onChange, onSave }: { levels: UserLevel[]; busy: boolean; onChange: (levels: UserLevel[]) => void; onSave: () => void }) {
  const set = (index: number, patch: Partial<UserLevel>) => onChange(levels.map((level, at) => (at === index ? { ...level, ...patch } : level)))
  const move = (index: number, delta: number) => { const to = index + delta; if (to < 0 || to >= levels.length) return; const next = [...levels]; const [item] = next.splice(index, 1); next.splice(to, 0, item); onChange(next) }
  const samples = [{ posts: 3, likes: 0 }, { posts: 60, likes: 20 }, { posts: 120, likes: 150 }, { posts: 400, likes: 900 }]
  return <section className="xm-section">
    <h2>درجه‌های کاربری</h2>
    <p className="muted">هر کاربر با رسیدن به آستانه‌ها درجه می‌گیرد و زیر نامش در تاپیک‌ها نشان داده می‌شود. <b>آخرین</b> درجهٔ این فهرست که همهٔ شرط‌هایش برقرار باشد نمایش داده می‌شود؛ پس از آسان به سخت بچینید. درجه از روی آمار فعلی هر کاربر حساب می‌شود و برای همهٔ کاربران قدیمی هم بلافاصله اعمال است.</p>
    <div className="lv-list">
      {levels.map((level, index) => <div key={index} className="card lv-row" style={{ ['--lv' as string]: level.color }}>
        <span className="lv-chip"><i aria-hidden="true">{level.icon}</i>{level.name || 'بدون نام'}</span>
        <label className="studio-field"><span>نام درجه</span><input className="input" value={level.name} maxLength={40} onChange={(e) => set(index, { name: e.target.value })} placeholder="مثلاً: کاربر فعال" /></label>
        <label className="studio-field lv-small"><span>آیکون</span><input className="input" value={level.icon} maxLength={8} onChange={(e) => set(index, { icon: e.target.value })} /></label>
        <label className="studio-field lv-small"><span>رنگ</span><input type="color" value={level.color} onChange={(e) => set(index, { color: e.target.value })} aria-label="رنگ" /></label>
        <label className="studio-field"><span>حداقل پیام</span><input className="input" dir="ltr" inputMode="numeric" value={level.minPosts} onChange={(e) => set(index, { minPosts: num(e.target.value) })} /></label>
        <label className="studio-field"><span>حداقل لایک دریافتی</span><input className="input" dir="ltr" inputMode="numeric" value={level.minLikes} onChange={(e) => set(index, { minLikes: num(e.target.value) })} /></label>
        <label className="studio-field"><span>حداقل اعتبار</span><input className="input" dir="ltr" inputMode="numeric" value={level.minReputation} onChange={(e) => set(index, { minReputation: num(e.target.value) })} /></label>
        <div className="lv-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="بالاتر">↑</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(index, 1)} disabled={index === levels.length - 1} aria-label="پایین‌تر">↓</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(levels.filter((_, at) => at !== index))}>حذف</button>
        </div>
      </div>)}
      {!levels.length && <p className="card muted">درجه‌ای تعریف نشده است؛ زیر نام کاربران فقط گروه یا سطح اعتمادشان نشان داده می‌شود.</p>}
    </div>
    <div className="fr-admin-actions">
      <button type="button" className="btn btn-ghost btn-sm" disabled={levels.length >= 20} onClick={() => onChange([...levels, { id: `level${Date.now().toString(36)}`, name: '', icon: '⭐', color: '#6366f1', minPosts: 0, minLikes: 0, minReputation: 0 }])}>+ درجهٔ تازه</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || levels.some((level) => !level.name.trim())} onClick={onSave}>ذخیرهٔ درجه‌ها</button>
    </div>
    <div className="card lv-preview">
      <b>نمونه: کاربری با این آمار چه درجه‌ای می‌گیرد؟</b>
      <ul>{samples.map((sample, index) => { const level = levelFor(levels.filter((item) => item.name.trim()), { ...sample, reputation: sample.likes }); return <li key={index}><span>{fa(sample.posts)} پیام · {fa(sample.likes)} لایک</span>{level ? <span className="lv-chip" style={{ ['--lv' as string]: level.color }}><i aria-hidden="true">{level.icon}</i>{level.name}</span> : <span className="muted">بدون درجه</span>}</li> })}</ul>
    </div>
  </section>
}

/** The rule of an automatic badge: none (given by hand), one of the fixed ones, or a number of the admin's choosing. */
export function BadgeRulePicker({ rule, fixed, onChange }: { rule: string; fixed: string[]; onChange: (rule: string) => void }) {
  const threshold = parseThresholdRule(rule)
  const mode = threshold ? 'threshold' : rule ? 'fixed' : 'manual'
  return <div className="studio-field fr-admin-wide lv-rule">
    <span>چه زمانی داده شود؟</span>
    <div className="lv-rule-row">
      <select className="input" aria-label="نوع قاعده" value={mode} onChange={(e) => onChange(e.target.value === 'threshold' ? 'posts:100' : e.target.value === 'fixed' ? fixed[0] || '' : '')}>
        <option value="manual">فقط دستی (مدیر می‌دهد)</option>
        <option value="threshold">با رسیدن به یک عدد</option>
        <option value="fixed">قاعدهٔ آماده</option>
      </select>
      {mode === 'fixed' && <select className="input" aria-label="قاعدهٔ آماده" value={rule} onChange={(e) => onChange(e.target.value)}>{fixed.map((id) => <option key={id} value={id}>{BADGE_RULE_LABEL[id] || id}</option>)}</select>}
      {threshold && <>
        <select className="input" aria-label="معیار" value={threshold.metric} onChange={(e) => onChange(`${e.target.value}:${threshold.value}`)}>{(Object.keys(BADGE_METRICS) as BadgeMetric[]).map((metric) => <option key={metric} value={metric}>{BADGE_METRICS[metric]}</option>)}</select>
        <input className="input" dir="ltr" inputMode="numeric" aria-label="عدد" value={threshold.value} onChange={(e) => onChange(`${threshold.metric}:${Math.max(1, Math.trunc(Number(e.target.value)) || 1)}`)} />
      </>}
    </div>
    {threshold && <small className="muted">هر کاربری که {BADGE_METRICS[threshold.metric]}ش به {fa(threshold.value)} برسد این نشان را می‌گیرد؛ با ذخیره، به همهٔ کسانی که از قبل به این عدد رسیده‌اند هم داده می‌شود.</small>}
  </div>
}
