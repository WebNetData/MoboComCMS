'use client'

import Link from '@/components/AppLink'
import { DailyBars } from '../cms/SectionAdmin'
import { MusicShell, Notice, fa, useJson } from './shared'

type Track = { id: number; slug: string; title: string; cover: string; artist: string; plays: number; downloads: number }
type Dashboard = {
  kpis: { tracks: number; albums: number; artists: number; playlists: number; drafts: number; scheduled: number; plays: number; downloads: number; downloads30: number; vip: number; hq: number; emptyAlbums: number; artistsWithoutPhoto: number }
  series: { day: string; downloads: number }[]
  health: { key: string; label: string; count: number }[]
  worst: { id: number; title: string; cover: string; artist: string; issues: string[] }[]
  topPlayed: Track[]
  topDownloaded: Track[]
  topArtists: { id: number; slug: string; name: string; image: string; tracks: number; albums: number; plays: number }[]
}

/** Music dashboard: catalogue, listening, downloads and gaps to fill. */
export default function MusicDashboardPage() {
  const { data, error } = useJson<Dashboard>('/api/admin/music/dashboard')
  const k = data?.kpis
  const maxPlays = Math.max(1, ...(data?.topArtists || []).map((artist) => artist.plays))
  return <MusicShell title="مدیریت موزیک" actions={<><Link href="/admin/music/library" className="btn btn-primary">+ افزودن آهنگ</Link><a href="/music" target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهدهٔ بخش</a></>}>
    {error && <Notice tone="error">{error}</Notice>}
    {!data || !k ? <div className="sa-skeleton" aria-busy="true" /> : <>
      <div className="sa-kpis">
        <div className="sa-kpi"><span>آهنگ‌های منتشرشده</span><b className="num">{fa(k.tracks)}</b><small className="sa-sub">{fa(k.hq)} با کیفیت ۳۲۰<span data-vip=""> · {fa(k.vip)} ویژهٔ VIP</span></small></div>
        <div className="sa-kpi"><span>آلبوم و هنرمند</span><b className="num">{fa(k.albums)}</b><small className="sa-sub">{fa(k.artists)} هنرمند · {fa(k.playlists)} پلی‌لیست</small></div>
        <div className="sa-kpi"><span>پخش کل</span><b className="num">{fa(k.plays)}</b><small className="sa-sub">{fa(k.downloads)} دانلود کل</small></div>
        <div className="sa-kpi"><span>دانلود ۳۰ روز</span><b className="num">{fa(k.downloads30)}</b><small className="sa-sub">{fa(k.scheduled)} آهنگ زمان‌بندی‌شده</small></div>
      </div>
      <div className="sa-queue">
        <Link href="/admin/music/library" className="sa-queue-item"><b className="num">{fa(k.drafts)}</b><span>پیش‌نویس</span></Link>
        <Link href="/admin/music/library" className={`sa-queue-item${k.emptyAlbums ? ' is-warn' : ''}`}><b className="num">{fa(k.emptyAlbums)}</b><span>آلبوم بدون آهنگ</span></Link>
        <Link href="/admin/music/artists?filter=missing-image" className={`sa-queue-item${k.artistsWithoutPhoto ? ' is-warn' : ''}`}><b className="num">{fa(k.artistsWithoutPhoto)}</b><span>هنرمند بدون عکس</span></Link>
        <Link href="/admin/music/settings" className="sa-queue-item"><b className="num">{fa(k.playlists)}</b><span>پلی‌لیست</span></Link>
      </div>
      <div className="sa-cols">
        <div className="sa-stack">
          <DailyBars title="دانلود آهنگ در ۳۰ روز اخیر" unit="دانلود" series={data.series.map((point) => ({ day: point.day, value: point.downloads }))} />
          <section className="sa-card">
            <header className="sa-card-head"><h2>سلامت آرشیو</h2><small>آهنگ‌هایی که چیزی کم دارند</small></header>
            {data.health.length ? <>
              <div className="ga-health">{data.health.map((row) => <span key={row.key} className="ga-health-chip">{row.label}<b className="num">{fa(row.count)}</b></span>)}</div>
              {data.worst.length > 0 && <ul className="sa-rows">{data.worst.map((track) => <li key={track.id}><Link href="/admin/music/library">{track.cover ? <img src={track.cover} alt="" className="ga-thumb" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{track.title}</b><small>{track.artist} · {track.issues.map((issue) => data.health.find((row) => row.key === issue)?.label || issue).join('، ')}</small></span><span className="sa-link">تکمیل</span></Link></li>)}</ul>}
            </> : <p className="sa-hint">همهٔ آهنگ‌ها کامل هستند.</p>}
          </section>
        </div>
        <div className="sa-stack">
          <section className="sa-card">
            <header className="sa-card-head"><h2>پرپخش‌ترین آهنگ‌ها</h2></header>
            {data.topPlayed.length ? <ul className="sa-rank">{data.topPlayed.map((track) => <li key={track.id}>{track.cover ? <img src={track.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><a href={`/music/track/${track.slug}`} target="_blank" rel="noreferrer"><b>{track.title}</b></a><small className="num">{track.artist} · {fa(track.plays)} پخش</small></span></li>)}</ul> : <p className="sa-hint">هنوز آهنگی منتشر نشده است.</p>}
          </section>
          {data.topDownloaded.length > 0 && <section className="sa-card">
            <header className="sa-card-head"><h2>پردانلودترین‌ها</h2></header>
            <ul className="sa-rank">{data.topDownloaded.map((track) => <li key={track.id}>{track.cover ? <img src={track.cover} alt="" /> : <span className="sa-ph" />}<span className="sa-grow"><b>{track.title}</b><small className="num">{track.artist} · {fa(track.downloads)} دانلود</small></span></li>)}</ul>
          </section>}
          <section className="sa-card">
            <header className="sa-card-head"><h2>هنرمندان پرشنونده</h2></header>
            {data.topArtists.length ? <ul className="sx-bars">{data.topArtists.map((artist) => <li key={artist.id}><span>{artist.name}</span><span className="sx-bar" aria-hidden="true"><i style={{ width: `${(artist.plays / maxPlays) * 100}%` }} /></span><b className="num" title={`${fa(artist.tracks)} آهنگ · ${fa(artist.albums)} آلبوم`}>{fa(artist.plays)}</b></li>)}</ul> : <p className="sa-hint">هنرمندی ثبت نشده است.</p>}
          </section>
        </div>
      </div>
    </>}
  </MusicShell>
}
