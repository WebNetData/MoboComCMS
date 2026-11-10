'use client'

import { useState } from 'react'
import Link from '@/components/AppLink'
import MediaCrud, { type MediaField } from '../../cms/MediaCrud'
import { commonFields, inSection } from '../../cms/media-fields'
import { useSectionLists } from '../../cms/useSectionLists'
import { useI18n } from '@/i18n/LocaleProvider'
import { MusicShell } from '../shared'

type Tab = 'tracks' | 'albums' | 'playlists'

export default function AdminMusicPage({initialTab}:{initialTab:Tab}) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [tab, setTab] = useState<Tab>(initialTab)
  const { access, status, featured, publishedAt, slug } = commonFields(fa)
  const L = (persian: string, english: string) => (fa ? persian : english)
  const publish = L('انتشار و دسترسی', 'Publishing & access')
  // The owner's lists: genres (chips), release types and credit roles; inactive ones are listed for items that have them.
  const lists = useSectionLists('music', true)
  const option = (entry: { code: string; name: string; nameEn: string; icon: string; active: boolean }) => ({ value: entry.code, label: `${entry.icon ? `${entry.icon} ` : ''}${fa ? entry.name : entry.nameEn || entry.name}${entry.active ? '' : L(' (غیرفعال)', ' (inactive)')}` })
  const genres = (lists.GENRE || []).map(option), albumTypes = (lists.ALBUM_TYPE || []).map(option), roles = (lists.CREDIT_ROLE || []).map(option)
  const genreField: MediaField = { key: 'genre', label: L('سبک‌ها', 'Genres'), type: 'chips', options: genres, table: true, hint: L('سبک‌ها را در زبانهٔ «فهرست‌ها» مدیریت کنید.', 'Manage genres under Lists.') }
  const artist: MediaField = { key: 'artistId', label: fa ? 'هنرمند' : 'Artist', type: 'select', required: true, source: { type: 'music-artists', label: (row) => row.name + (row.nameEn ? ` — ${row.nameEn}` : ''), empty: fa ? '— انتخاب هنرمند —' : '— choose artist —' }, table: (row) => row.artist?.name || '—' }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tracks', label: fa ? 'آهنگ‌ها' : 'Tracks' },
    { id: 'albums', label: fa ? 'آلبوم‌ها' : 'Albums' },
    { id: 'playlists', label: fa ? 'پلی‌لیست‌ها' : 'Playlists' },
  ]

  const views: Record<Tab, { type: string; title: string; fields: MediaField[]; publicPath: (row: any) => string | null; titleKey?: string }> = {
    tracks: {
      type: 'music-tracks', title: fa ? 'آهنگ‌ها' : 'Tracks',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/track/${row.slug}` : null),
      fields: [
        ...inSection(L('اطلاعات آهنگ', 'Song details'), [
          { key: 'title', label: fa ? 'نام آهنگ' : 'Title', required: true, table: true },
          { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
          artist,
          { key: 'albumId', label: fa ? 'آلبوم (اختیاری)' : 'Album (optional)', type: 'select', source: { type: 'music-albums', label: (row) => `${row.title} — ${row.artist?.name || ''}`, empty: fa ? '— تک‌آهنگ —' : '— single —' }, table: (row) => row.album?.title || (fa ? 'تک‌آهنگ' : 'Single') },
          { key: 'trackNo', label: fa ? 'شماره در آلبوم' : 'Track #', type: 'number' },
          { key: 'duration', label: fa ? 'مدت (ثانیه)' : 'Duration (seconds)', type: 'number' },
          genreField,
          { key: 'terms', label: fa ? 'زبان و گویش' : 'Language / dialect', type: 'terms', taxonomy: 'music-language' },
        ]),
        ...inSection(L('عوامل آهنگ', 'Credits'), [
          { key: 'credits', label: L('عوامل', 'Credits'), type: 'records', source: { type: 'music-artists', label: (row) => row.name + (row.nameEn ? ` — ${row.nameEn}` : '') }, recordKeys: [{ key: 'role', label: L('نقش', 'Role'), options: roles }, { key: 'artistId', label: L('هنرمند', 'Artist'), options: 'source', wide: true }], hint: L('با همراهی (فیت)، آهنگساز، ترانه‌سرا، تنظیم‌کننده… از میان هنرمندان ثبت‌شده؛ صفحهٔ آهنگ و صفحهٔ هر هنرمند آن را نشان می‌دهد. هنرمند تازه را در زبانهٔ «خواننده‌ها و هنرمندان» بسازید و نقش‌ها را در «فهرست‌ها».', 'Featuring, composer, lyricist, arranger… from the listed artists; shown on the song and each artist page. Add new artists under Artists and roles under Lists.') },
        ]),
        ...inSection(L('فایل‌های صوتی', 'Audio files'), [
          { key: 'audioUrl', label: fa ? 'فایل صوتی ۱۲۸ (لینک)' : 'Audio 128 kbps URL', dir: 'ltr', wide: true, placeholder: 'https://dl.example.com/track-128.mp3', upload: 'music', accept: 'audio/*,.mp3,.m4a,.flac', hint: fa ? 'این نشانی در صفحه نمایش داده نمی‌شود؛ پخش با redirect مستقیم به میزبان فایل انجام می‌شود و ترافیک از سرور موبوکام عبور نمی‌کند.' : 'Never shown on the page — playback redirects directly to the media host; media bytes do not pass through MoboCom.' },
          { key: 'audioHqUrl', label: fa ? 'فایل صوتی ۳۲۰ (کیفیت بالا)' : 'Audio 320 kbps (HQ) URL', dir: 'ltr', wide: true, upload: 'music', accept: 'audio/*,.mp3,.m4a,.flac' },
        ]),
        ...inSection(L('کاور و متن ترانه', 'Cover & lyrics'), [
          { key: 'cover', label: fa ? 'کاور (خالی = کاور آلبوم)' : 'Cover (empty = album cover)', type: 'image', frame: 'square' },
          { key: 'lyrics', label: fa ? 'متن ترانه' : 'Lyrics', type: 'richtext', wide: true, upload: 'music' },
        ]),
        ...inSection(publish, [access, status, featured, publishedAt, slug]),
      ],
    },
    albums: {
      type: 'music-albums', title: fa ? 'آلبوم‌ها' : 'Albums',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/album/${row.slug}` : null),
      fields: [
        ...inSection(L('اطلاعات آلبوم', 'Album details'), [
          { key: 'title', label: fa ? 'نام آلبوم' : 'Title', required: true, table: true },
          { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
          artist,
          { key: 'albumType', label: L('نوع انتشار', 'Release type'), type: 'select', options: albumTypes, table: (row) => albumTypes.find((type) => type.value === row.albumType)?.label || row.albumType, hint: L('آلبوم، ای‌پی، تک‌آهنگ…؛ انواع را در «فهرست‌ها» مدیریت کنید.', 'Album, EP, single…; manage types under Lists.') },
          { key: 'year', label: fa ? 'سال انتشار' : 'Year', type: 'number', table: true },
          genreField,
        ]),
        ...inSection(L('دسته‌بندی و زبان', 'Categories & language'), [
          { key: 'terms', label: fa ? 'دسته‌بندی و زیردسته' : 'Categories', type: 'terms', taxonomy: 'music' },
          { key: 'trackTerms', label: fa ? 'زبان و گویش همهٔ آهنگ‌های این آلبوم (اگر انتخاب کنید روی همهٔ آهنگ‌هایش ثبت می‌شود)' : 'Language of every song in this album (applied to all its songs when chosen)', type: 'terms', taxonomy: 'music-language' },
        ]),
        ...inSection(L('کاور و توضیحات', 'Cover & description'), [
          { key: 'cover', label: fa ? 'کاور' : 'Cover', type: 'image', frame: 'square', table: true },
          { key: 'description', label: fa ? 'توضیحات' : 'Description', type: 'richtext', wide: true, upload: 'music' },
        ]),
        ...inSection(publish, [access, status, featured, publishedAt, slug]),
      ],
    },
    playlists: {
      type: 'music-playlists', title: fa ? 'پلی‌لیست‌ها' : 'Playlists',
      publicPath: (row) => (row.status === 'PUBLISHED' ? `/music/playlist/${row.slug}` : null),
      fields: [
        ...inSection(L('اطلاعات پلی‌لیست', 'Playlist details'), [
          { key: 'title', label: fa ? 'نام پلی‌لیست' : 'Title', required: true, table: true },
          { key: 'titleEn', label: fa ? 'نام انگلیسی' : 'English title', dir: 'ltr' },
          { key: 'sortOrder', label: fa ? 'ترتیب' : 'Order', type: 'number' },
        ]),
        ...inSection(L('آهنگ‌ها', 'Tracks'), [
          { key: 'trackIds', label: fa ? 'آهنگ‌ها (به ترتیب)' : 'Tracks (in order)', type: 'picklist', source: { type: 'music-tracks', label: (row) => `${row.title} — ${row.artist?.name || ''}` } },
        ]),
        ...inSection(L('کاور و توضیحات', 'Cover & description'), [
          { key: 'cover', label: fa ? 'کاور' : 'Cover', type: 'image', frame: 'square', table: true },
          { key: 'description', label: fa ? 'توضیحات پلی‌لیست' : 'Playlist description', type: 'richtext', wide: true, upload: 'music' },
        ]),
        ...inSection(publish, [access, status, featured, slug]),
      ],
    },
  }
  const view = views[tab]

  return (
    <MusicShell>
      <nav className="mx-tabs" aria-label={fa ? 'بخش‌های موزیک' : 'Music sections'}>
        <Link href="/admin/music/artists">{fa ? 'خواننده‌ها و هنرمندان' : 'Artists'}</Link>
        {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}
        <a className="mx-tabs-link" href="/music" target="_blank" rel="noopener noreferrer">{fa ? 'مشاهده بخش موزیک ↗' : 'Open music site ↗'}</a>
      </nav>
      <MediaCrud key={view.type} type={view.type} paywall={view.type === 'music-tracks' ? { ownerType: 'track', noun: 'این آهنگ' } : view.type === 'music-albums' ? { ownerType: 'album', noun: 'این آلبوم' } : undefined} title={view.title} fields={view.fields} publicPath={view.publicPath} titleKey={view.titleKey} subtitle={fa ? 'آهنگ‌ها با پخش‌کننده سراسری سایت پخش می‌شوند.' : 'Tracks play in the site-wide player. HQ and downloads can be VIP-only in the music module settings.'} />
    </MusicShell>
  )
}
