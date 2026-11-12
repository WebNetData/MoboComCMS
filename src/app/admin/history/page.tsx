'use client'
import { configurationForms } from '@/modules/content/domain/history-forms'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from '@/components/AppLink'
import '@/components/admin/authoring-controls.css'

type Version = { version: number; changed: string[]; source: string; by: string; at: string }
type Provenance = { sources: { source: string; externalId: string }[]; imports: { job: number; adapter: string; file: string; by: string; at: string; action: string; undone: boolean; fields: string[] }[]; editedSince: string[] | boolean } | null
type Detail = { version: number; source: string; by: string; at: string; diff: { field: string; before: string; after: string }[] }
const SOURCE: Record<string, string> = { baseline: 'وضعیت پیش از ثبت نسخه‌ها', edit: 'ویرایش', restore: 'بازگردانی', import: 'ورود گروهی' }
const fa = (value: number) => value.toLocaleString('fa-IR')
const FIELD_NAMES: Record<string, string> = { __relations: 'روابط و تنظیمات', title: 'عنوان', name: 'نام', summary: 'خلاصه', description: 'توضیحات', content: 'متن', categoryId: 'دسته‌بندی', year: 'سال', image: 'عکس', cover: 'کاور', status: 'وضعیت', supportEmail: 'ایمیل پشتیبانی', supportTelegram: 'تلگرام پشتیبانی', siteUrl: 'نشانی سایت', usdRateToman: 'نرخ دلار', seoDescription: 'توضیحات جست‌وجو', ogImage: 'تصویر اشتراک‌گذاری', googleVerification: 'تأیید گوگل', subscriptionPrefix: 'پیشوند اشتراک', storeEnabled: 'فروشگاه', publicApiEnabled: 'API عمومی', personalRecommendationsEnabled: 'پیشنهادهای شخصی', imagesMinTrust: 'سطح درج تصویر', linksMinTrust: 'سطح درج پیوند', newUserMaxLinks: 'پیوندهای تازه‌وارد', newUserTopicsPerDay: 'موضوع روزانه', editWindowHours: 'مهلت ویرایش', flagHideWeight: 'وزن گزارش', maxTagsPerTopic: 'تعداد برچسب', membersCreateTags: 'ساخت برچسب', reactions: 'واکنش‌ها', reactionWeights: 'وزن واکنش‌ها', trust: 'سطح اعتماد', approveNewUserPosts: 'تأیید پیام‌های نخست', messagesEnabled: 'پیام خصوصی', messagesMinTrust: 'سطح پیام خصوصی', pollsMinTrust: 'سطح نظرسنجی', watchedWords: 'واژه‌های تحت نظر', clubsEnabled: 'کلوب‌ها', clubsMinTrust: 'سطح ایجاد کلوب', clubsMaxOwned: 'تعداد کلوب', levels: 'درجه‌های کاربری' }
const SECTION_FIELD_NAMES: Record<string, string> = { rails: 'چیدمان بخش‌ها', heroIds: 'اسلایدر', editorIds: 'انتخاب سردبیر', blockCategoryIds: 'دسته‌های صفحهٔ اصلی', pageSize: 'تعداد مطالب', autoApproveComments: 'تأیید خودکار نظرها', shelfSize: 'اندازهٔ قفسه', genreShelfCount: 'قفسه‌های ژانر', topRatedMin: 'حداقل امتیاز برترین‌ها', showImdb: 'نمایش امتیاز IMDb', personFollowEnabled: 'دنبال‌کردن عوامل', showPersonBiography: 'زندگی‌نامهٔ عوامل', enableAssSubtitles: 'زیرنویس دارای استایل', enableSeparateAudio: 'صدای جداگانه', findSubtitles: 'یافتن زیرنویس همراه فایل', readEmbeddedSubtitles: 'خواندن زیرنویس داخل فایل', fullReadSubtitles: 'دریافت کامل فایل برای زیرنویس', subtitleScanMaxGB: 'سقف حجم بررسی زیرنویس', introUrl: 'ویدیوی اینترو', introSkipAfter: 'رد کردن اینترو پس از', introFrequency: 'دفعات نمایش اینترو', externalPlayers: 'پخش در برنامهٔ دیگر', heroTrackIds: 'آهنگ‌های اسلایدر', featuredAlbumIds: 'آلبوم‌های ویژه', chartSize: 'اندازهٔ جدول', chartSource: 'منبع جدول', latestSize: 'تعداد تازه‌ترین‌ها', showLyrics: 'نمایش ترانه', showArtistBiography: 'زندگی‌نامهٔ هنرمند', showArtistFollow: 'دنبال‌کردن هنرمند', showRelatedTracks: 'آهنگ‌های مرتبط', libraryEnabled: 'کتابخانهٔ کاربران', showMemberScore: 'نمایش نمرهٔ کاربران', newsKeywords: 'کلیدواژه‌های قدیمی', categoryShelfCount: 'قفسه‌های دسته‌بندی', newsCount: 'تعداد خبرها', suggestionIds: 'انتخاب نرم‌افزارها', staleDays: 'مهلت تازگی', enabled: 'روشن بودن', leadDays: 'فاصلهٔ اولین روز ارسال', daysAhead: 'روزهای قابل انتخاب', cutoffHour: 'ساعت پایان پذیرش', closedWeekdays: 'روزهای تعطیل هفتگی', holidays: 'تعطیلات مناسبتی', slots: 'بازه‌های ارسال', feeRial: 'هزینهٔ ارسال', freeOverRial: 'ارسال رایگان از مبلغ', slides: 'اسلایدر', banners: 'بنرها', offerTitle: 'عنوان پیشنهاد ویژه', lowStockDefault: 'آستانهٔ کم‌بودن موجودی', staffDeliveryHours: 'زمان تحویل کارشناس', showBrands: 'نمایش برندها', showCategories: 'نمایش دسته‌ها', showPriceHistory: 'نمایش تاریخچهٔ قیمت', priceHistoryDays: 'بازهٔ تاریخچهٔ قیمت', priceDropNotifications: 'اعلان کاهش قیمت', showFrequentlyBoughtTogether: 'پیشنهاد خرید با هم', frequentlyBoughtDays: 'بازهٔ خرید با هم', frequentlyBoughtMinimumBuyers: 'حداقل خریدار خرید با هم', showProductRelationships: 'محصولات مرتبط', showProductBundles: 'بسته‌های محصول', badges: 'نشان‌ها', cartNote: 'یادداشت سبد خرید', windowDays: 'مهلت مرجوعی', cancelBefore: 'لغو توسط مشتری تا', autoRefundCancel: 'بازپرداخت خودکار لغو', requirePhotos: 'عکس الزامی', codeReturnDays: 'مهلت برگشت کد', policy: 'متن قوانین', kind: 'نوع', text: 'متن', color: 'رنگ', position: 'محل قرارگیری', size: 'اندازه', opacity: 'شفافیت', margin: 'فاصله از لبه', shadow: 'سایه', scope: 'محدوده', sections: 'بخش‌ها', roles: 'نقش عکس‌ها', minWidth: 'حداقل عرض', include: 'عکس‌های همیشه', exclude: 'عکس‌های هرگز', titleTemplate: 'قالب عنوان صفحه‌ها', homeTitle: 'عنوان صفحهٔ اول', keywords: 'کلمه‌های کلیدی', brandLatin: 'نام لاتین برند', logo: 'لوگو', verification: 'کدهای تأیید مالکیت', sameAs: 'صفحه‌های رسمی', organization: 'مشخصات سازمان', indexNow: 'ایندکس فوری', allowAiCrawlers: 'دسترسی دستیارهای هوش مصنوعی', contentDocument: 'محتوای بلوکی', fields: 'فیلدها', enforce: 'الزام تکمیل', usernamePrefix: 'پیشوند نام کاربری', seals: 'نمادها' }
const SETTINGS_FORMS = configurationForms
Object.assign(SECTION_FIELD_NAMES, { compatibleAudio: 'ساخت صدای سازگار', audioTimeoutSeconds: 'مهلت پردازش صدا', botEnabled: 'دستیار پشتیبانی', botName: 'نام دستیار', welcome: 'خوش‌آمد', knowledge: 'دانستنی‌های پشتیبانی', maxBotReplies: 'تعداد پاسخ دستیار', hours: 'ساعات کاری', offlineMessage: 'پیام خارج از ساعت', askContact: 'درخواست راه ارتباطی', places: 'محل نمایش پشتیبانی' })
// A page-builder document's version: the whole layout and a few facts to compare at a glance.
Object.assign(FIELD_NAMES, { configurationDocument: 'طرح کامل صفحه', mode: 'حالت ساخت', sections: 'تعداد بخش‌ها', widgets: 'تعداد ابزارک‌ها', advancedCode: 'کد پیشرفته (اسکریپت)' })
const fieldName = (field: string) => FIELD_NAMES[field] || SECTION_FIELD_NAMES[field] || field
const valueText = (value: string) => value === 'true' ? 'فعال' : value === 'false' ? 'غیرفعال' : value || '—'
const when = (iso: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(iso))

function History() {
  const params = useSearchParams()
  const type = params.get('type') || '', id = params.get('id') || ''
  const settingsForm = Object.hasOwn(SETTINGS_FORMS, type) ? SETTINGS_FORMS[type] : null
  // A page-builder document (home, a page, a layout, a theme template) is versioned as `builder:<page id>`.
  const builderPage = /^builder:([a-zA-Z0-9-]{1,40})$/.exec(type)?.[1] ?? null
  const base = `/api/admin/history?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [provenance, setProvenance] = useState<Provenance>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(base, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) { setVersions(body.versions); setProvenance(body.provenance || null) } else setMessage({ text: body?.error || 'تاریخچه بارگذاری نشد.', error: true })
  }, [base])
  useEffect(() => { void load() }, [load])

  async function open(version: number) {
    const response = await fetch(`${base}&version=${version}`, { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) setDetail(body); else setMessage({ text: body?.error || 'این نسخه باز نشد.', error: true })
  }

  async function restore(version: number) {
    if (!window.confirm(builderPage ? `طرح صفحه به نسخهٔ ${fa(version)} برگردد؟ طرح فعلی به‌عنوان نسخهٔ قبلی می‌ماند و پیش‌نویس ذخیره‌نشدهٔ صفحه‌ساز کنار گذاشته می‌شود.` : type === 'pages' ? `متن، وضعیت و تنظیمات ثبت‌شدهٔ صفحه به نسخهٔ ${fa(version)} برگردند؟ قالب طراحی، کاور، چیدمان و فرم پیوست هم بازمی‌گردند. نسخه‌های قدیمیِ بدون تنظیمات، تنظیمات فعلی را حفظ می‌کنند. طرح صفحه‌ساز تاریخچهٔ مستقل دارد.` : type.startsWith('settings-') ? `تنظیمات ثبت‌شده به نسخهٔ ${fa(version)} برگردد؟ این کار روی تنظیمات فعال سایت اعمال و خودش هم ثبت می‌شود. اطلاعات محرمانه و تنظیمات ناشناخته بازگردانی نمی‌شوند.${type === 'settings-forum' ? ' تغییر وزن واکنش‌های تالار، بازشماری سابقهٔ واکنش‌ها را در صف قرار می‌دهد.' : ''}` : `محتوا و روابط ثبت‌شدهٔ این مورد به نسخهٔ ${fa(version)} برگردد؟ خود این بازگردانی هم ثبت می‌شود. نسخه‌های قدیمیِ بدون روابط، روابط فعلی را حفظ می‌کنند. قیمت، موجودی و تاریخچهٔ مالی محصول برنمی‌گردد. لینک‌های حذف‌شده از نسخه غیرفعال می‌شوند و محدودیت‌های نظارتی حفظ می‌شوند.`)) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/admin/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id: Number(id), version }) }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'بازگردانی انجام نشد.', error: true }); return }
    setMessage({ text: body.version ? `به نسخهٔ ${fa(version)} برگشت (نسخهٔ تازه: ${fa(body.version)}).` : 'این مورد همین حالا مثل آن نسخه است؛ چیزی تغییر نکرد.', error: false })
    setDetail(null); await load()
  }

  const newest = versions?.[0]?.version
  return <div className="sa cm-history" dir="rtl">
    <header className="sa-head"><div><h1>{settingsForm ? `تاریخچهٔ تنظیمات ${settingsForm.label}` : builderPage ? 'تاریخچهٔ طرح صفحه‌ساز' : 'تاریخچهٔ نسخه‌ها'}</h1><p className="sa-sub"><bdi dir="ltr">{type} #{id}</bdi> · پس از هر ذخیره، فیلدهای خودِ مورد به‌صورت یک نسخه نگه داشته می‌شود.</p></div><div className="sa-head-actions">{settingsForm && <Link className="btn btn-ghost btn-sm" href={settingsForm.href}>بازگشت به تنظیمات</Link>}{builderPage && <Link className="btn btn-ghost btn-sm" href={`/admin/builder/${encodeURIComponent(builderPage)}`}>بازگشت به صفحه‌ساز</Link>}<Link className="btn btn-ghost btn-sm" href={`/admin/audit?targetType=${encodeURIComponent(type)}&targetId=${encodeURIComponent(id)}`}>رخدادهای ممیزی این مورد</Link></div></header>
    {message && <p className={`sa-notice ${message.error ? 'is-error' : 'is-ok'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <section className="sa-card" aria-label="نسخه‌ها">
      {!versions ? <p className="sa-sub">در حال دریافت…</p> : versions.length ? <ul className="sa-rows">{versions.map((row) => <li key={row.version} className="sa-code-row">
        <button type="button" className="sa-link" onClick={() => void open(row.version)} aria-expanded={detail?.version === row.version}><span className="sa-grow"><b>نسخهٔ {fa(row.version)} · {SOURCE[row.source] || row.source}</b><small>{row.changed.length ? `تغییر در: ${row.changed.map(fieldName).join('، ')}` : row.source === 'baseline' ? 'نقطهٔ شروع تاریخچه' : 'ایجاد'}</small></span></button>
        <small className="sa-sub">{row.by || '—'} · {when(row.at)}</small>
        {row.version !== newest && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void restore(row.version)}>بازگردانی</button>}
      </li>)}</ul> : <p className="sa-sub">برای این مورد هنوز نسخه‌ای ثبت نشده است؛ با اولین ویرایش، وضعیت فعلی و وضعیت تازه هر دو نگه داشته می‌شوند.</p>}
    </section>
    {provenance && <section className="sa-card" aria-label="منبع داده">
      <header className="sa-card-head"><h2>منبع داده</h2>{provenance.editedSince === true || (Array.isArray(provenance.editedSince) && provenance.editedSince.length > 0) ? <span className="sa-state is-warn">پس از آخرین ورود، این‌جا ویرایش شده</span> : <span className="sa-state is-ok">همان است که آخرین ورود نوشت</span>}</header>
      {Array.isArray(provenance.editedSince) && provenance.editedSince.length > 0 && <p className="sa-sub">فیلدهایی که با مقدار ورودی فرق دارند: <bdi dir="ltr">{provenance.editedSince.map(fieldName).join('، ')}</bdi>. در ورود گروهی، «حفظ ویرایش‌های محلی» را فعال نگه دارید تا این مورد بازنویسی نشود.</p>}
      {provenance.sources.length > 0 && <p className="sa-sub">شناسه در منبع: {provenance.sources.map((row) => <bdi key={`${row.source}:${row.externalId}`} dir="ltr" className="sa-tag">{row.source}: {row.externalId}</bdi>)}</p>}
      <ul className="sa-rows">{provenance.imports.map((row) => <li key={`${row.job}-${row.at}`}><Link href="/admin/imports"><span className="sa-grow"><b>{row.action === 'CREATE' ? 'ساخته شد' : 'به‌روز شد'} · ورود شمارهٔ {fa(row.job)}{row.undone ? ' (برگردانده‌شده)' : ''}</b><small>{row.file || row.adapter}{row.fields.length ? ` · ${row.fields.join('، ')}` : ''}</small></span><small className="sa-sub">{row.by || '—'} · {when(row.at)}</small></Link></li>)}</ul>
    </section>}
    {detail && <section className="sa-card" aria-label={`تغییرات نسخهٔ ${detail.version}`}>
      <header className="sa-card-head"><h2>نسخهٔ {fa(detail.version)} چه چیزی را عوض کرد</h2></header>
      {detail.diff.length ? <div className="sa-table-wrap"><table className="data sa-table" style={{ minWidth: 0 }}>
        <thead><tr><th>فیلد</th><th>قبل</th><th>بعد</th></tr></thead>
        <tbody>{detail.diff.map((row) => <tr key={row.field}><td dir="auto">{fieldName(row.field)}</td><td dir="auto">{valueText(row.before)}</td><td dir="auto">{valueText(row.after)}</td></tr>)}</tbody>
      </table></div> : <p className="sa-sub">این نسخه نقطهٔ شروع است و نسخهٔ قبلی ندارد.</p>}
    </section>}
  </div>
}

/** /admin/history?type=&id= — the versions of one edited item, what each changed, and putting one back. */
export default function HistoryPage() { return <Suspense fallback={null}><History /></Suspense> }
