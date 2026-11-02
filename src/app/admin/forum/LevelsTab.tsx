'use client'

import { BADGE_METRICS, BADGE_RULE_LABEL, LEVEL_CONDITIONS, levelFor, parseThresholdRule, type BadgeMetric, type UserLevel } from '@/modules/forum/domain/community'

const fa = (n: number) => n.toLocaleString('fa-IR')
const num = (value: string) => Math.max(0, Math.trunc(Number(value)) || 0)

const NEW_RANK = { icon: '⭐', color: '#6366f1', match: 'ALL', manualOnly: false, minPosts: 0, minLikes: 0, minReputation: 0, minTopics: 0, minSolved: 0, minDaysVisited: 0, minAccountDays: 0 } as const
const SAMPLES = [{ posts: 3, likes: 0 }, { posts: 60, likes: 20 }, { posts: 120, likes: 150 }, { posts: 400, likes: 300 }, { posts: 800, likes: 900 }]

/**
 * The forum's ranks. A member holds the last rank in this list they earned, so the list runs from the easiest to the
 * hardest. Each rank asks for its own conditions, all of them or any one; a rank can also be given by hand alone.
 */
export default function LevelsTab({ levels, busy, onChange, onSave }: { levels: UserLevel[]; busy: boolean; onChange: (levels: UserLevel[]) => void; onSave: () => void }) {
  const set = (index: number, patch: Partial<UserLevel>) => onChange(levels.map((level, at) => (at === index ? { ...level, ...patch } : level)))
  const move = (index: number, delta: number) => { const to = index + delta; if (to < 0 || to >= levels.length) return; const next = [...levels]; const [item] = next.splice(index, 1); next.splice(to, 0, item); onChange(next) }
  const named = levels.filter((item) => item.name.trim())
  return <section className="xm-section">
    <h2>مقام‌های کاربری</h2>
    <p className="muted">هر کاربر <b>آخرین</b> مقامی از این فهرست را می‌گیرد که شرط‌هایش را داشته باشد، پس مقام‌ها را از ساده به سخت بچینید. مقام خودکار حساب می‌شود و با فعالیت کاربر بالا می‌رود. برای تغییر دستی مقام یک کاربر، به زبانهٔ «کاربران» بروید. مقام فقط جایگاه کاربر را نشان می‌دهد و دسترسی نمی‌دهد.</p>
    <div className="lv-list">
      {levels.map((level, index) => <div key={level.id} className="card lv-row" style={{ ['--lv' as string]: level.color }}>
        <div className="lv-head">
          <span className="lv-chip"><i aria-hidden="true">{level.icon}</i>{level.name || 'بدون نام'}</span>
          <div className="lv-tools">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`بالاتر بردن ${level.name}`}>↑</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(index, 1)} disabled={index === levels.length - 1} aria-label={`پایین‌تر بردن ${level.name}`}>↓</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(levels.filter((_, at) => at !== index))}>حذف</button>
          </div>
        </div>
        <div className="lv-identity">
          <label className="studio-field"><span>نام مقام</span><input className="input" value={level.name} maxLength={40} onChange={(e) => set(index, { name: e.target.value })} placeholder="مثلاً: کاربر باتجربه" /></label>
          <label className="studio-field"><span>آیکون</span><input className="input" value={level.icon} maxLength={8} onChange={(e) => set(index, { icon: e.target.value })} /></label>
          <label className="studio-field"><span>رنگ</span><input type="color" value={level.color} onChange={(e) => set(index, { color: e.target.value })} /></label>
          <label className="studio-field"><span>چطور داده شود</span><select className="input" value={level.manualOnly ? 'MANUAL' : level.match} onChange={(e) => set(index, e.target.value === 'MANUAL' ? { manualOnly: true } : { manualOnly: false, match: e.target.value as UserLevel['match'] })}>
            <option value="ALL">با داشتن همهٔ شرط‌ها</option>
            <option value="ANY">با داشتن یکی از شرط‌ها</option>
            <option value="MANUAL">فقط دستی</option>
          </select></label>
        </div>
        {level.manualOnly
          ? <p className="muted lv-note">این مقام خودکار به کسی داده نمی‌شود؛ مدیر آن را از زبانهٔ «کاربران» می‌دهد.</p>
          : <div className="lv-conditions" role="group" aria-label={`شرط‌های ${level.name || 'این مقام'}`}>
            {LEVEL_CONDITIONS.map(({ min, label }) => <label key={min} className="studio-field"><span>حداقل {label}</span><input className="input" dir="ltr" inputMode="numeric" value={level[min]} onChange={(e) => set(index, { [min]: num(e.target.value) })} /></label>)}
          </div>}
      </div>)}
      {!levels.length && <p className="card muted">مقامی تعریف نشده است؛ زیر نام کاربران فقط گروهشان نشان داده می‌شود.</p>}
    </div>
    <div className="fr-admin-actions">
      <button type="button" className="btn btn-ghost btn-sm" disabled={levels.length >= 20} onClick={() => onChange([...levels, { ...NEW_RANK, id: `level${Date.now().toString(36)}`, name: '' }])}>افزودن مقام</button>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || levels.some((level) => !level.name.trim())} onClick={onSave}>ذخیرهٔ مقام‌ها</button>
    </div>
    <div className="card lv-preview">
      <b>نمونه: کاربری با این آمار چه مقامی می‌گیرد؟</b>
      <ul>{SAMPLES.map((sample) => { const level = levelFor(named, { ...sample, reputation: sample.likes }); return <li key={sample.posts}><span>{fa(sample.posts)} پیام و {fa(sample.likes)} لایک</span>{level ? <span className="lv-chip" style={{ ['--lv' as string]: level.color }}><i aria-hidden="true">{level.icon}</i>{level.name}</span> : <span className="muted">بدون مقام</span>}</li> })}</ul>
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
