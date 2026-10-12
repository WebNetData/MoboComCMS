'use client'

import dynamic from 'next/dynamic'
import PaidAccessPanel from '@/components/admin/PaidAccessPanel'
import Link from '@/components/AppLink'
import { useParams, useRouter } from '@/platform/routing/navigation'
import { useEffect, useMemo, useState } from 'react'
import CoverField from '../../cms/CoverField'
import { LinksEditor, RequirementsEditor, TermPicker, type LinkRow } from '../../cms/MediaCrud'
import { GamesShell, Notice, fa, send } from '../shared'
import UpdatesEditor from './UpdatesEditor'
import AiAutofill from '../../cms/AiAutofill'
import PublishReview, { previewValue, type ReviewRow } from '../../cms/PublishReview'
import type { AutofillField } from '@/modules/ai/domain/autofill'
import { GAME_MODES, HEALTH_CHECKS, LOCALIZATIONS, STORES, healthIssues } from '@/modules/games/domain/games'
import { GAME_PLATFORMS } from '@/modules/media/domain/media'

const RichEditor = dynamic(() => import('@/components/RichEditor'), { ssr: false, loading: () => <div className="cms-editor-loading" aria-busy="true">…</div> })

type Form = Record<string, any>
const EMPTY: Form = {
  title: '', titleEn: '', slug: '', summary: '', platforms: '', genres: '', developer: '', publisher: '', franchiseId: '', engine: '', ageRating: '', modes: '', localization: '',
  releaseDate: '', releases: [], status: 'DRAFT', publishedAt: '', access: 'PUBLIC', featured: false, editorsChoice: false,
  score: '', userScore: '', verdict: '', content: '', pros: [], cons: [], cover: '', backdrop: '', trailerUrl: '', screenshots: [],
  requirements: { min: {}, rec: {} }, links: [], version: '', gameSize: '', storeLinks: [], playMain: 0, playExtra: 0, playComplete: 0, seoTitle: '', seoDescription: '',
  terms: { ids: [], primary: null },
}
// Fields the assistant may fill from pasted material (never status, media, links or scores).
const AI_FIELDS: AutofillField[] = [
  { key: 'title', label: 'نام فارسی بازی', type: 'text' },
  { key: 'titleEn', label: 'نام انگلیسی بازی', type: 'text', dir: 'ltr' },
  { key: 'slug', label: 'نامک', type: 'slug' },
  { key: 'developer', label: 'سازنده', type: 'text' },
  { key: 'publisher', label: 'ناشر', type: 'text' },
  { key: 'engine', label: 'موتور بازی', type: 'text', dir: 'ltr' },
  { key: 'ageRating', label: 'رده سنی (مثلاً PEGI 16)', type: 'text' },
  { key: 'genres', label: 'سبک‌ها، با ویرگول', type: 'text' },
  { key: 'platforms', label: 'پلتفرم‌ها، با ویرگول', type: 'text', hint: `فقط از این نام‌ها: ${GAME_PLATFORMS.join(', ')}` },
  { key: 'modes', label: 'حالت‌های بازی، کدها با ویرگول', type: 'text', hint: `کدهای مجاز: ${Object.entries(GAME_MODES).map(([code, text]) => `${code}=${text}`).join('، ')}` },
  { key: 'releaseDate', label: 'تاریخ انتشار جهانی', type: 'date' },
  { key: 'summary', label: 'خلاصهٔ معرفی (۲ تا ۴ جمله)', type: 'textarea' },
  { key: 'verdict', label: 'حکم نهایی نقد در یک جمله', type: 'text' },
  { key: 'content', label: 'متن نقد و بررسی کامل با تیترهای فرعی', type: 'richtext' },
  { key: 'pros', label: 'نقاط قوت', type: 'records', recordKeys: [{ key: 'text', label: 'نقطهٔ قوت' }] },
  { key: 'cons', label: 'نقاط ضعف', type: 'records', recordKeys: [{ key: 'text', label: 'نقطهٔ ضعف' }] },
  { key: 'version', label: 'نسخهٔ فایل (در صورت ذکر در منبع)', type: 'text', dir: 'ltr' },
  { key: 'gameSize', label: 'حجم بازی (در صورت ذکر در منبع)', type: 'text', dir: 'ltr' },
  { key: 'playMain', label: 'ساعت تقریبی داستان اصلی', type: 'number' },
  { key: 'seoTitle', label: 'عنوان سئو (حداکثر ۶۰ نویسه)', type: 'text' },
  { key: 'seoDescription', label: 'توضیح متا (حداکثر ۱۶۰ نویسه)', type: 'textarea' },
]
const REVIEW_FIELDS: [string, string, boolean?][] = [['title', 'نام فارسی', true], ['titleEn', 'نام انگلیسی'], ['slug', 'نامک'], ['developer', 'سازنده'], ['publisher', 'ناشر'], ['genres', 'سبک‌ها'], ['platforms', 'پلتفرم‌ها'], ['releaseDate', 'تاریخ انتشار'], ['summary', 'خلاصه', true], ['cover', 'کاور', true], ['backdrop', 'تصویر افقی'], ['verdict', 'حکم نهایی'], ['content', 'متن نقد'], ['pros', 'نقاط قوت'], ['cons', 'نقاط ضعف'], ['links', 'لینک‌های دانلود'], ['seoTitle', 'عنوان سئو'], ['seoDescription', 'توضیح متا'], ['access', 'دسترسی دانلود']]

const SECTIONS = [['info', 'اطلاعات بازی'], ['release', 'انتشار و نمایش'], ['review', 'نقد و نمره'], ['media', 'تصاویر و تریلر'], ['requirements', 'سیستم مورد نیاز'], ['download', 'دانلود و فروشگاه‌ها'], ['updates', 'آپدیت و DLC'], ['seo', 'سئو']] as const
const list = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean)
const localInput = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Codes({ value, options, onChange, label }: { value: string; options: Record<string, string>; onChange: (value: string) => void; label: string }) {
  const on = list(value)
  return <fieldset className="ga-codes"><legend>{label}</legend>{Object.entries(options).map(([code, text]) => <label key={code} className={`ga-chip${on.includes(code) ? ' is-on' : ''}`}>
    <input type="checkbox" checked={on.includes(code)} onChange={() => onChange((on.includes(code) ? on.filter((c) => c !== code) : [...on, code]).join(', '))} />{text}
  </label>)}</fieldset>
}

function Lines({ value, onChange, label, placeholder }: { value: { text: string }[]; onChange: (value: { text: string }[]) => void; label: string; placeholder: string }) {
  return <div className="sa-field"><span>{label}</span>
    {value.map((row, index) => <div key={index} className="ga-line"><input className="input" value={row.text} placeholder={placeholder} onChange={(e) => onChange(value.map((r, i) => (i === index ? { text: e.target.value } : r)))} aria-label={`${label} ${index + 1}`} /><button type="button" className="sa-link is-danger" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label="حذف">✕</button></div>)}
    <button type="button" className="btn btn-ghost btn-sm ga-add" onClick={() => onChange([...value, { text: '' }])}>+ افزودن</button>
  </div>
}

export default function GameEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isNew = id === 'new'
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null)
  const [franchises, setFranchises] = useState<{ id: number; title: string }[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [aiValues, setAiValues] = useState<Form>({})
  const [review, setReview] = useState<null | { publish: boolean }>(null)
  const [originalStatus, setOriginalStatus] = useState(isNew ? '' : 'loading')

  useEffect(() => {
    fetch('/api/admin/games/franchises', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { franchises: [] })).then((body) => setFranchises(body.franchises || [])).catch(() => {})
    if (isNew) return
    fetch(`/api/admin/media-library?type=games&id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (response) => {
      const rows = await response.json().catch(() => [])
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) { setError('بازی پیدا نشد'); return }
      setOriginalStatus(row.status || '')
      setForm({ ...EMPTY, ...row, franchiseId: row.franchiseId ? String(row.franchiseId) : '', score: row.score ?? '', userScore: row.userScore ?? '', publishedAt: localInput(row.publishedAt), content: row.content || '' })
    }).catch(() => setError('بارگذاری بازی انجام نشد'))
  }, [id, isNew])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (key: string, value: unknown) => { setDirty(true); setSaved(''); setForm((current) => (current ? { ...current, [key]: value } : current)) }
  const issues = useMemo(() => form ? healthIssues({ cover: form.cover, backdrop: form.backdrop, summary: form.summary, content: form.content, score: form.score === '' ? null : Number(form.score), requirements: JSON.stringify(form.requirements), screenshots: JSON.stringify(form.screenshots), trailerUrl: form.trailerUrl, platforms: form.platforms, releaseDate: form.releaseDate ? new Date(form.releaseDate) : null, links: (form.links as LinkRow[]).filter((l) => l.url && !l.disabled).length }) : [], [form])

  async function save(publish?: boolean): Promise<boolean> {
    if (!form) return false
    if (form.title.trim().length < 2) { setError('نام بازی را بنویسید'); return false }
    setBusy(true); setError(''); setSaved('')
    const body = {
      ...form, ...(publish ? { status: 'PUBLISHED' } : {}),
      id: isNew ? undefined : Number(id),
      slug: form.slug || undefined,
      franchiseId: form.franchiseId || null,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
      releases: (form.releases as { platform: string; date: string }[]).filter((row) => row.platform && row.date),
      storeLinks: (form.storeLinks as { store: string; url: string }[]).filter((row) => row.store && row.url),
      links: (form.links as LinkRow[]).filter((row) => row.url),
      pros: (form.pros as { text: string }[]).filter((row) => row.text.trim()),
      cons: (form.cons as { text: string }[]).filter((row) => row.text.trim()),
      screenshots: (form.screenshots as { src: string }[]).filter((row) => row.src),
    }
    const response = await send<{ id: number; slug: string }>(`/api/admin/media-library?type=games`, isNew ? 'POST' : 'PATCH', body)
    setBusy(false)
    if (!response.ok) { setError(response.error); return false }
    setDirty(false)
    if (publish) setForm((current) => (current ? { ...current, status: 'PUBLISHED' } : current))
    if (isNew) { router.replace(`/admin/games/${response.data.id}`); return true }
    setForm((current) => (current ? { ...current, slug: response.data.slug } : current))
    setSaved('تغییرات ذخیره شد')
    return true
  }

  const isAi = (key: string) => !!form && key in aiValues && JSON.stringify(form[key]) === JSON.stringify(aiValues[key])
  const aiUsed = Object.keys(aiValues).some(isAi)
  const applyAi = (values: Form, filled: string[]) => {
    setDirty(true); setSaved('')
    const next = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'releaseDate' && typeof value === 'string' ? value.slice(0, 10) : value]))
    setForm((current) => (current ? { ...current, ...next } : current))
    setAiValues((current) => { const out = { ...current }; for (const key of Object.keys(next)) { if (filled.includes(key)) out[key] = next[key]; else delete out[key] } return out })
  }
  // Going live — «انتشار», a draft switched to published, or AI-filled content — needs a final review.
  const requestSave = (publish?: boolean) => {
    if (!form) return
    const goingLive = publish || (form.status === 'PUBLISHED' && (isNew || originalStatus !== 'PUBLISHED'))
    if (goingLive || (form.status === 'PUBLISHED' && aiUsed)) { setReview({ publish: !!publish }); return }
    void save(publish)
  }
  const confirmPublish = async () => { const publish = review?.publish; const done = await save(publish); setReview(null); if (done) { setOriginalStatus('PUBLISHED'); setAiValues({}) } }
  const reviewRows: ReviewRow[] = form ? REVIEW_FIELDS.map(([key, label, required]) => {
    const value = previewValue(form[key])
    return { key, label, value, state: !value && required ? 'missing' : isAi(key) ? 'ai' : value ? 'ok' : 'empty' }
  }) : []
  if (!form) return <GamesShell title="ویرایش بازی">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</GamesShell>
  const field = (key: string, label: string, props: Record<string, unknown> = {}) => <label className="sa-field"><span>{label}</span><input className="input" value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)} {...props} /></label>
  const platforms = list(form.platforms)
  const title = isNew ? 'افزودن بازی' : form.title || 'ویرایش بازی'

  return <GamesShell title={title} actions={<>
    {!isNew && form.status === 'PUBLISHED' && <a href={`/games/${form.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost">مشاهده در سایت</a>}
    <button type="button" className="btn btn-ghost" disabled={busy || uploading} onClick={() => requestSave()}>{form.status === 'PUBLISHED' ? 'ذخیره' : 'ذخیرهٔ پیش‌نویس'}</button>
    {form.status !== 'PUBLISHED' && <button type="button" className="btn btn-primary" disabled={busy || uploading} onClick={() => requestSave(true)}>بازبینی و انتشار</button>}
    {form.status === 'PUBLISHED' && <button type="button" className="btn btn-primary" disabled={busy || uploading} onClick={() => requestSave()}>{busy ? 'در حال ذخیره…' : 'به‌روزرسانی'}</button>}
  </>}>
    <Link href="/admin/games/titles" className="sa-link sa-back">→ همهٔ بازی‌ها</Link>
    {form.status === 'TRASHED' && <Notice tone="error">این بازی در سطل زباله است و تا تصمیم مدیر بخش بازی (حذف نهایی یا بازگردانی) قابل ویرایش نیست.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {saved && <Notice tone="ok">{saved}</Notice>}
    <AiAutofill section="games" fields={AI_FIELDS} form={form} onApply={applyAi} />
    <PublishReview open={!!review} title={form.title} rows={reviewRows} busy={busy} onCancel={() => setReview(null)} onConfirm={() => void confirmPublish()} />
    <nav className="sa-jump" aria-label="بخش‌های فرم">{SECTIONS.filter(([key]) => key !== 'updates' || !isNew).map(([key, label]) => <a key={key} href={`#${key}`}>{label}</a>)}</nav>
    <div className="sa-editor">
      <div className="sa-stack">
        <section id="info" className="sa-card"><header className="sa-card-head"><h2>اطلاعات بازی</h2></header>
          <div className="sa-grid">
            {field('title', 'نام فارسی *', { required: true })}
            {field('titleEn', 'نام انگلیسی', { dir: 'ltr' })}
            {field('slug', 'نامک (slug)', { dir: 'ltr', placeholder: 'از نام انگلیسی ساخته می‌شود' })}
            {field('developer', 'سازنده')}
            {field('publisher', 'ناشر')}
            <label className="sa-field"><span>مجموعه (سری)</span><select className="select" value={form.franchiseId} onChange={(e) => update('franchiseId', e.target.value)}><option value="">بدون مجموعه</option>{franchises.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
            {field('engine', 'موتور بازی', { dir: 'ltr', placeholder: 'Unreal Engine 5' })}
            {field('ageRating', 'رده سنی', { placeholder: 'PEGI 16' })}
            {field('genres', 'سبک‌ها (با ویرگول)', { placeholder: 'اکشن، نقش‌آفرینی' })}
          </div>
          <label className="sa-field"><span>خلاصهٔ معرفی</span><textarea className="input" rows={3} value={form.summary} onChange={(e) => update('summary', e.target.value)} maxLength={3000} /></label>
          <fieldset className="ga-codes"><legend>پلتفرم‌ها</legend>
            {[...new Set([...GAME_PLATFORMS, ...platforms])].map((p) => <label key={p} className={`ga-chip${platforms.includes(p) ? ' is-on' : ''}`}><input type="checkbox" checked={platforms.includes(p)} onChange={() => update('platforms', (platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p]).join(', '))} /><bdi dir="ltr">{p}</bdi></label>)}
          </fieldset>
          <Codes label="حالت‌های بازی" value={form.modes} options={GAME_MODES} onChange={(v) => update('modes', v)} />
          <Codes label="فارسی‌سازی" value={form.localization} options={LOCALIZATIONS} onChange={(v) => update('localization', v)} />
          <div className="sa-field"><span>دسته‌بندی و زیردسته</span><TermPicker taxonomy="games" value={form.terms} onChange={(v) => update('terms', v)} /></div>
        </section>

        <section id="release" className="sa-card"><header className="sa-card-head"><h2>انتشار و نمایش</h2></header>
          <div className="sa-grid">
            <label className="sa-field"><span>تاریخ انتشار بازی</span><input className="input" type="date" value={form.releaseDate} onChange={(e) => update('releaseDate', e.target.value)} /><small className="sa-sub">خالی = «اعلام نشده». بازی‌های آینده در تقویم انتشار و «به‌زودی» نمایش داده می‌شوند.</small></label>
            <label className="sa-field"><span>زمان انتشار در سایت</span><input className="input" type="datetime-local" value={form.publishedAt} onChange={(e) => update('publishedAt', e.target.value)} /><small className="sa-sub">زمان آینده = انتشار زمان‌بندی‌شده</small></label>
            <label className="sa-field"><span>دسترسی دانلود</span><select className="select" value={form.access} onChange={(e) => update('access', e.target.value)}><option value="PUBLIC">عمومی</option><option value="MEMBERS">فقط اعضای VIP</option></select></label>
          </div>
          <div className="sa-row"><label className="sa-check"><input type="checkbox" checked={form.featured} onChange={(e) => update('featured', e.target.checked)} />ویژه (اسلایدر بالای صفحه)</label><label className="sa-check"><input type="checkbox" checked={form.editorsChoice} onChange={(e) => update('editorsChoice', e.target.checked)} />انتخاب سردبیر</label></div>
          <div className="sa-field"><span>تاریخ انتشار روی هر پلتفرم (اختیاری)</span>
            {(form.releases as { platform: string; date: string }[]).map((row, index) => <div key={index} className="ga-line">
              <select className="select" value={row.platform} onChange={(e) => update('releases', form.releases.map((r: typeof row, i: number) => (i === index ? { ...r, platform: e.target.value } : r)))} aria-label="پلتفرم"><option value="">پلتفرم…</option>{[...new Set([...platforms, ...GAME_PLATFORMS])].map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <input className="input" type="date" value={row.date} onChange={(e) => update('releases', form.releases.map((r: typeof row, i: number) => (i === index ? { ...r, date: e.target.value } : r)))} aria-label="تاریخ" />
              <button type="button" className="sa-link is-danger" onClick={() => update('releases', form.releases.filter((_: unknown, i: number) => i !== index))} aria-label="حذف">✕</button>
            </div>)}
            <button type="button" className="btn btn-ghost btn-sm ga-add" onClick={() => update('releases', [...form.releases, { platform: platforms.find((p) => !form.releases.some((r: { platform: string }) => r.platform === p)) || '', date: form.releaseDate || '' }])}>+ تاریخ پلتفرم</button>
          </div>
          <PaidAccessPanel ownerType="game" ownerId={isNew ? null : Number(id)} noun="این بازی" />
        </section>

        <section id="review" className="sa-card"><header className="sa-card-head"><h2>نقد و نمره</h2></header>
          <div className="sa-grid">
            <label className="sa-field"><span>نمرهٔ منتقدان (۰ تا ۱۰۰)</span><input className="input" type="number" min={0} max={100} value={form.score} onChange={(e) => update('score', e.target.value)} /></label>
            <label className="sa-field"><span>نمرهٔ کاربران تا پیش از اولین رأی (۰ تا ۱۰)</span><input className="input" type="number" min={0} max={10} step={0.1} value={form.userScore} onChange={(e) => update('userScore', e.target.value)} /></label>
          </div>
          <label className="sa-field"><span>حکم نهایی (یک جمله کنار نمره)</span><input className="input" value={form.verdict} maxLength={240} onChange={(e) => update('verdict', e.target.value)} placeholder="مثلاً: شاهکاری که ژانر جهان‌باز را دوباره تعریف کرد." /></label>
          <div className="sa-field"><span>متن نقد و بررسی</span><RichEditor value={form.content} onChange={(html: string) => update('content', html)} dir="rtl" /></div>
          <div className="sa-grid"><Lines label="نقاط قوت" placeholder="گیم‌پلی روان" value={form.pros} onChange={(v) => update('pros', v)} /><Lines label="نقاط ضعف" placeholder="افت فریم" value={form.cons} onChange={(v) => update('cons', v)} /></div>
        </section>

        <section id="media" className="sa-card"><header className="sa-card-head"><h2>تصاویر و تریلر</h2></header>
          <div className="sa-stack">
            <div className="sa-field"><span>کاور (عمودی)</span><CoverField value={form.cover} title={form.title} onChange={(v) => update('cover', v)} onBusy={setUploading} /></div>
            <div className="sa-field"><span>تصویر پس‌زمینه (افقی)</span><CoverField value={form.backdrop} title={form.title} onChange={(v) => update('backdrop', v)} onBusy={setUploading} /></div>
          </div>
          {field('trailerUrl', 'تریلر (یوتیوب، آپارات، ویمئو یا فایل ویدیو)', { dir: 'ltr', placeholder: 'https://www.aparat.com/v/…' })}
          <div className="sa-field"><span>اسکرین‌شات‌ها</span>
            <div className="ga-shots">{(form.screenshots as { src: string }[]).map((shot, index) => <div key={index} className="ga-shot">{shot.src ? <img src={shot.src} alt="" /> : <span className="sa-ph" />}<input className="input" dir="ltr" value={shot.src} onChange={(e) => update('screenshots', form.screenshots.map((s: typeof shot, i: number) => (i === index ? { src: e.target.value } : s)))} placeholder="https://… یا /uploads/…" aria-label={`اسکرین‌شات ${index + 1}`} /><button type="button" className="sa-link is-danger" onClick={() => update('screenshots', form.screenshots.filter((_: unknown, i: number) => i !== index))} aria-label="حذف">✕</button></div>)}</div>
            <button type="button" className="btn btn-ghost btn-sm ga-add" onClick={() => update('screenshots', [...form.screenshots, { src: '' }])}>+ اسکرین‌شات</button>
          </div>
        </section>

        <section id="requirements" className="sa-card"><header className="sa-card-head"><h2>سیستم مورد نیاز</h2><small>برای بازی‌های کامپیوتر</small></header>
          <RequirementsEditor value={form.requirements} onChange={(v) => update('requirements', v)} fa />
        </section>

        <section id="download" className="sa-card"><header className="sa-card-head"><h2>دانلود و فروشگاه‌ها</h2></header>
          <div className="sa-grid">
            {field('version', 'نسخهٔ فعلی', { dir: 'ltr', placeholder: '1.12' })}
            {field('gameSize', 'حجم بازی', { dir: 'ltr', placeholder: '60 GB' })}
          </div>
          <div className="sa-field"><span>لینک‌های دانلود (از مسیر امن و با سهمیهٔ دانلود عبور می‌کنند)</span><LinksEditor value={form.links} onChange={(v) => update('links', v)} fa section="games" priced /></div>
          <div className="sa-field"><span>زمان تمام کردن (ساعت)</span><div className="sa-grid">
            {([['playMain', 'داستان اصلی'], ['playExtra', 'اصلی + جانبی'], ['playComplete', 'تکمیل ۱۰۰٪']] as [string, string][]).map(([key, label]) => <label key={key} className="sa-field"><span>{label}</span><input className="input" type="number" min={0} value={form[key]} onChange={(e) => update(key, e.target.value)} /></label>)}
          </div></div>
          <div className="sa-field"><span>خرید از فروشگاه‌های رسمی</span>
            {(form.storeLinks as { store: string; url: string }[]).map((row, index) => <div key={index} className="ga-line">
              <select className="select" value={row.store} onChange={(e) => update('storeLinks', form.storeLinks.map((r: typeof row, i: number) => (i === index ? { ...r, store: e.target.value } : r)))} aria-label="فروشگاه"><option value="">فروشگاه…</option>{STORES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <input className="input" dir="ltr" value={row.url} onChange={(e) => update('storeLinks', form.storeLinks.map((r: typeof row, i: number) => (i === index ? { ...r, url: e.target.value } : r)))} placeholder="https://store.steampowered.com/app/…" aria-label="نشانی" />
              <button type="button" className="sa-link is-danger" onClick={() => update('storeLinks', form.storeLinks.filter((_: unknown, i: number) => i !== index))} aria-label="حذف">✕</button>
            </div>)}
            <button type="button" className="btn btn-ghost btn-sm ga-add" onClick={() => update('storeLinks', [...form.storeLinks, { store: '', url: '' }])}>+ فروشگاه</button>
          </div>
        </section>

        {!isNew && <section id="updates" className="sa-card"><header className="sa-card-head"><h2>آپدیت‌ها، پچ‌ها و DLC</h2><small>هر مورد می‌تواند لینک دانلود جداگانه داشته باشد</small></header>
          <UpdatesEditor gameId={Number(id)} onVersion={(version) => setForm((current) => (current ? { ...current, version } : current))} />
        </section>}

        <section id="seo" className="sa-card"><header className="sa-card-head"><h2>سئو</h2></header>
          {field('seoTitle', 'عنوان سئو (خالی = خودکار)', { maxLength: 120 })}
          <label className="sa-field"><span>توضیح متا (خالی = خلاصه)</span><textarea className="input" rows={2} maxLength={320} value={form.seoDescription} onChange={(e) => update('seoDescription', e.target.value)} /></label>
          <div className="sa-serp" aria-label="پیش‌نمایش در گوگل"><small dir="ltr">/games/{form.slug || 'slug'}</small><b>{form.seoTitle || `نقد، بررسی و دانلود بازی ${form.title || '…'}`}</b><p>{(form.seoDescription || form.summary || 'توضیحی ثبت نشده است.').slice(0, 160)}</p></div>
        </section>
      </div>

      <aside className="sa-stack sa-editor-side">
        <section className="sa-card ga-preview">
          {form.cover ? <img src={form.cover} alt="" /> : <span className="ga-preview-ph">بدون کاور</span>}
          <b>{form.title || 'نام بازی'}</b>
          <small className="sa-sub">{platforms.join(' · ') || 'پلتفرمی انتخاب نشده'}</small>
          <div className="sa-row"><span className={`sa-state ${form.status === 'PUBLISHED' ? 'is-ok' : ''}`}>{form.status === 'PUBLISHED' ? 'منتشرشده' : 'پیش‌نویس'}</span>{form.score !== '' && <span className="ga-score num">{fa(Number(form.score))}</span>}</div>
          <label className="sa-field"><span>وضعیت</span><select className="select" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option></select></label>
        </section>
        <section className="sa-card">
          <header className="sa-card-head"><h2>چک‌لیست صفحه</h2><small className="num">{fa(Object.keys(HEALTH_CHECKS).length - issues.length)}/{fa(Object.keys(HEALTH_CHECKS).length)}</small></header>
          <ul className="ga-checklist">{Object.entries(HEALTH_CHECKS).map(([key, label]) => <li key={key} className={issues.includes(key as keyof typeof HEALTH_CHECKS) ? 'is-missing' : 'is-ok'}>{issues.includes(key as keyof typeof HEALTH_CHECKS) ? '○' : '✓'} {label.replace('بدون ', '')}</li>)}</ul>
          <p className="sa-hint">برای بازی‌های در راه، نقد، نمره و لینک دانلود لازم نیست.</p>
        </section>
      </aside>
    </div>
  </GamesShell>
}
