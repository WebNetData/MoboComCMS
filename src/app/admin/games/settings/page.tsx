'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

import { useEffect, useState } from 'react'
import { GamesShell, Notice, send, useJson } from '../shared'
import { HOME_RAILS, type GamesSettings, type HomeRail } from '@/modules/games/domain/games'

type Game = { id: number; title: string; cover: string; status: string }

/** Games home layout (hero picks, rail order and visibility) and portal options. */
export default function GamesSettingsPage() {
  const { data, error } = useJson<{ settingsRevision: string; settings: GamesSettings }>('/api/admin/games/settings')
  const games = useJson<{ games: Game[] }>('/api/admin/games/list?status=published&sort=title&size=500')
  const [form, setForm] = useState<GamesSettings | null>(null)
  const [baseline, setBaseline] = useState<GamesSettings | null>(null)
  const [revision, setRevision] = useState('')
  const [pick, setPick] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) { setForm(current => current ?? data.settings); setBaseline(current => current ?? data.settings); setRevision(current => current || data.settingsRevision || '') } }, [data])

  if (!form) return <GamesShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</GamesShell>
  const set = (patch: Partial<GamesSettings>) => { setMessage(null); setForm({ ...form, ...patch }) }
  const move = (index: number, delta: number) => {
    const rails = [...form.rails]
    const target = index + delta
    if (target < 0 || target >= rails.length) return
    ;[rails[index], rails[target]] = [rails[target], rails[index]]
    set({ rails })
  }
  const byId = new Map((games.data?.games || []).map((game) => [game.id, game]))

  async function save() {
    if (!form) return
    setBusy(true)
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline?.[key as keyof GamesSettings])))
    const response = await send<{ settingsRevision: string; settings: GamesSettings }>('/api/admin/games/settings', 'POST', patch, revision ? { 'if-match': revision } : {})
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setBaseline(response.data.settings)
    setRevision(response.data.settingsRevision)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی بازی به‌روز است' })
  }

  return <div className="cm-section-settings"><GamesShell title="صفحهٔ اصلی و تنظیمات" actions={<><SectionSettingsHistoryLink section="games" /><a href="/games" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <fieldset disabled={busy} className="sa-settings-fields" aria-label="تنظیمات بخش">
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>بلوک‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <ol className="ga-rails">{form.rails.map((rail, index) => <li key={rail.key} className={rail.enabled ? '' : 'is-off'}>
            <span className="ga-rail-index num">{(index + 1).toLocaleString('fa-IR')}</span>
            <label className="sa-check"><input type="checkbox" checked={rail.enabled} onChange={(e) => set({ rails: form.rails.map((r) => (r.key === rail.key ? { ...r, enabled: e.target.checked } : r)) })} />{HOME_RAILS[rail.key as HomeRail]}</label>
            <span className="ga-rail-move"><button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`بالا بردن ${HOME_RAILS[rail.key]}`}>↑</button><button type="button" className="btn btn-ghost btn-sm" disabled={index === form.rails.length - 1} onClick={() => move(index, 1)} aria-label={`پایین بردن ${HOME_RAILS[rail.key]}`}>↓</button></span>
          </li>)}</ol>
        </section>
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>اسلایدر بالای صفحه</h2><small>خالی = بازی‌های «ویژه»</small></header>
          <ul className="sa-rank">{form.heroIds.map((id, index) => { const game = byId.get(id); return <li key={id}>{game?.cover ? <img src={game.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{game?.title || `#${id}`}</b></span>
            <button type="button" className="sa-link" disabled={index === 0} onClick={() => { const ids = [...form.heroIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; set({ heroIds: ids }) }} aria-label="بالا">↑</button>
            <button type="button" className="sa-link is-danger" onClick={() => set({ heroIds: form.heroIds.filter((x) => x !== id) })} aria-label="حذف">✕</button></li> })}</ul>
          {form.heroIds.length < 8 && <div className="ga-line"><select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="انتخاب بازی"><option value="">افزودن بازی به اسلایدر…</option>{(games.data?.games || []).filter((game) => !form.heroIds.includes(game.id)).map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}</select><button type="button" className="btn btn-ghost btn-sm" disabled={!pick} onClick={() => { set({ heroIds: [...form.heroIds, Number(pick)] }); setPick('') }}>افزودن</button></div>}
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>گزینه‌ها</h2></header>
          <label className="sa-check"><input type="checkbox" checked={form.libraryEnabled} onChange={(e) => set({ libraryEnabled: e.target.checked })} />کتابخانهٔ بازی کاربران (بازی کرده‌ام / می‌خواهم بازی کنم)</label>
          <label className="sa-check"><input type="checkbox" checked={form.showMemberScore} onChange={(e) => set({ showMemberScore: e.target.checked })} />نمایش نمرهٔ کاربران در صفحهٔ بازی</label>
          <p className="sa-sub">بلوک «آخرین مطالب بازی» پست‌های منتشرشدهٔ خود بخش بازی را نمایش می‌دهد. تب‌ها بر اساس تازه‌ترین و پربازدیدترین بازی‌ها مرتب می‌شوند؛ نمایش و جایگاه این بلوک از فهرست بلوک‌های همین صفحه مدیریت می‌شود.</p>
        </section>
      </div>
    </div>
  </fieldset></GamesShell></div>
}
