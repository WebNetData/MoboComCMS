'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from '@/platform/routing/navigation'
import Link from '@/components/AppLink'
import ForumDashboard from './ForumDashboard'
import { ReviewQueue } from '@/components/forum/Messages'

type Level = 'SEE' | 'REPLY' | 'CREATE'
type Category = { id: number; parentId: number | null; slug: string; title: string; description: string; icon: string; color: string; access: string; locked: boolean; sortOrder: number; threadCount: number; postCount: number; permissions: { groupId: number; level: Level }[] }
type Group = { id: number; slug: string; name: string; description: string; icon: string; color: string; title: string; automatic: string | null; visibility: string; joinMode: string; moderator: boolean; mentionable: boolean; memberCount: number }
type Badge = { id: number; slug: string; name: string; description: string; icon: string; tier: string; rule: string; enabled: boolean; grantCount: number }
type Author = { id: number; name: string; username: string }
type Flag = { post: { id: number; number: number; excerpt: string; status: string; createdAt: string; thread: { id: number; title: string } }; author: Author; weight: number; flags: { reason: string; note: string; weight: number; createdAt: string; by: Author }[] }
type Trust = { daysVisited: number; topicsEntered: number; postCount: number; likesGiven: number; likesReceived: number }
type Settings = { imagesMinTrust: number; linksMinTrust: number; newUserMaxLinks: number; newUserTopicsPerDay: number; editWindowHours: number; flagHideWeight: number; maxTagsPerTopic: number; membersCreateTags: boolean; reactions: string[]; trust: Record<'1' | '2' | '3', Trust>
  approveNewUserPosts: number; messagesEnabled: boolean; messagesMinTrust: number; pollsMinTrust: number; watchedWords: { block: string[]; approve: string[]; censor: string[] } }
type Member = { userId: number; username: string; email: string; name: string; trustLevel: number; trustLocked: boolean; title: string; postCount: number; likesReceived: number; lastSeenAt: string | null; silencedUntil: string | null; suspendedUntil: string | null; moderationNote: string; groups: string[] }
type Data = { categories: Category[]; groups: Group[]; badges: Badge[]; flags: Flag[]; settings: Settings; badgeRules: string[]; trustNames: string[]; flagReasons: { id: string; label: string }[]; stats: { topics: number; posts: number; members: number; pendingFlags: number; pendingReview: number } }
type Tab = 'dashboard' | 'review' | 'flags' | 'categories' | 'groups' | 'badges' | 'users' | 'words' | 'settings'
const TABS_ALL: Tab[] = ['dashboard', 'review', 'flags', 'categories', 'groups', 'badges', 'users', 'words', 'settings']

const EMPTY_CATEGORY = { id: 0, parentId: 0, slug: '', title: '', description: '', icon: '💬', color: '#6366f1', access: 'PUBLIC', locked: false, sortOrder: 0, permissions: [] as { groupId: number; level: Level }[] }
const EMPTY_GROUP = { id: 0, slug: '', name: '', description: '', icon: '👥', color: '#0ea5e9', title: '', visibility: 'PUBLIC', joinMode: 'CLOSED', moderator: false, mentionable: false, automatic: null as string | null }
const EMPTY_BADGE = { id: 0, slug: '', name: '', description: '', icon: '🏅', tier: 'BRONZE', rule: '', enabled: true }
const LEVEL_LABEL: Record<Level, string> = { SEE: 'فقط دیدن', REPLY: 'دیدن و پاسخ', CREATE: 'دسترسی کامل' }
const TIER_LABEL: Record<string, string> = { BRONZE: '🥉 برنزی', SILVER: '🥈 نقره‌ای', GOLD: '🥇 طلایی' }
const REACTIONS: Record<string, string> = { heart: '❤️', '+1': '👍', laughing: '😆', open_mouth: '😮', cry: '😢', clap: '👏', fire: '🔥', tada: '🎉', thinking: '🤔', eyes: '👀' }
const TRUST_FIELDS: { key: keyof Trust; label: string }[] = [{ key: 'daysVisited', label: 'روزهای بازدید' }, { key: 'topicsEntered', label: 'موضوع‌های خوانده‌شده' }, { key: 'postCount', label: 'پیام' }, { key: 'likesGiven', label: 'پسند داده' }, { key: 'likesReceived', label: 'پسند گرفته' }]
const fa = (n: number) => n.toLocaleString('fa-IR')
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('fa-IR') : '')

/** Forum administration: flag queue, categories + group permissions, groups, badges, members and settings. */
function AdminForumPage() {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const search = useSearchParams()
  // Deep links from the forum menu in the admin sidebar (?tab=review …).
  useEffect(() => {
    const wanted = search.get('tab') as Tab | null
    if (wanted === 'review') fetch('/api/admin/forum?section=review', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { items: [] })).then((body) => setReview(body.items || [])).catch(() => setReview([]))
    if (wanted && TABS_ALL.includes(wanted)) setTab(wanted)
    else if (!wanted) setTab('dashboard')
  }, [search])
  const [review, setReview] = useState<unknown[] | null>(null)
  const [words, setWords] = useState<{ block: string; approve: string; censor: string } | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState(EMPTY_CATEGORY)
  const [group, setGroup] = useState(EMPTY_GROUP)
  const [badge, setBadge] = useState(EMPTY_BADGE)
  const [grant, setGrant] = useState({ username: '', badgeId: 0, reason: '' })
  const [member, setMember] = useState({ slug: '', username: '' })
  const [settings, setSettings] = useState<Settings | null>(null)
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<Member[]>([])

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/forum', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok && body) { setData(body); setSettings(body.settings) }
    else setMessage({ text: body?.error || 'دریافت اطلاعات ناموفق بود', error: true })
  }, [])
  const loadMembers = useCallback(async (q: string) => {
    const response = await fetch(`/api/admin/forum?section=users&q=${encodeURIComponent(q)}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setMembers(body?.users || [])
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (tab !== 'users') return
    const timer = setTimeout(() => void loadMembers(query), 250)
    return () => clearTimeout(timer)
  }, [tab, query, loadMembers])

  async function call(method: string, body?: Record<string, unknown>, success = 'ذخیره شد', url = '/api/admin/forum') {
    setBusy(true); setMessage(null)
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: result?.error || 'انجام نشد', error: true }); return false }
    setMessage({ text: success, error: false })
    await load()
    if (tab === 'users') await loadMembers(query)
    return true
  }
  const remove = (section: string, id: number, label: string) => { if (window.confirm(`«${label}» حذف شود؟`)) void call('DELETE', undefined, 'حذف شد', `/api/admin/forum?section=${section}&id=${id}`) }

  if (!data || !settings) return <div className="xm-page" dir="rtl">{message ? <div className="xm-notice is-error" role="alert">{message.text}</div> : <div className="tb-empty">در حال بارگذاری…</div>}</div>

  const tops = data.categories.filter((c) => !c.parentId)
  const ordered = tops.flatMap((c) => [c, ...data.categories.filter((child) => child.parentId === c.id)])
  const groupName = (id: number) => data.groups.find((g) => g.id === id)
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'dashboard', label: 'داشبورد' }, { key: 'review', label: 'صف بررسی', count: data.stats.pendingReview },
    { key: 'flags', label: 'گزارش‌ها', count: data.stats.pendingFlags }, { key: 'categories', label: 'دسته‌ها', count: data.categories.length }, { key: 'groups', label: 'گروه‌ها', count: data.groups.length },
    { key: 'badges', label: 'نشان‌ها', count: data.badges.length }, { key: 'users', label: 'کاربران' }, { key: 'words', label: 'واژه‌های تحت نظر' }, { key: 'settings', label: 'تنظیمات' },
  ]
  const wordLists = words || { block: settings.watchedWords.block.join('\n'), approve: settings.watchedWords.approve.join('\n'), censor: settings.watchedWords.censor.join('\n') }
  const openReview = () => {
    fetch('/api/admin/forum?section=review', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { items: [] })).then((body) => setReview(body.items || [])).catch(() => setReview([]))
  }

  function setPermission(groupId: number, level: Level | '') {
    const rest = category.permissions.filter((row) => row.groupId !== groupId)
    setCategory({ ...category, permissions: level ? [...rest, { groupId, level }] : rest })
  }

  return <div className="xm-page" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">FORUM</span><h1>تالار گفتمان</h1>
      <p>{fa(data.stats.topics)} موضوع · {fa(data.stats.posts)} پیام · {fa(data.stats.members)} عضو فعال. دسته‌ها، سطح دسترسی گروه‌ها، نشان‌ها، سطح اعتماد کاربران و صف گزارش‌ها را از اینجا مدیریت کنید.</p></div>
      <Link href="/forum" className="btn btn-ghost btn-sm" target="_blank">مشاهدهٔ تالار ↗</Link>
    </header>
    <nav className="tb-tabs" role="tablist" aria-label="بخش‌های تالار">
      {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => { setTab(item.key); setMessage(null); if (item.key === 'review') openReview() }}>{item.label}{item.count !== undefined && <span>{fa(item.count)}</span>}</button>)}
    </nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    {tab === 'dashboard' && <ForumDashboard />}

    {tab === 'review' && <section className="xm-section">
      <h2>صف بررسی پیش از انتشار</h2>
      <p className="muted">پیام‌های کاربران تازه‌وارد (طبق تنظیمات) و پیام‌های دارای «واژه‌های نیازمند تأیید» اینجا منتظر می‌مانند. تأیید، پیام را منتشر و به دنبال‌کنندگان اعلان می‌دهد.</p>
      {review === null ? <div className="tb-empty">در حال بارگذاری…</div> : <ReviewQueue items={review as never} />}
    </section>}

    {tab === 'words' && <section className="xm-section">
      <h2>واژه‌های تحت نظر</h2>
      <p className="muted">هر واژه یا عبارت در یک خط. تطبیق بر اساس کل واژه است (مثلاً «کار» با «کارت» یکی نیست) و * یعنی هر ادامه‌ای (مثلاً <code>قمار*</code>). برای ناظران اعمال نمی‌شود.</p>
      <form className="card fr-admin-form" onSubmit={(event) => { event.preventDefault(); const split = (v: string) => v.split('\n').map((w) => w.trim()).filter(Boolean); void call('PATCH', { section: 'settings', settings: { ...settings, watchedWords: { block: split(wordLists.block), approve: split(wordLists.approve), censor: split(wordLists.censor) } } }, 'واژه‌ها ذخیره شد').then((ok) => { if (ok) setWords(null) }) }}>
        {([['block', '⛔ مسدود', 'پیام شامل این واژه‌ها ارسال نمی‌شود و نویسنده باید متن را اصلاح کند.'], ['approve', '⚖ نیازمند تأیید', 'پیام ارسال می‌شود ولی تا تأیید ناظر در صف بررسی می‌ماند.'], ['censor', '■ سانسور', 'پیام منتشر می‌شود ولی این واژه‌ها هنگام نمایش با ■ پوشانده می‌شوند.']] as const).map(([key, label, hint]) => <label key={key} className="fr-admin-wide fd-words">
          <span><b>{label}</b><small className="muted">{hint}</small></span>
          <textarea className="textarea" rows={6} dir="auto" value={wordLists[key]} onChange={(e) => setWords({ ...wordLists, [key]: e.target.value })} />
          <small className="muted">{fa(wordLists[key].split('\n').filter((w) => w.trim()).length)} مورد (حداکثر ۲۰۰)</small>
        </label>)}
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ واژه‌ها</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setWords(null)}>بازگردانی</button></div>
      </form>
    </section>}

    {tab === 'flags' && <section className="xm-section">
      <h2>صف بررسی گزارش‌ها</h2>
      <div className="fa-list">
        {data.flags.map((entry) => <article key={entry.post.id} className="card fa-flag">
          <header>
            <div><Link href={`/forum/t/${entry.post.thread.id}?post=${entry.post.number}`} target="_blank"><b>{entry.post.thread.title}</b></Link> <small className="muted">پیام #{fa(entry.post.number)} از <bdi>@{entry.author.username}</bdi>{entry.post.status !== 'VISIBLE' ? ' · به‌طور خودکار پنهان شده' : ''}</small></div>
            <span className="badge">وزن {fa(entry.weight)}</span>
          </header>
          <p className="fa-excerpt" dir="auto">{entry.post.excerpt}</p>
          <ul className="fa-reasons">{entry.flags.map((flag, index) => <li key={index}><b>{data.flagReasons.find((r) => r.id === flag.reason)?.label || flag.reason}</b> — <bdi>@{flag.by.username}</bdi> · {date(flag.createdAt)}{flag.note && <> · «{flag.note}»</>}</li>)}</ul>
          <div className="fa-inline fa-wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void call('POST', { section: 'flags', postId: entry.post.id, action: 'agree' }, 'گزارش تأیید و پیام پنهان شد')}>تأیید و پنهان‌کردن</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void call('POST', { section: 'flags', postId: entry.post.id, action: 'disagree' }, 'گزارش رد شد و پیام نمایش داده می‌شود')}>رد گزارش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (window.confirm('پیام حذف شود؟')) void call('POST', { section: 'flags', postId: entry.post.id, action: 'delete' }, 'پیام حذف شد') }}>حذف پیام</button>
          </div>
        </article>)}
        {!data.flags.length && <div className="tb-empty">گزارشی در انتظار بررسی نیست ✓</div>}
      </div>
    </section>}

    {tab === 'categories' && <section className="xm-section">
      <h2>{category.id ? `ویرایش «${category.title}»` : 'دستهٔ تازه'}</h2>
      <form className="card fr-admin-form" onSubmit={async (event) => { event.preventDefault(); if (await call(category.id ? 'PATCH' : 'POST', { section: 'categories', ...category }, category.id ? 'دسته به‌روز شد' : 'دسته ساخته شد')) setCategory(EMPTY_CATEGORY) }}>
        <label className="studio-field"><span>عنوان</span><input className="input" value={category.title} onChange={(e) => setCategory({ ...category, title: e.target.value })} required maxLength={120} /></label>
        <label className="studio-field"><span>نشانی (انگلیسی)</span><input className="input" dir="ltr" value={category.slug} onChange={(e) => setCategory({ ...category, slug: e.target.value })} placeholder="general" maxLength={60} /></label>
        <label className="studio-field"><span>دستهٔ والد</span><select className="input" value={category.parentId || 0} onChange={(e) => setCategory({ ...category, parentId: Number(e.target.value) })}><option value={0}>— دستهٔ اصلی —</option>{tops.filter((c) => c.id !== category.id).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label className="studio-field"><span>آیکون و رنگ</span><div className="fa-inline"><input className="input" value={category.icon} onChange={(e) => setCategory({ ...category, icon: e.target.value })} maxLength={8} aria-label="آیکون" /><input type="color" value={category.color} onChange={(e) => setCategory({ ...category, color: e.target.value })} aria-label="رنگ" /></div></label>
        <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={category.description} onChange={(e) => setCategory({ ...category, description: e.target.value })} maxLength={400} /></label>
        <label className="studio-field"><span>ترتیب</span><input className="input" type="number" value={category.sortOrder} onChange={(e) => setCategory({ ...category, sortOrder: Number(e.target.value) })} /></label>
        <fieldset className="fa-perms fr-admin-wide">
          <legend>دسترسی گروه‌ها</legend>
          <small className="muted">اگر هیچ گروهی تنظیم نشود، دسترسی ساده اعمال می‌شود: {category.access === 'MEMBERS' ? 'فقط VIP' : 'همه'}{category.locked ? '، ساخت موضوع فقط برای تیم' : ''}. با افزودن ردیف، فقط گروه‌های فهرست‌شده به این دسته دسترسی دارند (تیم مدیریت همیشه دسترسی کامل دارد).</small>
          {!category.permissions.length && <div className="fa-inline fa-wrap">
            <label className="studio-field"><span>دسترسی ساده</span><select className="input" value={category.access} onChange={(e) => setCategory({ ...category, access: e.target.value })}><option value="PUBLIC">همه</option><option value="MEMBERS">فقط اعضای VIP</option></select></label>
            <label className="studio-switch"><input type="checkbox" checked={category.locked} onChange={(e) => setCategory({ ...category, locked: e.target.checked })} />فقط تیم موضوع بسازد (اطلاعیه‌ها)</label>
          </div>}
          {category.permissions.map((row) => <div key={row.groupId} className="fa-inline">
            <span className="fa-grow">{groupName(row.groupId)?.icon} {groupName(row.groupId)?.name || `#${row.groupId}`}</span>
            <select className="input" value={row.level} onChange={(e) => setPermission(row.groupId, e.target.value as Level)} aria-label="سطح دسترسی">{(Object.keys(LEVEL_LABEL) as Level[]).map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}</select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPermission(row.groupId, '')} aria-label="حذف ردیف">✕</button>
          </div>)}
          <select className="input" value="" onChange={(e) => { if (e.target.value) setPermission(Number(e.target.value), 'CREATE') }} aria-label="افزودن گروه">
            <option value="">+ افزودن گروه…</option>
            {data.groups.filter((g) => !category.permissions.some((row) => row.groupId === g.id)).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
          </select>
        </fieldset>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{category.id ? 'ذخیرهٔ تغییرات' : 'افزودن دسته'}</button>{category.id > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCategory(EMPTY_CATEGORY)}>انصراف</button>}</div>
      </form>
      <div className="table-wrap card"><table className="table"><thead><tr><th>دسته</th><th>دسترسی</th><th>موضوع</th><th>پیام</th><th /></tr></thead><tbody>
        {ordered.map((c) => <tr key={c.id}>
          <td><div className="fa-cat" style={{ borderColor: c.color, marginInlineStart: c.parentId ? 18 : 0 }}><b>{c.icon} {c.title}</b><small className="muted" dir="ltr">/forum/c/{c.slug}</small></div></td>
          <td><div className="fa-perm-cell">{c.permissions.length ? c.permissions.map((row) => <span key={row.groupId} className="badge">{groupName(row.groupId)?.name}: {LEVEL_LABEL[row.level]}</span>) : <span className="badge">{c.access === 'MEMBERS' ? '♛ VIP' : 'همه'}{c.locked ? ' · اطلاعیه' : ''}</span>}</div></td>
          <td>{fa(c.threadCount)}</td><td>{fa(c.postCount)}</td>
          <td className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCategory({ id: c.id, parentId: c.parentId || 0, slug: c.slug, title: c.title, description: c.description, icon: c.icon, color: c.color, access: c.access, locked: c.locked, sortOrder: c.sortOrder, permissions: c.permissions.map((row) => ({ groupId: row.groupId, level: row.level })) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>ویرایش</button>
            <Link className="btn btn-ghost btn-sm" href={`/forum/c/${c.slug}`} target="_blank">مشاهده ↗</Link>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove('categories', c.id, c.title)}>حذف</button>
          </td>
        </tr>)}
        {!ordered.length && <tr><td colSpan={5} className="muted">هنوز دسته‌ای ساخته نشده است.</td></tr>}
      </tbody></table></div>
    </section>}

    {tab === 'groups' && <section className="xm-section">
      <h2>{group.id ? `ویرایش گروه «${group.name}»` : 'گروه تازه'}</h2>
      <form className="card fr-admin-form" onSubmit={async (event) => { event.preventDefault(); if (await call(group.id ? 'PATCH' : 'POST', { section: 'groups', ...group }, group.id ? 'گروه به‌روز شد' : 'گروه ساخته شد')) setGroup(EMPTY_GROUP) }}>
        <label className="studio-field"><span>نام</span><input className="input" value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} required maxLength={60} /></label>
        <label className="studio-field"><span>نشانی (انگلیسی)</span><input className="input" dir="ltr" value={group.slug} onChange={(e) => setGroup({ ...group, slug: e.target.value })} disabled={!!group.automatic} maxLength={40} /></label>
        <label className="studio-field"><span>آیکون و رنگ</span><div className="fa-inline"><input className="input" value={group.icon} onChange={(e) => setGroup({ ...group, icon: e.target.value })} maxLength={8} aria-label="آیکون" /><input type="color" value={group.color} onChange={(e) => setGroup({ ...group, color: e.target.value })} aria-label="رنگ" /></div></label>
        <label className="studio-field"><span>عنوان اعضا</span><input className="input" value={group.title} onChange={(e) => setGroup({ ...group, title: e.target.value })} placeholder="مثلاً: متخصص شبکه" maxLength={40} /></label>
        <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={group.description} onChange={(e) => setGroup({ ...group, description: e.target.value })} maxLength={1000} /></label>
        {!group.automatic && <>
          <label className="studio-field"><span>نمایش</span><select className="input" value={group.visibility} onChange={(e) => setGroup({ ...group, visibility: e.target.value })}><option value="PUBLIC">عمومی</option><option value="MEMBERS">فقط اعضای گروه</option><option value="STAFF">فقط تیم</option></select></label>
          <label className="studio-field"><span>عضویت</span><select className="input" value={group.joinMode} onChange={(e) => setGroup({ ...group, joinMode: e.target.value })}><option value="OPEN">آزاد</option><option value="REQUEST">با درخواست</option><option value="CLOSED">فقط با دعوت مدیر</option></select></label>
          <label className="studio-switch"><input type="checkbox" checked={group.moderator} onChange={(e) => setGroup({ ...group, moderator: e.target.checked })} />اعضا ناظر تالار هستند</label>
          <label className="studio-switch"><input type="checkbox" checked={group.mentionable} onChange={(e) => setGroup({ ...group, mentionable: e.target.checked })} />قابل نام‌بردن با @</label>
        </>}
        {group.automatic && <p className="muted fr-admin-wide">این گروه خودکار است؛ عضویت آن بر اساس نقش یا سطح اعتماد تعیین می‌شود و فقط ظاهرش قابل تغییر است.</p>}
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{group.id ? 'ذخیرهٔ تغییرات' : 'افزودن گروه'}</button>{group.id > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGroup(EMPTY_GROUP)}>انصراف</button>}</div>
      </form>
      <form className="card fr-admin-form" onSubmit={async (event) => { event.preventDefault(); if (await call('POST', { section: 'members', action: 'add', ...member }, 'کاربر به گروه اضافه شد')) setMember({ ...member, username: '' }) }}>
        <label className="studio-field"><span>گروه</span><select className="input" value={member.slug} onChange={(e) => setMember({ ...member, slug: e.target.value })} required><option value="">انتخاب…</option>{data.groups.filter((g) => !g.automatic).map((g) => <option key={g.id} value={g.slug}>{g.icon} {g.name}</option>)}</select></label>
        <label className="studio-field"><span>نام کاربری</span><input className="input" dir="ltr" value={member.username} onChange={(e) => setMember({ ...member, username: e.target.value })} placeholder="@username" required /></label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>افزودن عضو</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !member.slug || !member.username} onClick={() => void call('POST', { section: 'members', action: 'remove', ...member }, 'کاربر از گروه حذف شد')}>حذف از گروه</button></div>
      </form>
      <div className="table-wrap card"><table className="table"><thead><tr><th>گروه</th><th>نوع</th><th>اعضا</th><th /></tr></thead><tbody>
        {data.groups.map((g) => <tr key={g.id}>
          <td><div className="fa-cat" style={{ borderColor: g.color }}><b>{g.icon} {g.name}</b><small className="muted" dir="ltr">@{g.slug}</small></div></td>
          <td>{g.automatic ? 'خودکار' : `${g.joinMode === 'OPEN' ? 'آزاد' : g.joinMode === 'REQUEST' ? 'با درخواست' : 'بسته'}${g.moderator ? ' · ناظر' : ''}`}</td>
          <td>{fa(g.memberCount)}</td>
          <td className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setGroup({ id: g.id, slug: g.slug, name: g.name, description: g.description, icon: g.icon, color: g.color, title: g.title, visibility: g.visibility, joinMode: g.joinMode, moderator: g.moderator, mentionable: g.mentionable, automatic: g.automatic }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>ویرایش</button>
            <Link className="btn btn-ghost btn-sm" href={`/forum/g/${g.slug}`} target="_blank">اعضا ↗</Link>
            {!g.automatic && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove('groups', g.id, g.name)}>حذف</button>}
          </td>
        </tr>)}
      </tbody></table></div>
    </section>}

    {tab === 'badges' && <section className="xm-section">
      <h2>{badge.id ? `ویرایش نشان «${badge.name}»` : 'نشان تازه'}</h2>
      <form className="card fr-admin-form" onSubmit={async (event) => { event.preventDefault(); if (await call(badge.id ? 'PATCH' : 'POST', { section: 'badges', ...badge }, badge.id ? 'نشان به‌روز شد' : 'نشان ساخته شد')) setBadge(EMPTY_BADGE) }}>
        <label className="studio-field"><span>نام</span><input className="input" value={badge.name} onChange={(e) => setBadge({ ...badge, name: e.target.value })} required maxLength={60} /></label>
        <label className="studio-field"><span>آیکون</span><input className="input" value={badge.icon} onChange={(e) => setBadge({ ...badge, icon: e.target.value })} maxLength={8} /></label>
        <label className="studio-field"><span>درجه</span><select className="input" value={badge.tier} onChange={(e) => setBadge({ ...badge, tier: e.target.value })}>{Object.entries(TIER_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="studio-field"><span>قاعدهٔ خودکار</span><select className="input" dir="ltr" value={badge.rule} onChange={(e) => setBadge({ ...badge, rule: e.target.value })}><option value="">— اعطای دستی —</option>{data.badgeRules.map((rule) => <option key={rule} value={rule}>{rule}</option>)}</select></label>
        <label className="studio-field fr-admin-wide"><span>توضیح</span><input className="input" value={badge.description} onChange={(e) => setBadge({ ...badge, description: e.target.value })} maxLength={300} /></label>
        <label className="studio-switch"><input type="checkbox" checked={badge.enabled} onChange={(e) => setBadge({ ...badge, enabled: e.target.checked })} />فعال</label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>{badge.id ? 'ذخیرهٔ تغییرات' : 'افزودن نشان'}</button>{badge.id > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBadge(EMPTY_BADGE)}>انصراف</button>}</div>
      </form>
      <form className="card fr-admin-form" onSubmit={async (event) => { event.preventDefault(); if (await call('POST', { section: 'grant', ...grant, grant: true }, 'نشان اعطا شد')) setGrant({ ...grant, username: '', reason: '' }) }}>
        <label className="studio-field"><span>نشان</span><select className="input" value={grant.badgeId} onChange={(e) => setGrant({ ...grant, badgeId: Number(e.target.value) })} required><option value={0}>انتخاب…</option>{data.badges.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}</select></label>
        <label className="studio-field"><span>نام کاربری</span><input className="input" dir="ltr" value={grant.username} onChange={(e) => setGrant({ ...grant, username: e.target.value })} placeholder="@username" required /></label>
        <label className="studio-field fr-admin-wide"><span>دلیل (اختیاری)</span><input className="input" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} maxLength={200} /></label>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy || !grant.badgeId}>اعطای نشان</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !grant.badgeId || !grant.username} onClick={() => void call('POST', { section: 'grant', ...grant, grant: false }, 'نشان پس گرفته شد')}>پس‌گرفتن</button></div>
      </form>
      <div className="table-wrap card"><table className="table"><thead><tr><th>نشان</th><th>درجه</th><th>قاعده</th><th>دریافت</th><th /></tr></thead><tbody>
        {data.badges.map((b) => <tr key={b.id} className={b.enabled ? '' : 'muted'}>
          <td><b>{b.icon} {b.name}</b><br /><small className="muted">{b.description}</small></td>
          <td>{TIER_LABEL[b.tier] || b.tier}</td><td dir="ltr">{b.rule || 'دستی'}</td><td>{fa(b.grantCount)}</td>
          <td className="fr-admin-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBadge({ id: b.id, slug: b.slug, name: b.name, description: b.description, icon: b.icon, tier: b.tier, rule: b.rule, enabled: b.enabled }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>ویرایش</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => remove('badges', b.id, b.name)}>حذف</button>
          </td>
        </tr>)}
      </tbody></table></div>
    </section>}

    {tab === 'users' && <section className="xm-section">
      <h2>کاربران تالار</h2>
      <input className="input fa-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی نام، ایمیل یا @نام‌کاربری" aria-label="جست‌وجوی کاربر" />
      <div className="fa-list">
        {members.map((user) => <UserModeration key={user.userId} user={user} trustNames={data.trustNames} busy={busy} onSave={(patch, success) => void call('PATCH', { section: 'users', userId: user.userId, ...patch }, success)} />)}
        {!members.length && <div className="tb-empty">کاربری پیدا نشد.</div>}
      </div>
    </section>}

    {tab === 'settings' && <section className="xm-section">
      <h2>تنظیمات جامعه</h2>
      <form className="card fr-admin-form" onSubmit={(event) => { event.preventDefault(); void call('PATCH', { section: 'settings', settings }, 'تنظیمات ذخیره شد') }}>
        <Num label="سطح لازم برای درج تصویر" value={settings.imagesMinTrust} max={4} onChange={(v) => setSettings({ ...settings, imagesMinTrust: v })} />
        <Num label="سطح لازم برای پیوند نامحدود" value={settings.linksMinTrust} max={4} onChange={(v) => setSettings({ ...settings, linksMinTrust: v })} />
        <Num label="حداکثر پیوند کاربر تازه‌وارد" value={settings.newUserMaxLinks} max={50} onChange={(v) => setSettings({ ...settings, newUserMaxLinks: v })} />
        <Num label="موضوع روزانهٔ تازه‌واردها" value={settings.newUserTopicsPerDay} max={100} onChange={(v) => setSettings({ ...settings, newUserTopicsPerDay: v })} />
        <Num label="مهلت ویرایش (ساعت)" value={settings.editWindowHours} max={8760} onChange={(v) => setSettings({ ...settings, editWindowHours: v })} />
        <Num label="وزن گزارش برای پنهان‌سازی خودکار" value={settings.flagHideWeight} min={1} max={100} onChange={(v) => setSettings({ ...settings, flagHideWeight: v })} />
        <Num label="حداکثر برچسب هر موضوع" value={settings.maxTagsPerTopic} max={10} onChange={(v) => setSettings({ ...settings, maxTagsPerTopic: v })} />
        <label className="studio-switch"><input type="checkbox" checked={settings.membersCreateTags} onChange={(e) => setSettings({ ...settings, membersCreateTags: e.target.checked })} />کاربران (سطح ۲ به بالا) برچسب تازه بسازند</label>
        <Num label="پیام‌های نخست تازه‌واردها که نیاز به تأیید دارند (۰ = خاموش)" value={settings.approveNewUserPosts} max={20} onChange={(v) => setSettings({ ...settings, approveNewUserPosts: v })} />
        <label className="studio-switch"><input type="checkbox" checked={settings.messagesEnabled} onChange={(e) => setSettings({ ...settings, messagesEnabled: e.target.checked })} />پیام خصوصی بین اعضا فعال باشد</label>
        <Num label="سطح لازم برای شروع پیام خصوصی" value={settings.messagesMinTrust} max={4} onChange={(v) => setSettings({ ...settings, messagesMinTrust: v })} />
        <Num label="سطح لازم برای ساخت نظرسنجی" value={settings.pollsMinTrust} max={4} onChange={(v) => setSettings({ ...settings, pollsMinTrust: v })} />
        <fieldset className="fa-perms fr-admin-wide">
          <legend>واکنش‌های مجاز</legend>
          <div className="fa-inline fa-wrap">{Object.entries(REACTIONS).map(([key, emoji]) => <label key={key} className="studio-switch"><input type="checkbox" checked={settings.reactions.includes(key)} onChange={(e) => setSettings({ ...settings, reactions: e.target.checked ? [...settings.reactions, key] : settings.reactions.filter((r) => r !== key) })} />{emoji}</label>)}</div>
        </fieldset>
        {(['1', '2', '3'] as const).map((level) => <fieldset key={level} className="fa-perms fr-admin-wide">
          <legend>ارتقا به سطح {fa(Number(level))} — {data.trustNames[Number(level)]}</legend>
          <div className="fa-inline fa-wrap">{TRUST_FIELDS.map((field) => <Num key={field.key} label={field.label} value={settings.trust[level][field.key]} max={100000} onChange={(v) => setSettings({ ...settings, trust: { ...settings.trust, [level]: { ...settings.trust[level], [field.key]: v } } })} />)}</div>
        </fieldset>)}
        <p className="muted fr-admin-wide">سطح ۴ (رهبر جامعه) فقط به‌صورت دستی از بخش کاربران اعطا می‌شود. سطح‌ها هرگز به‌طور خودکار کاهش نمی‌یابند.</p>
        <div className="fr-admin-actions"><button className="btn btn-primary btn-sm" disabled={busy}>ذخیرهٔ تنظیمات</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettings(data.settings)}>بازگردانی</button></div>
      </form>
    </section>}
  </div>
}

function Num({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max: number }) {
  return <label className="studio-field"><span>{label}</span><input className="input" type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} /></label>
}

function UserModeration({ user, trustNames, busy, onSave }: { user: Member; trustNames: string[]; busy: boolean; onSave: (patch: Record<string, unknown>, success: string) => void }) {
  const [title, setTitle] = useState(user.title)
  const [note, setNote] = useState(user.moderationNote)
  const now = Date.now()
  const silenced = user.silencedUntil && new Date(user.silencedUntil).getTime() > now
  const suspended = user.suspendedUntil && new Date(user.suspendedUntil).getTime() > now
  const ask = (field: 'silenceDays' | 'suspendDays', label: string) => {
    const days = window.prompt(`${label} برای چند روز؟ (۰ = لغو)`, '7')
    if (days !== null) onSave({ [field]: Number(days) || 0 }, Number(days) ? `${label} اعمال شد` : `${label} لغو شد`)
  }
  return <article className="card fa-user">
    <header>
      <div><Link href={`/forum/u/${user.username}`} target="_blank"><b>{user.name || user.email}</b></Link> <bdi className="muted" dir="ltr">@{user.username}</bdi>
        <br /><small className="muted">{user.email} · {user.postCount.toLocaleString('fa-IR')} پیام · {user.likesReceived.toLocaleString('fa-IR')} پسند{user.lastSeenAt ? ` · آخرین بازدید ${date(user.lastSeenAt)}` : ''}{user.groups.length ? ` · ${user.groups.join('، ')}` : ''}</small></div>
      <div className="fa-perm-cell">{silenced && <span className="badge">🔇 ساکت تا {date(user.silencedUntil)}</span>}{suspended && <span className="badge">⛔ معلق تا {date(user.suspendedUntil)}</span>}</div>
    </header>
    <div className="fa-inline fa-wrap">
      <label className="studio-field"><span>سطح اعتماد{user.trustLocked ? ' (قفل)' : ''}</span><select className="input" value={user.trustLevel} disabled={busy} onChange={(e) => onSave({ trustLevel: Number(e.target.value), trustLocked: true }, 'سطح اعتماد تغییر کرد')}>{trustNames.map((name, level) => <option key={level} value={level}>{level.toLocaleString('fa-IR')} — {name}</option>)}</select></label>
      {user.trustLocked && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSave({ trustLocked: false }, 'سطح اعتماد دوباره خودکار شد')}>بازکردن قفل سطح</button>}
      <label className="studio-field"><span>عنوان</span><div className="fa-inline"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} /><button type="button" className="btn btn-ghost btn-sm" disabled={busy || title === user.title} onClick={() => onSave({ title }, 'عنوان ذخیره شد')}>ذخیره</button></div></label>
      <label className="studio-field fa-grow"><span>یادداشت مدیریتی (خصوصی)</span><div className="fa-inline"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /><button type="button" className="btn btn-ghost btn-sm" disabled={busy || note === user.moderationNote} onClick={() => onSave({ moderationNote: note }, 'یادداشت ذخیره شد')}>ذخیره</button></div></label>
    </div>
    <div className="fa-inline fa-wrap">
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('silenceDays', 'ساکت‌کردن')}>🔇 {silenced ? 'تغییر سکوت' : 'ساکت‌کردن'}</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ask('suspendDays', 'تعلیق')}>⛔ {suspended ? 'تغییر تعلیق' : 'تعلیق'}</button>
    </div>
  </article>
}

export default function ForumAdminPage() {
  return <Suspense fallback={null}><AdminForumPage /></Suspense>
}
