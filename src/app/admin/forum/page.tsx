'use client'
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import TeamTab from './TeamTab'
import { categoryTree } from '@/modules/forum/domain/tree'
import { useSearchParams } from '@/platform/routing/navigation'
import Link from '@/components/AppLink'
import ForumDashboard from './ForumDashboard'
import LevelsTab from './LevelsTab'
import CategoriesTab from './CategoriesTab'
import GroupsTab from './GroupsTab'
import BadgesTab from './BadgesTab'
import UsersTab from './UsersTab'
import { date, fa, type Data, type Settings, type Trust } from './shared'
import { ReviewQueue } from '@/components/forum/Messages'

type Tab = 'dashboard' | 'review' | 'flags' | 'categories' | 'team' | 'groups' | 'levels' | 'badges' | 'users' | 'words' | 'settings'
const TABS_ALL: Tab[] = ['dashboard', 'review', 'flags', 'categories', 'team', 'groups', 'levels', 'badges', 'users', 'words', 'settings']

const REACTIONS: Record<string, string> = { heart: '❤️', '+1': '👍', laughing: '😆', open_mouth: '😮', cry: '😢', clap: '👏', fire: '🔥', tada: '🎉', thinking: '🤔', eyes: '👀' }
const TRUST_FIELDS: { key: keyof Trust; label: string }[] = [{ key: 'daysVisited', label: 'روزهای بازدید' }, { key: 'topicsEntered', label: 'موضوع‌های خوانده‌شده' }, { key: 'postCount', label: 'پیام' }, { key: 'likesGiven', label: 'پسند داده' }, { key: 'likesReceived', label: 'پسند گرفته' }]

/**
 * Forum administration in the shared section-admin frame: each tab is an address (`?tab=`), so the admin menu,
 * the staff queue and the back button land on it. Moderation (review, flags), structure (categories, team),
 * people (groups, levels, badges, members) and rules (watched words, settings).
 */
function AdminForumPage() {
  const [data, setData] = useState<Data | null>(null)
  const search = useSearchParams()
  const wanted = search.get('tab') as Tab | null
  const tab: Tab = wanted && TABS_ALL.includes(wanted) ? wanted : 'dashboard'
  const [review, setReview] = useState<unknown[] | null>(null)
  const [words, setWords] = useState<{ block: string; approve: string; censor: string } | null>(null)
  // A notice belongs to the tab it was given on; switching tabs leaves it behind.
  const [message, setMessage] = useState<{ text: string; error: boolean; tab?: Tab } | null>(null)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [revision, setRevision] = useState(0)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/forum', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok && body) { setData(body); setSettings(body.settings) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (tab !== 'review') return
    fetch('/api/admin/forum?section=review', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { items: [] })).then((body) => setReview(body.items || [])).catch(() => setReview([]))
  }, [tab])

  async function call(method: string, body?: Record<string, unknown>, success = 'ذخیره شد', url = '/api/admin/forum') {
    setBusy(true); setMessage(null)
    const settingsWrite = method === 'PATCH' && body?.section === 'settings'
    const patch = settingsWrite && data && body?.settings && typeof body.settings === 'object' ? { ...body, settings: Object.fromEntries(Object.entries(body.settings).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(data.settings[key as keyof Settings]))) } : body
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(settingsWrite && data?.settingsRevision ? { 'if-match': data.settingsRevision } : {}) }, body: patch ? JSON.stringify(patch) : undefined }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true, tab }); return false }
    setMessage({ text: success, error: false, tab })
    await load()
    setRevision((n) => n + 1)
    return true
  }
  const remove = (section: string, id: number, label: string, warning?: string) => { if (window.confirm(`«${label}» حذف شود؟${warning ? `\n${warning}` : ''}`)) void call('DELETE', undefined, 'حذف شد', `/api/admin/forum?section=${section}&id=${id}`) }

  if (!data || !settings) return <div className="sa fa-admin" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="sa-empty">در حال بارگذاری…</div>}</div>

  const tree = categoryTree(data.categories)
  const tabs: { key: Tab; label: string; count?: number; alert?: boolean }[] = [
    { key: 'dashboard', label: 'داشبورد' }, { key: 'review', label: 'صف بررسی', count: data.stats.pendingReview, alert: true },
    { key: 'flags', label: 'گزارش‌ها', count: data.stats.pendingFlags, alert: true }, { key: 'categories', label: 'دسته‌ها', count: data.categories.filter((c) => !c.club).length }, { key: 'team', label: 'تیم تالار', count: data.team.deputies.length + data.team.moderators.length },
    { key: 'groups', label: 'گروه‌ها', count: data.groups.length }, { key: 'levels', label: 'درجه‌های کاربری', count: settings.levels?.length || 0 }, { key: 'badges', label: 'نشان‌ها', count: data.badges.length },
    { key: 'users', label: 'کاربران' }, { key: 'words', label: 'واژه‌های تحت نظر' }, { key: 'settings', label: 'تنظیمات' },
  ]
  const wordLists = words || { block: settings.watchedWords.block.join('\n'), approve: settings.watchedWords.approve.join('\n'), censor: settings.watchedWords.censor.join('\n') }
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const reactionsOn = new Set(settings.reactions)
  const reasonLabel = new Map(data.flagReasons.map((reason) => [reason.id, reason.label]))

  return <div className="sa fa-admin" dir="rtl">
    <nav className="sa-tabs" aria-label="بخش‌های مدیریت تالار">
      {tabs.map((item) => <Link key={item.key} href={item.key === 'dashboard' ? '/admin/forum' : `/admin/forum?tab=${item.key}`} className={tab === item.key ? 'is-active' : ''} aria-current={tab === item.key ? 'page' : undefined}>
        {item.label}{item.count !== undefined && <span className={`fa-tab-count${item.alert && item.count > 0 ? ' is-alert' : ''}`}>{fa(item.count)}</span>}
      </Link>)}
    </nav>
    <header className="sa-head">
      <div><h1>تالار گفتمان</h1><p className="sa-sub">{fa(data.stats.topics)} موضوع · {fa(data.stats.posts)} پیام · {fa(data.stats.members)} عضو فعال</p></div>
      <div className="sa-head-actions"><Link href="/admin/history?type=settings-forum&id=1" className="btn btn-ghost btn-sm">تاریخچهٔ تنظیمات</Link><Link href="/forum" className="btn btn-ghost btn-sm" target="_blank">مشاهدهٔ تالار ↗</Link></div>
    </header>
    {message && (!message.tab || message.tab === tab) && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    {tab === 'dashboard' && <ForumDashboard />}

    {tab === 'review' && <Card title="صف بررسی پیش از انتشار" hint="پیام‌های کاربران تازه‌وارد (طبق تنظیمات) و پیام‌های دارای «واژه‌های نیازمند تأیید» اینجا منتظر می‌مانند. تأیید، پیام را منتشر و به دنبال‌کنندگان اعلان می‌دهد.">
      {review === null ? <div className="sa-empty">در حال بارگذاری…</div> : <ReviewQueue items={review as never} />}
    </Card>}

    {tab === 'flags' && <Card title="صف بررسی گزارش‌ها" hint="پیام‌های گزارش‌شده با مجموع وزن گزارش‌ها؛ قدیمی‌ترین بالا.">
      <div className="fa-list">
        {data.flags.map((entry) => <article key={entry.post.id} className="card fa-flag">
          <header>
            <div><Link href={`/forum/t/${entry.post.thread.id}?post=${entry.post.number}`} target="_blank"><b>{entry.post.thread.title}</b></Link> <small className="muted">پیام #{fa(entry.post.number)} از <bdi>@{entry.author.username}</bdi>{entry.post.status !== 'VISIBLE' ? ' · به‌طور خودکار پنهان شده' : ''}</small></div>
            <span className="badge">وزن {fa(entry.weight)}</span>
          </header>
          <p className="fa-excerpt" dir="auto">{entry.post.excerpt}</p>
          <ul className="fa-reasons">{entry.flags.map((flag) => <li key={`${flag.by.id}-${flag.createdAt}`}><b>{reasonLabel.get(flag.reason) || flag.reason}</b> — <bdi>@{flag.by.username}</bdi> · {date(flag.createdAt)}{flag.note && <> · «{flag.note}»</>}</li>)}</ul>
          <div className="fa-inline fa-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void call('POST', { section: 'flags', postId: entry.post.id, action: 'agree' }, 'گزارش تأیید و پیام پنهان شد')}>تأیید و پنهان‌کردن</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { section: 'flags', postId: entry.post.id, action: 'disagree' }, 'گزارش رد شد و پیام نمایش داده می‌شود')}>رد گزارش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm('پیام حذف شود؟')) void call('POST', { section: 'flags', postId: entry.post.id, action: 'delete' }, 'پیام حذف شد') }}>حذف پیام</button>
          </div>
        </article>)}
        {!data.flags.length && <div className="sa-empty">گزارشی در انتظار بررسی نیست ✓</div>}
      </div>
    </Card>}

    {tab === 'categories' && <CategoriesTab categories={data.categories} groups={data.groups} busy={busy} call={call} remove={remove} />}

    {tab === 'team' && <TeamTab team={data.team} forums={tree.filter((row) => !row.category.club).map((row) => ({ id: row.category.id, title: row.category.title, depth: row.depth }))} busy={busy} call={call} />}

    {tab === 'groups' && <GroupsTab groups={data.groups} busy={busy} call={call} remove={remove} />}

    {tab === 'levels' && <LevelsTab levels={settings.levels || []} busy={busy} onChange={(levels) => set({ levels })} onSave={() => void call('PATCH', { section: 'settings', settings }, 'درجه‌ها ذخیره شد')} />}

    {tab === 'badges' && <BadgesTab badges={data.badges} rules={data.badgeRules} busy={busy} call={call} remove={remove} />}

    {tab === 'users' && <UsersTab trustNames={data.trustNames} busy={busy} call={call} revision={revision} />}

    {tab === 'words' && <Card title="واژه‌های تحت نظر" hint={<>هر واژه یا عبارت در یک خط. تطبیق بر اساس کل واژه است (مثلاً «کار» با «کارت» یکی نیست) و * یعنی هر ادامه‌ای (مثلاً <code>قمار*</code>). برای ناظران اعمال نمی‌شود.</>}>
      <form className="fr-admin-form fa-panel" onSubmit={(event) => { event.preventDefault(); const split = (v: string) => v.split('\n').map((w) => w.trim()).filter(Boolean); void call('PATCH', { section: 'settings', settings: { ...settings, watchedWords: { block: split(wordLists.block), approve: split(wordLists.approve), censor: split(wordLists.censor) } } }, 'واژه‌ها ذخیره شد').then((ok) => { if (ok) setWords(null) }) }}>
        {([['block', '⛔ مسدود', 'پیام شامل این واژه‌ها ارسال نمی‌شود و نویسنده باید متن را اصلاح کند.'], ['approve', '⚖ نیازمند تأیید', 'پیام ارسال می‌شود ولی تا تأیید ناظر در صف بررسی می‌ماند.'], ['censor', '■ سانسور', 'پیام منتشر می‌شود ولی این واژه‌ها هنگام نمایش با ■ پوشانده می‌شوند.']] as const).map(([key, label, hint]) => <label key={key} className="fr-admin-wide fd-words">
          <span><b>{label}</b><small className="muted">{hint}</small></span>
          <textarea className="textarea" rows={6} dir="auto" value={wordLists[key]} onChange={(e) => setWords({ ...wordLists, [key]: e.target.value })} />
          <small className="muted">{fa(wordLists[key].split('\n').filter((w) => w.trim()).length)} مورد (حداکثر ۲۰۰)</small>
        </label>)}
        <div className="fr-admin-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ واژه‌ها</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setWords(null)}>بازگردانی</button></div>
      </form>
    </Card>}

    {tab === 'settings' && <Card title="تنظیمات تالار" hint="قواعد ارسال، کلوب‌ها، پیام خصوصی، واکنش‌ها و ارتقای خودکار سطح اعتماد. هر ذخیره در «تاریخچهٔ تنظیمات» ثبت می‌شود.">
      <form className="fa-settings" onSubmit={(event) => { event.preventDefault(); void call('PATCH', { section: 'settings', settings }, 'تنظیمات ذخیره شد') }}>
        <Group title="ارسال و تازه‌واردها">
          <Num label="سطح لازم برای درج تصویر" value={settings.imagesMinTrust} max={4} onChange={(v) => set({ imagesMinTrust: v })} />
          <Num label="سطح لازم برای پیوند نامحدود" value={settings.linksMinTrust} max={4} onChange={(v) => set({ linksMinTrust: v })} />
          <Num label="حداکثر پیوند کاربر تازه‌وارد" value={settings.newUserMaxLinks} max={50} onChange={(v) => set({ newUserMaxLinks: v })} />
          <Num label="موضوع روزانهٔ تازه‌واردها" value={settings.newUserTopicsPerDay} max={100} onChange={(v) => set({ newUserTopicsPerDay: v })} />
          <Num label="پیام‌های نخست تازه‌واردها که نیاز به تأیید دارند (۰ = خاموش)" value={settings.approveNewUserPosts} max={20} onChange={(v) => set({ approveNewUserPosts: v })} />
          <Num label="مهلت ویرایش (ساعت)" value={settings.editWindowHours} max={8760} onChange={(v) => set({ editWindowHours: v })} />
          <Num label="سطح لازم برای ساخت نظرسنجی" value={settings.pollsMinTrust} max={4} onChange={(v) => set({ pollsMinTrust: v })} />
        </Group>
        <Group title="گزارش‌ها و برچسب‌ها">
          <Num label="وزن گزارش برای پنهان‌سازی خودکار" value={settings.flagHideWeight} min={1} max={100} onChange={(v) => set({ flagHideWeight: v })} />
          <Num label="حداکثر برچسب هر موضوع" value={settings.maxTagsPerTopic} max={10} onChange={(v) => set({ maxTagsPerTopic: v })} />
          <label className="studio-switch"><input type="checkbox" checked={settings.membersCreateTags} onChange={(e) => set({ membersCreateTags: e.target.checked })} />کاربران (سطح ۲ به بالا) برچسب تازه بسازند</label>
        </Group>
        <Group title="کلوب‌ها">
          <label className="studio-switch"><input type="checkbox" checked={settings.clubsEnabled} onChange={(e) => set({ clubsEnabled: e.target.checked })} />اعضا بتوانند کلوب بسازند</label>
          <Num label="حداقل سطح اعتماد برای ساخت کلوب" value={settings.clubsMinTrust} max={4} onChange={(v) => set({ clubsMinTrust: v })} />
          <Num label="حداکثر کلوب برای هر بنیان‌گذار" value={settings.clubsMaxOwned} min={1} max={20} onChange={(v) => set({ clubsMaxOwned: v })} />
        </Group>
        <Group title="پیام خصوصی">
          <label className="studio-switch"><input type="checkbox" checked={settings.messagesEnabled} onChange={(e) => set({ messagesEnabled: e.target.checked })} />پیام خصوصی بین اعضا فعال باشد</label>
          <Num label="سطح لازم برای شروع پیام خصوصی" value={settings.messagesMinTrust} max={4} onChange={(v) => set({ messagesMinTrust: v })} />
        </Group>
        <Group title="واکنش‌ها" hint="هر واکنش به نویسندهٔ پیام همین‌قدر اعتبار می‌دهد (صفر یعنی هیچ). با تغییر وزن، اعتبار همهٔ اعضا از روی همهٔ واکنش‌های ثبت‌شده، از اول تا امروز، دوباره حساب می‌شود.">
          {Object.entries(REACTIONS).map(([key, emoji]) => <div key={key} className="fa-reaction">
            <label className="studio-switch"><input type="checkbox" checked={reactionsOn.has(key)} onChange={(e) => set({ reactions: e.target.checked ? [...settings.reactions, key] : settings.reactions.filter((r) => r !== key) })} aria-label={`واکنش ${key} مجاز باشد`} /><span aria-hidden="true">{emoji}</span></label>
            <input className="input num" type="number" min={0} max={10} aria-label={`وزن ${key}`} value={settings.reactionWeights?.[key] ?? 1} onChange={(e) => set({ reactionWeights: { ...settings.reactionWeights, [key]: Math.max(0, Math.min(10, Math.trunc(Number(e.target.value)) || 0)) } })} />
          </div>)}
        </Group>
        {(['1', '2', '3'] as const).map((level) => <Group key={level} title={`ارتقا به سطح ${fa(Number(level))} — ${data.trustNames[Number(level)]}`}>
          {TRUST_FIELDS.map((field) => <Num key={field.key} label={field.label} value={settings.trust[level][field.key]} max={100000} onChange={(v) => set({ trust: { ...settings.trust, [level]: { ...settings.trust[level], [field.key]: v } } })} />)}
        </Group>)}
        <p className="sa-sub">سطح ۴ (رهبر جامعه) فقط به‌صورت دستی از بخش کاربران اعطا می‌شود. سطح‌ها هرگز به‌طور خودکار کاهش نمی‌یابند.</p>
        <div className="fr-admin-actions fa-settings-actions"><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ تنظیمات</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings(data.settings)}>بازگردانی</button></div>
      </form>
    </Card>}
  </div>
}

function Card({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return <section className="sa-card"><div className="sa-card-head"><div><h2>{title}</h2>{hint && <small>{hint}</small>}</div></div>{children}</section>
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <fieldset className="fa-perms fa-settings-group"><legend>{title}</legend><div className="fa-settings-fields">{children}</div>{hint && <small className="muted">{hint}</small>}</fieldset>
}

function Num({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max: number }) {
  return <label className="studio-field"><span>{label}</span><input className="input" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} /></label>
}

export default function ForumAdminPage() {
  return <Suspense fallback={null}><AdminForumPage /></Suspense>
}
