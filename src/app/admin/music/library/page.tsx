'use client'

import { useState } from 'react'
import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields } from '../../cms/media-fields'
import { useI18n } from '@/i18n/LocaleProvider'
import { MusicShell } from '../shared'

type Tab = 'tracks' | 'albums' | 'artists' | 'playlists'

export default function AdminMusicPage() {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [tab, setTab] = useState<Tab>('tracks')
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const artist: MediaField = { key: 'artistId', label: fa ? 'هنرمند' : 'Artist', type: 'select', required: true, source: { type: 'music-artists', label: (row) => row.name + (row.nameEn ? ` — ${row.nameEn}` : ''), empty: fa ? '— انتخاب هنرمند —' : '— choose artist —' }, table: (row) => row.artist?.name || '—' }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracks', label: fa ? 'آهنگ‌ها' : 'Tracks' },
    { id: 'albums', label: fa ? 'آلبوم‌ها' : 'Albums' },
    { id: 'artists', label: fa ? 'هنرمندان' : 'Artists' },
    { id: 'playlists', label: fa ? 'پلی‌لیست‌ها' : 'Playlists' },
  ]

  const views: Record<Tab, { type: string; title: string; fields: MediaField[]; publicPath: (row: any) => string | null; titleKey?: string }> = {
    tracks: {
      type: 'music-tracks', title: fa ? 'آهنگ‌ها' : 'Tracks',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/track/${row.slug}` : null),
      fields: [
        { key: 'title', label: fa ? 'نام آهنگ' : 'Title', required: true, table: true },
        { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
        artist,
        { key: 'albumId', label: fa ? 'آلبوم (اختیاری)' : 'Album (optional)', type: 'select', source: { type: 'music-albums', label: (row) => `${row.title} — ${row.artist?.name || ''}`, empty: fa ? '— تک‌آهنگ —' : '— single —' }, table: (row) => row.album?.title || (fa ? 'تک‌آهنگ' : 'Single') },
        { key: 'trackNo', label: fa ? 'شماره در آلبوم' : 'Track #', type: 'number' },
        { key: 'genre', label: fa ? 'سبک (با ویرگول)' : 'Genre (comma separated)', placeholder: fa ? 'پاپ، سنتی' : 'Pop, Rock', table: true },
        { key: 'audioUrl', label: fa ? 'فایل صوتی ۱۲۸ (لینک)' : 'Audio 128 kbps URL', dir: 'ltr', wide: true, placeholder: 'https://dl.example.com/track-128.mp3', upload: 'music', accept: 'audio/*,.mp3,.m4a,.flac', hint: fa ? 'این لینک هرگز در صفحه نمایش داده نمی‌شود؛ پخش از مسیر امن سایت انجام می‌شود.' : 'Never shown on the page — playback goes through a protected site endpoint.' },
        { key: 'audioHqUrl', label: fa ? 'فایل صوتی ۳۲۰ (کیفیت بالا)' : 'Audio 320 kbps (HQ) URL', dir: 'ltr', wide: true, upload: 'music', accept: 'audio/*,.mp3,.m4a,.flac' },
        { key: 'duration', label: fa ? 'مدت (ثانیه)' : 'Duration (seconds)', type: 'number' },
        { key: 'cover', label: fa ? 'کاور (خالی = کاور آلبوم)' : 'Cover (empty = album cover)', type: 'image' },
        { key: 'lyrics', label: fa ? 'متن ترانه' : 'Lyrics', type: 'textarea' },
        access, status, featured, publishedAt, slug,
      ],
    },
    albums: {
      type: 'music-albums', title: fa ? 'آلبوم‌ها' : 'Albums',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/album/${row.slug}` : null),
      fields: [
        { key: 'title', label: fa ? 'نام آلبوم' : 'Title', required: true, table: true },
        { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
        artist,
        { key: 'year', label: fa ? 'سال انتشار' : 'Year', type: 'number', table: true },
        { key: 'terms', label: fa ? 'دسته‌بندی و زیردسته' : 'Categories', type: 'terms', taxonomy: 'music' },
        { key: 'genre', label: fa ? 'سبک' : 'Genre' },
        { key: 'cover', label: fa ? 'کاور' : 'Cover', type: 'image', table: true },
        { key: 'description', label: fa ? 'توضیحات' : 'Description', type: 'textarea' },
        access, status, featured, publishedAt, slug,
      ],
    },
    artists: {
      type: 'music-artists', title: fa ? 'هنرمندان' : 'Artists', titleKey: 'name',
      publicPath: (row) => `/music/artist/${row.slug}`,
      fields: [
        { key: 'name', label: fa ? 'نام هنرمند' : 'Name', required: true, table: true },
        { key: 'nameEn', label: fa ? 'نام انگلیسی' : 'English name', dir: 'ltr', table: true },
        { key: 'image', label: fa ? 'تصویر پروفایل' : 'Photo', type: 'image', table: true },
        { key: 'cover', label: fa ? 'کاور صفحه هنرمند' : 'Header image', type: 'image' },
        { key: 'bio', label: fa ? 'بیوگرافی' : 'Biography', type: 'textarea' },
        featured, slug,
      ],
    },
    playlists: {
      type: 'music-playlists', title: fa ? 'پلی‌لیست‌ها' : 'Playlists',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/playlist/${row.slug}` : null),
      fields: [
        { key: 'title', label: fa ? 'نام پلی‌لیست' : 'Title', required: true, table: true },
        { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
        { key: 'description', label: fa ? 'توضیح کوتاه' : 'Short description', type: 'textarea' },
        { key: 'cover', label: fa ? 'کاور' : 'Cover', type: 'image', table: true },
        { key: 'trackIds', label: fa ? 'آهنگ‌ها (به ترتیب)' : 'Tracks (in order)', type: 'picklist', source: { type: 'music-tracks', label: (row) => `${row.title} — ${row.artist?.name || ''}` } },
        { key: 'sortOrder', label: fa ? 'ترتیب' : 'Order', type: 'number' },
        access, status, featured, slug,
      ],
    },
  }
  const view = views[tab]

  return (
    <MusicShell>
      <nav className="mx-tabs" aria-label={fa ? 'بخش‌های موزیک' : 'Music sections'}>
        {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}
        <a className="mx-tabs-link" href="/music" target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده بخش موزیک ↗' : 'Open music site ↗'}</a>
      </nav>
      <MediaCrud key={view.type} type={view.type} title={view.title} fields={view.fields} publicPath={view.publicPath} titleKey={view.titleKey} subtitle={fa ? 'آهنگ‌ها با پخش‌کننده سراسری سایت پخش می‌شوند. کیفیت ۳۲۰ و دانلود طبق تنظیمات ماژول موزیک می‌تواند مخصوص VIP باشد.' : 'Tracks play in the site-wide player. HQ and downloads can be VIP-only in the music module settings.'} />
    </MusicShell>
  )
}
