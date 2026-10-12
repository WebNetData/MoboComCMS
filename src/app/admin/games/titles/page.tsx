'use client'

import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { Suspense, useEffect, useState } from 'react'
import { GamesShell, Notice, RELEASE_LABEL, fa, faDate, send, useJson } from '../shared'
import AdminPagination from '../../cms/AdminPagination'
import type { AdminPageSize } from '@/modules/content/domain/admin-pagination'

type Game = {
  id: number; slug: string; title: string; titleEn: string; cover: string; platforms: string[]; status: string; scheduled: boolean; publishedAt: string; releaseDate: string | null
  release: { state: string; days: number | null }; score: number | null; views: number; access: string; featured: boolean; editorsChoice: boolean; franchise: string
  links: number; disabledLinks: number; clicks: number; library: number; updates: number; issues: string[]
}
type List = { total: number; page: number; pages: number; games: Game[]; counts: Record<string, number>; platforms: string[]; franchises: { id: number; title: string }[]; checks: Record<string, string>; mine?: boolean }

const BULK: [string, string][] = [['publish', 'انتشار'], ['draft', 'پیش‌نویس'], ['feature', 'ویژه (اسلایدر)'], ['unfeature', 'حذف از ویژه'], ['editors', 'انتخاب سردبیر'], ['uneditors', 'حذف انتخاب سردبیر'], ['members', 'فقط VIP'], ['public', 'عمومی'], ['franchise', 'تعیین مجموعه'], ['delete', 'حذف']]
// A games author works on their own games: featuring, the editors' choice and the trash decision are the manager's.
const AUTHOR_BULK: [string, string][] = [['publish', 'انتشار'], ['draft', 'پیش‌نویس'], ['members', 'فقط VIP'], ['public', 'عمومی'], ['franchise', 'تعیین مجموعه'], ['delete', 'درخواست حذف']]
const MANAGER_BULK: [string, string][] = [...BULK, ['restore', 'بازگردانی از سطل زباله']]
const STATUS_TABS: [string, string][] = [['', 'همه'], ['published', 'منتشرشده'], ['draft', 'پیش‌نویس'], ['scheduled', 'زمان‌بندی‌شده'], ['upcoming', 'در راه'], ['editors', 'انتخاب سردبیر'], ['featured', 'ویژه'], ['vip', 'VIP'], ['trashed', 'سطل زباله']]

function Titles() {
  const router = useRouter()
  const params = useSearchParams()
  const filters = Object.fromEntries(['q', 'status', 'platform', 'franchise', 'issue', 'sort', 'page', 'size'].map((key) => [key, params.get(key) || '']))
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  const { data, error, loading, reload } = useJson<List>(`/api/admin/games/list?${query}`)
  const [search, setSearch] = useState(filters.q)
  const [selected, setSelected] = useState<number[]>([])
  const [action, setAction] = useState('')
  const [value, setValue] = useState('')
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => setSearch(filters.q), [filters.q])

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries({ ...filters, page: '', ...patch }).filter(([, v]) => v))
    router.push(`/admin/games/titles?${next}`)
  }
  const all = !!data?.games.length && data.games.every((game) => selected.includes(game.id))
  const mine = data?.mine === true

  /** One decision on one trashed game: the manager puts it back, or deletes it for good. */
  async function decide(game: Game, decision: 'restore' | 'delete') {
    if (decision === 'delete' && !window.confirm(`«${game.title}» همراه با لینک‌ها و آپدیت‌هایش برای همیشه حذف شود؟ این کار برگشت‌پذیر نیست.`)) return
    const response = await send<{ changed: number }>('/api/admin/games/list', 'POST', { ids: [game.id], action: decision })
    setResult(response.ok ? { tone: 'ok', text: decision === 'restore' ? 'از سطل زباله برگشت.' : 'برای همیشه حذف شد.' } : { tone: 'error', text: response.error })
    void reload()
  }

  async function apply() {
    if (!action || !selected.length) return
    if (action === 'delete' && !window.confirm(mine ? `${fa(selected.length)} بازی به سطل زباله می‌رود و از سایت برداشته می‌شود؛ حذف نهایی یا بازگردانی با مدیر بخش بازی است. ادامه می‌دهید؟` : `${fa(selected.length)} بازی همراه با لینک‌ها و آپدیت‌هایشان حذف شود؟ این کار برگشت‌پذیر نیست.`)) return
    let changed = 0
    for (let index = 0; index < selected.length; index += 500) {
      const response = await send<{ changed: number }>('/api/admin/games/list', 'POST', { ids: selected.slice(index, index + 500), action, value })
      if (!response.ok) { setSelected(selected.slice(index)); setResult({ tone: 'error', text: `${fa(changed)} بازی به‌روز شد؛ ${response.error}` }); void reload(); return }
      changed += response.data.changed
    }
    setResult({ tone: 'ok', text: action === 'delete' && mine ? `${fa(changed)} بازی به سطل زباله رفت و منتظر تصمیم مدیر بخش است` : `${fa(changed)} بازی ${action === 'delete' ? 'حذف' : action === 'restore' ? 'بازگردانی' : 'به‌روز'} شد` })
    setSelected([])
    setAction(''); setValue('')
    void reload()
  }

  const select = (key: string, label: string, options: [string, string][], all = 'همه') => <label className="sa-inline"><span>{label}</span><select className="select" value={filters[key]} onChange={(event) => go({ [key]: event.target.value })}><option value="">{all}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>

  return <GamesShell title="بازی‌ها" actions={<Link href="/admin/games/new" className="btn btn-primary">+ افزودن بازی</Link>}>
    <nav className="sa-subtabs" aria-label="وضعیت">{STATUS_TABS.map(([key, label]) => {
      const count = key === '' ? data?.counts.all : data?.counts[key]
      return <button key={key} type="button" data-vip={key === 'vip' ? '' : undefined} className={filters.status === key ? 'is-active' : ''} aria-pressed={filters.status === key} onClick={() => go({ status: key })}>{label}{count ? <span className="num">{fa(count)}</span> : null}</button>
    })}</nav>
    <form className="sa-toolbar" role="search" onSubmit={(event) => { event.preventDefault(); go({ q: search.trim() }) }}>
      <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام فارسی یا انگلیسی، نامک یا سازنده" aria-label="جست‌وجوی بازی" />
      {select('platform', 'پلتفرم', (data?.platforms || []).map((p) => [p, p]))}
      {select('franchise', 'مجموعه', [['none', 'بدون مجموعه'], ...(data?.franchises || []).map((f) => [String(f.id), f.title] as [string, string])])}
      {select('issue', 'کمبود محتوا', [['any', 'هر کمبودی'], ...Object.entries(data?.checks || {})])}
      {select('sort', 'ترتیب', [['updated', 'آخرین ویرایش'], ['release', 'تاریخ انتشار بازی'], ['views', 'پربازدیدترین'], ['score', 'بیشترین نمره'], ['title', 'نام']], 'تازه‌ترین انتشار در سایت')}
      <button className="btn btn-ghost" type="submit">جست‌وجو</button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    <AdminPagination fa page={data?.page || 1} pages={data?.pages || 1} size={(filters.size || '20') as AdminPageSize} total={data?.total || 0} shown={data?.games.length || 0} busy={loading} onPage={(page) => go({ page: String(page) })} onSize={(size) => go({ size: String(size) })} />
    {selected.length > 0 && <div className="sa-bulk" role="region" aria-label="عملیات گروهی">
      <b className="num">{fa(selected.length)} انتخاب‌شده</b>
      <select className="select" value={action} onChange={(event) => { setAction(event.target.value); setValue('') }} aria-label="عملیات"><option value="">عملیات گروهی…</option>{(mine ? AUTHOR_BULK : MANAGER_BULK).map(([key, label]) => <option key={key} value={key} data-vip={key === 'members' || key === 'public' ? '' : undefined}>{label}</option>)}</select>
      {action === 'franchise' && <select className="select" value={value} onChange={(event) => setValue(event.target.value)} aria-label="مجموعه"><option value="">بدون مجموعه</option>{data?.franchises.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>}
      <button type="button" className="btn btn-primary" disabled={!action} onClick={() => void apply()}>اعمال</button>
      <button type="button" className="btn btn-ghost" onClick={() => setSelected([])}>لغو انتخاب</button>
    </div>}
    <div className="sa-card sa-table-wrap" aria-busy={loading}>
      <table className="data sa-table">
        <thead><tr><th><input type="checkbox" aria-label="انتخاب همه موارد این صفحه" checked={all} onChange={() => setSelected((current) => all ? current.filter((id) => !data?.games.some((game) => game.id === id)) : [...new Set([...current, ...(data?.games.map((game) => game.id) || [])])])} /></th><th>بازی</th><th>انتشار بازی</th><th>نمره</th><th>دانلود</th><th>مخاطب</th><th>وضعیت</th></tr></thead>
        <tbody>
          {data?.games.map((game) => <tr key={game.id} className={selected.includes(game.id) ? 'is-selected' : ''}>
            <td><input type="checkbox" aria-label={`انتخاب ${game.title}`} checked={selected.includes(game.id)} onChange={() => setSelected((list) => list.includes(game.id) ? list.filter((id) => id !== game.id) : [...list, game.id])} /></td>
            <td><div className="sa-product-cell">{game.cover ? <img src={game.cover} alt="" /> : <span className="sa-ph" />}<span>
              <Link href={`/admin/games/${game.id}`} className="sa-link"><b>{game.title}</b></Link>
              <small className="sa-sub">{game.platforms.slice(0, 4).join(' · ')}{game.franchise && ` · ${game.franchise}`}</small>
              {game.issues.length > 0 && <small className="ga-issues" title={game.issues.map((i) => data.checks[i]).join('، ')}>⚠ {fa(game.issues.length)} کمبود: {game.issues.slice(0, 2).map((i) => data.checks[i]).join('، ')}{game.issues.length > 2 ? '…' : ''}</small>}
            </span></div></td>
            <td><small>{game.releaseDate ? faDate(game.releaseDate) : '—'}</small><small className={`sa-sub${game.release.state === 'upcoming' ? ' ga-soon' : ''}`}>{RELEASE_LABEL(game.release)}</small></td>
            <td>{game.score !== null ? <span className="ga-score num">{fa(game.score)}</span> : <small className="sa-sub">—</small>}</td>
            <td className="num"><small>{fa(game.links)} لینک{game.disabledLinks ? ` (${fa(game.disabledLinks)} غیرفعال)` : ''}</small><small className="sa-sub">{fa(game.clicks)} کلیک · {fa(game.updates)} آپدیت</small></td>
            <td className="num"><small>{fa(game.views)} بازدید</small><small className="sa-sub">{fa(game.library)} در کتابخانه‌ها</small></td>
            <td>
              <span className={`sa-state ${game.status === 'PUBLISHED' ? (game.scheduled ? 'is-warn' : 'is-ok') : game.status === 'TRASHED' ? 'is-warn' : ''}`}>{game.status === 'PUBLISHED' ? (game.scheduled ? 'زمان‌بندی‌شده' : 'منتشرشده') : game.status === 'TRASHED' ? 'در سطل زباله' : 'پیش‌نویس'}</span>
              {game.editorsChoice && <span className="sa-tag">سردبیر</span>}{game.featured && <span className="sa-tag">ویژه</span>}{game.access === 'MEMBERS' && <span data-vip="" className="sa-tag">VIP</span>}
              {game.status === 'TRASHED'
                ? <div className="sa-row-actions" data-testid="trash-row">{mine ? <small className="sa-sub">منتظر تصمیم مدیر بخش</small> : <><button type="button" className="sa-link" onClick={() => void decide(game, 'restore')}>بازگردانی</button><button type="button" className="sa-link" onClick={() => void decide(game, 'delete')}>حذف نهایی</button></>}</div>
                : <div className="sa-row-actions"><Link href={`/admin/games/${game.id}`} className="sa-link">ویرایش</Link>{game.status === 'PUBLISHED' && <a href={`/games/${game.slug}`} target="_blank" rel="noreferrer" className="sa-link">مشاهده</a>}</div>}
            </td>
          </tr>)}
          {data && !data.games.length && <tr><td colSpan={7} className="sa-empty">بازی‌ای با این فیلترها پیدا نشد.</td></tr>}
        </tbody>
      </table>
    </div>
    <AdminPagination fa page={data?.page || 1} pages={data?.pages || 1} size={(filters.size || '20') as AdminPageSize} total={data?.total || 0} shown={data?.games.length || 0} busy={loading} onPage={(page) => go({ page: String(page) })} onSize={(size) => go({ size: String(size) })} />
  </GamesShell>
}

export default function GamesTitlesPage() {
  return <Suspense fallback={null}><Titles /></Suspense>
}
