'use client'

import Link from '@/components/AppLink'
import { useEffect, useState } from 'react'
import CoverField from '../../cms/CoverField'
import type { StoreSettings } from '@/modules/store/domain/store'
import { Notice, StoreShell, send, useJson } from '../shared'
import SectionSettingsHistoryLink from '@/components/admin/SectionSettingsHistoryLink'

/** Storefront merchandising: landing slides, promo banners, offer title, badges and thresholds. */
export default function StoreSettingsPage() {
  const { data, error } = useJson<{ settings: StoreSettings; settingsRevision?: string }>('/api/admin/store/settings')
  const [revision, setRevision] = useState('')
  const [form, setForm] = useState<StoreSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [baselineBusy, setBaselineBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { if (data) { setForm(data.settings); setRevision(data.settingsRevision || '') } }, [data])
  if (!form) return <StoreShell title="ویترین فروشگاه">{error ? <Notice tone="error">{error}</Notice> : <div className="sa-skeleton" aria-busy="true" />}</StoreShell>
  const update = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => setForm((current) => (current ? { ...current, [key]: value } : current))

  async function save() {
    setBusy(true); setResult(null)
    const response = await send<{ settings: StoreSettings; settingsRevision?: string }>('/api/admin/store/settings', 'POST', form, revision ? { 'If-Match': revision } : {})
    setBusy(false)
    if (!response.ok) { setResult({ tone: 'error', text: response.error }); return }
    setForm(response.data.settings); setRevision(response.data.settingsRevision || ''); setResult({ tone: 'ok', text: 'تنظیمات ویترین ذخیره شد' })
  }
  async function baseline() {
    setBaselineBusy(true); setResult(null)
    const response = await send<{ jobId: number }>('/api/admin/store/settings', 'POST', { op: 'price-history-baseline' })
    setBaselineBusy(false)
    setResult(response.ok ? { tone: 'ok', text: `ثبت قیمت‌های فعلی به صف اضافه شد؛ کار شمارهٔ ${response.data.jobId}` } : { tone: 'error', text: response.error })
  }

  return <StoreShell title="ویترین فروشگاه" actions={<><SectionSettingsHistoryLink section="storefront" /><Link href="/products" target="_blank" className="btn btn-ghost">پیش‌نمایش</Link><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    <div className="sa-stack">
      <section className="sa-card">
        <header className="sa-card-head"><h2>اسلایدر صفحهٔ اصلی فروشگاه</h2><button type="button" className="btn btn-ghost btn-sm" disabled={form.slides.length >= 8} onClick={() => update('slides', [...form.slides, { image: '', title: '', subtitle: '', href: '', cta: '' }])}>+ اسلاید</button></header>
        <p className="sa-hint">بدون اسلاید، بخش معرفی فروشگاه نمایش داده می‌شود. اندازهٔ پیشنهادی تصویر: ۱۶۰۰×۵۰۰.</p>
        {form.slides.map((slide, index) => <div key={index} className="sa-repeat">
          <CoverField value={slide.image} title={slide.title} onChange={(value) => update('slides', form.slides.map((row, i) => (i === index ? { ...row, image: value } : row)))} onBusy={setBusy} mode="section" />
          <div className="sa-grid">
            {(['title', 'subtitle', 'href', 'cta'] as const).map((key) => <label key={key} className="sa-field"><span>{{ title: 'عنوان', subtitle: 'زیرعنوان', href: 'لینک (مثلاً /products?category=mobile)', cta: 'متن دکمه' }[key]}</span><input className="input" dir={key === 'href' ? 'ltr' : undefined} value={slide[key]} onChange={(event) => update('slides', form.slides.map((row, i) => (i === index ? { ...row, [key]: event.target.value } : row)))} /></label>)}
          </div>
          <div className="sa-row-actions"><button type="button" className="sa-link" disabled={index === 0} onClick={() => { const list = [...form.slides]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; update('slides', list) }}>بالا</button><button type="button" className="sa-link is-danger" onClick={() => update('slides', form.slides.filter((_, i) => i !== index))}>حذف</button></div>
        </div>)}
      </section>
      <section className="sa-card">
        <header className="sa-card-head"><h2>بنرهای تبلیغاتی</h2><button type="button" className="btn btn-ghost btn-sm" disabled={form.banners.length >= 4} onClick={() => update('banners', [...form.banners, { image: '', title: '', href: '' }])}>+ بنر</button></header>
        <p className="sa-hint">دو بنر اول زیر پیشنهادهای شگفت‌انگیز و دو بنر بعدی زیر ریل دسته‌ها نمایش داده می‌شوند.</p>
        {form.banners.map((banner, index) => <div key={index} className="sa-repeat">
          <CoverField value={banner.image} title={banner.title} onChange={(value) => update('banners', form.banners.map((row, i) => (i === index ? { ...row, image: value } : row)))} onBusy={setBusy} mode="section" />
          <div className="sa-grid">
            <label className="sa-field"><span>عنوان (متن جایگزین)</span><input className="input" value={banner.title} onChange={(event) => update('banners', form.banners.map((row, i) => (i === index ? { ...row, title: event.target.value } : row)))} /></label>
            <label className="sa-field"><span>لینک</span><input className="input" dir="ltr" value={banner.href} onChange={(event) => update('banners', form.banners.map((row, i) => (i === index ? { ...row, href: event.target.value } : row)))} /></label>
          </div>
          <button type="button" className="sa-link is-danger" onClick={() => update('banners', form.banners.filter((_, i) => i !== index))}>حذف بنر</button>
        </div>)}
      </section>
      <section className="sa-card">
        <header className="sa-card-head"><h2>بخش‌ها و رفتار فروشگاه</h2></header>
        <div className="sa-grid">
          <label className="sa-field"><span>عنوان باند تخفیف</span><input className="input" value={form.offerTitle} onChange={(event) => update('offerTitle', event.target.value)} /></label>
          <label className="sa-field"><span>آستانهٔ «موجودی رو به اتمام»</span><input className="input" type="number" min={0} value={form.lowStockDefault} onChange={(event) => update('lowStockDefault', Number(event.target.value))} /></label>
        </div>
        <label className="sa-check"><input type="checkbox" checked={form.showCategories} onChange={(event) => update('showCategories', event.target.checked)} />نمایش «خرید بر اساس دسته‌بندی»</label>
        <label className="sa-check"><input type="checkbox" checked={form.showFileStore} onChange={(event) => update('showFileStore', event.target.checked)} />نمایش ورودی فروشگاه فایل</label>
        <div className="sa-grid"><label className="sa-field"><span>عنوان ورودی فروشگاه فایل</span><input className="input" value={form.fileStoreTitle} maxLength={80} onChange={event => update('fileStoreTitle', event.target.value)} /></label><label className="sa-field"><span>توضیح ورودی فروشگاه فایل</span><textarea className="input" value={form.fileStoreDescription} maxLength={240} onChange={event => update('fileStoreDescription', event.target.value)} /></label></div>
        <label className="sa-check"><input type="checkbox" checked={form.showBrands} onChange={(event) => update('showBrands', event.target.checked)} />نمایش برندهای محبوب</label>
        <label className="sa-check"><input type="checkbox" checked={form.showPriceHistory} onChange={(event) => update('showPriceHistory', event.target.checked)} />نمایش تاریخچهٔ قیمت عمومی محصول</label>
        <label className="sa-check"><input type="checkbox" checked={form.showFrequentlyBoughtTogether} onChange={(event) => update('showFrequentlyBoughtTogether', event.target.checked)} />نمایش محصولات خریداری‌شده همراه هم</label>
        <label className="sa-check"><input type="checkbox" checked={form.showProductRelationships} onChange={(event) => update('showProductRelationships', event.target.checked)} />نمایش ارتباط‌های مرتبط، مکمل و سازگار محصول</label>
        <label className="sa-check"><input type="checkbox" checked={form.showProductBundles} onChange={(event) => update('showProductBundles', event.target.checked)} />نمایش و خرید بسته‌های محصول</label>
        <div className="sa-grid">
          <label className="sa-field"><span>بازهٔ بررسی خریدهای همراه (روز)</span><input className="input" type="number" min={30} max={365} step={1} value={form.frequentlyBoughtDays} onChange={(event) => update('frequentlyBoughtDays', Number(event.target.value))} /></label>
          <label className="sa-field"><span>حداقل تعداد خریداران مستقل</span><input className="input" type="number" min={3} max={100} step={1} value={form.frequentlyBoughtMinimumBuyers} onChange={(event) => update('frequentlyBoughtMinimumBuyers', Number(event.target.value))} /></label>
        </div>
        <p className="sa-hint">فقط سفارش‌های پرداخت‌شده و تأییدشده بررسی می‌شوند؛ سفارش دارای مرجوعی پذیرفته‌شده کنار گذاشته می‌شود. اطلاعات خریداران نمایش داده نمی‌شود.</p>
        <label className="sa-check"><input type="checkbox" checked={form.priceDropNotifications} onChange={(event) => update('priceDropNotifications', event.target.checked)} />اعلان کاهش قیمت برای دنبال‌کنندگان محصول</label>
        <label className="sa-field"><span>بازهٔ نمایش تاریخچهٔ قیمت (روز)</span><input className="input" type="number" min={30} max={730} step={1} value={form.priceHistoryDays} onChange={(event) => update('priceHistoryDays', Number(event.target.value))} /></label>
        <p className="sa-hint">بین ۳۰ و ۷۳۰ روز؛ خاموش‌کردن نمایش، رکوردهای قیمت را حذف نمی‌کند. فقط قیمت عادیِ عرضه‌شده نمایش داده می‌شود.</p>
        <button type="button" className="btn btn-ghost" disabled={baselineBusy || busy} onClick={() => void baseline()}>{baselineBusy ? 'در حال ثبت کار…' : 'شروع ثبت قیمت‌های فعلی'}</button>
        <p className="sa-hint">برای محصولات قبلی یک نقطه از قیمت فعلی ثبت می‌کند؛ قیمت‌های گذشته بازسازی نمی‌شوند. پیشرفت کار در مدیریت عملکرد و صف کارها قابل پیگیری است.</p>
        <label className="sa-field"><span>یادداشت زیر سبد خرید (قوانین مرجوعی، زمان ارسال…)</span><textarea className="input" rows={2} maxLength={300} value={form.cartNote} onChange={(event) => update('cartNote', event.target.value)} /></label>
        <label className="sa-field"><span>نشان‌های اعتماد زیر جعبهٔ خرید (هر خط یک مورد، حداکثر ۶)</span><textarea className="input" rows={4} value={form.badges.join('\n')} onChange={(event) => update('badges', event.target.value.split('\n').slice(0, 6))} /></label>
      </section>
      <section className="sa-card sa-links">
        <header className="sa-card-head"><h2>تنظیمات مرتبط</h2></header>
        <Link href="/admin/delivery" className="sa-link">زمان‌بندی و هزینهٔ ارسال</Link>
        <Link href="/admin/menus?tab=sections" className="sa-link">مگامنوی فروشگاه</Link>
        <Link href="/admin/promotions" className="sa-link">کدهای تخفیف</Link>
        <Link href="/admin/productgroups" className="sa-link">گروه‌های مشخصات و تنوع (رنگ، حافظه…)</Link>
        <Link href="/admin/builder" className="sa-link">قالب صفحهٔ محصول و فروشگاه (صفحه‌ساز)</Link>
      </section>
    </div>
  </StoreShell>
}
