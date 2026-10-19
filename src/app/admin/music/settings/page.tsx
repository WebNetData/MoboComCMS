'use client'

import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import { CHART_SOURCES, MUSIC_RAILS, type ChartSource, type MusicSettings } from '@/modules/music/domain/music'
import { OrderedPicker, RailsEditor } from '../../cms/SectionAdmin'
import { MusicShell, Notice, send, useJson } from '../shared'

type Pick = { id: number; title: string; cover: string; artist: string }

/** Music home layout (blocks, hero queue, featured albums, chart) and display options. */
export default function MusicSettingsPage() {
  const { data, error } = useJson<{ settingsRevision: string; settings: MusicSettings; picker: { tracks: Pick[]; albums: Pick[] } }>('/api/admin/music/settings')
  const [form, setForm] = useState<MusicSettings | null>(null)
  const [revision, setRevision] = useState('')
  const [baseline, setBaseline] = useState<MusicSettings | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) { setForm(current => current ?? data.settings); setBaseline(current => current ?? data.settings); setRevision(current => current || data.settingsRevision || '') } }, [data])

  if (!form) return <MusicShell title="صفحهٔ اصلی و تنظیمات">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</MusicShell>
  const set = (patch: Partial<MusicSettings>) => { setMessage(null); setForm(current => current ? { ...current, ...patch } : current) }
  const toItem = (row: Pick) => ({ id: row.id, title: row.title, image: row.cover, sub: row.artist })

  async function save() {
    if (!form) return
    setBusy(true)
    const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(baseline?.[key as keyof MusicSettings])))
    const response = await send<{ settingsRevision: string; settings: MusicSettings }>('/api/admin/music/settings', 'POST', patch, revision ? { 'if-match': revision } : {})
    setBusy(false)
    if (!response.ok) { setMessage({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings)
    setBaseline(response.data.settings)
    setRevision(response.data.settingsRevision)
    setMessage({ tone: 'ok', text: 'تنظیمات ذخیره شد و صفحهٔ اصلی موزیک به‌روز است' })
  }

  return <div className="cm-section-settings"><MusicShell title="صفحهٔ اصلی و تنظیمات" actions={<><SectionSettingsHistoryLink section="music" /><a href="/music" target="_blank" rel="noreferrer" className="btn btn-ghost">پیش‌نمایش</a><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <fieldset disabled={busy} className="sa-settings-fields" aria-label="تنظیمات بخش">
    <div className="sa-cols">
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>بلوک‌های صفحهٔ اصلی</h2><small>ترتیب و نمایش</small></header>
          <RailsEditor rails={form.rails} labels={MUSIC_RAILS} onChange={(rails) => set({ rails })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>چارت و فهرست‌ها</h2></header>
          <label className="sa-field"><span>معیار چارت</span><select className="select" value={form.chartSource} onChange={(e) => set({ chartSource: e.target.value as ChartSource })}>{Object.entries(CHART_SOURCES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="sa-field"><span>تعداد آهنگ‌های چارت</span><input className="input num" type="number" min={5} max={30} value={form.chartSize} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ chartSize: e.target.valueAsNumber }) }} /><small className="sa-sub">بین ۵ تا ۳۰</small></label>
          <label className="sa-field"><span>تعداد «جدیدترین آهنگ‌ها»</span><input className="input num" type="number" min={6} max={30} value={form.latestSize} onChange={(e) => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) set({ latestSize: e.target.valueAsNumber }) }} /></label>
        </section>
      </div>
      <div className="sa-stack">
        <section className="sa-card">
          <header className="sa-card-head"><h2>آهنگ ویژه و صف پخش</h2><small>تا ۵ آهنگ؛ خالی = آهنگ‌های «ویژه»</small></header>
          <OrderedPicker items={(data?.picker.tracks || []).map(toItem)} ids={form.heroTrackIds} max={5} placeholder="افزودن آهنگ…" onChange={(heroTrackIds) => set({ heroTrackIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>آلبوم‌های ویژه</h2><small>خالی = آلبوم‌های علامت‌خورده به «ویژه»</small></header>
          <OrderedPicker items={(data?.picker.albums || []).map(toItem)} ids={form.featuredAlbumIds} max={12} placeholder="افزودن آلبوم…" onChange={(featuredAlbumIds) => set({ featuredAlbumIds })} />
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>نمایش و دسترسی</h2></header>
          <label className="sa-check"><input type="checkbox" checked={form.showLyrics} onChange={(e) => set({ showLyrics: e.target.checked })} />نمایش متن ترانه در صفحهٔ آهنگ</label>
          <label className="sa-check"><input type="checkbox" checked={form.showArtistBiography} onChange={e => set({ showArtistBiography: e.target.checked })} />نمایش زندگی‌نامه در پروفایل خواننده</label>
          <label className="sa-check"><input type="checkbox" checked={form.showArtistFollow} onChange={e => set({ showArtistFollow: e.target.checked })} />نمایش دنبال‌کردن در پروفایل خواننده</label>
          <label className="sa-check"><input type="checkbox" checked={form.showRelatedTracks} onChange={(e) => set({ showRelatedTracks: e.target.checked })} />پیشنهاد آهنگ‌های هم‌سبک در صفحهٔ آهنگ</label>
          <p className="sa-hint"><span data-vip="">کیفیت ۳۲۰ و دانلود فقط برای VIP، و </span>آدرس و سئوی بخش در <Link href="/admin/sections/music" className="sa-link">تنظیمات بخش و آدرس</Link> هستند.</p>
        </section>
      </div>
    </div>
  </fieldset></MusicShell></div>
}
