'use client'
import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'
import PostItemLinks from '../posts/PostItemLinks'
import type { ProductBundleInput } from '@/modules/catalog/domain/product-bundles'
type DraftBundle = Omit<ProductBundleInput, 'components'> & { clientKey?: string; components: (ProductBundleInput['components'][number] & { clientKey?: string })[] }

type VariantChoice = { id: number; name: string }
type Details = { id: number; title: string; titleEn: string; isService?: boolean }
function BundleEditor({ bundle, sourceId, variants, update }: { bundle: DraftBundle; sourceId: number; variants: VariantChoice[]; update: (next: DraftBundle) => void }) {
  const { locale } = useI18n(), fa = locale === 'fa'
  const inputId = useId()
  const [details, setDetails] = useState<Details[]>([]), [choices, setChoices] = useState<{ id: number; variants: VariantChoice[] }[]>([]), [failed, setFailed] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0)
  const refs = bundle.components.filter(component => component.productId !== sourceId).map(component => `product:${component.productId}`).join(',')
  useEffect(() => {
    const controller = new AbortController(); setFailed(false); setLoading(true)
    fetch(`/api/admin/products/relationship-items?variants=1&refs=${encodeURIComponent(refs)}`, { signal: controller.signal }).then(response => { if (!response.ok) throw Error('lookup'); return response.json() }).then(data => { if (!controller.signal.aborted) { setDetails(data.selected || []); setChoices(data.variantChoices || []) } }).catch(() => { if (!controller.signal.aborted) setFailed(true) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refs, attempt])
  const setLinks: Dispatch<SetStateAction<Record<string, any>>> = action => {
    const previous = { itemLinks: bundle.components.filter(component => component.productId !== sourceId).map(component => ({ type: 'product', id: component.productId })) }
    const next = typeof action === 'function' ? action(previous) : action
    const anchor = bundle.components.filter(component => component.productId === sourceId)
    update({ ...bundle, components: [...anchor, ...(next.itemLinks || []).map((ref: { id: number }) => bundle.components.find(component => component.productId === ref.id) || { productId: ref.id, variantId: null, quantity: 1, clientKey: crypto.randomUUID() })] })
  }
  return <>
    <label>{fa ? 'نام بسته' : 'Bundle name'}<input className="input" maxLength={120} required value={bundle.name} onChange={event => update({ ...bundle, name: event.target.value })} /></label>
    <label>{fa ? 'نام انگلیسی بسته' : 'English bundle name'}<input className="input" maxLength={120} value={bundle.nameEn} onChange={event => update({ ...bundle, nameEn: event.target.value })} /></label>
    <label><input type="checkbox" checked={bundle.active} onChange={event => update({ ...bundle, active: event.target.checked })} /> {fa ? 'بسته فعال' : 'Active bundle'}</label>
    <PostItemLinks form={{ itemLinks: bundle.components.filter(component => component.productId !== sourceId).map(component => ({ type: 'product', id: component.productId })) }} setForm={setLinks} types={['product']} maxItems={11} endpoint={`/api/admin/products/relationship-items?sourceId=${sourceId}`} heading={{ fa: 'اجزای همراه بسته', en: 'Additional bundle components' }} hint={{ fa: 'محصول اصلی همیشه در بسته هست. حداقل یک کالای دیگر انتخاب کنید؛ قیمت از هر کالا محاسبه می‌شود.', en: 'The source product is always included. Select at least one other item; prices come from each product.' }} />
    {loading && <p role="status" className="muted">{fa ? 'در حال دریافت گونه‌های محصول…' : 'Loading product variants…'}</p>}
    {failed && <div role="alert"><p>{fa ? 'دریافت گونه‌های محصول ناموفق بود.' : 'Could not load product variants.'}</p><button type="button" className="btn btn-secondary" onClick={() => setAttempt(value => value + 1)}>{fa ? 'تلاش دوباره برای گونه‌ها' : 'Retry variants'}</button></div>}
    {bundle.components.map((component, index) => {
      const detail = details.find(row => row.id === component.productId), options = component.productId === sourceId ? variants : choices.find(row => row.id === component.productId)?.variants || []
      const name = component.productId === sourceId ? (fa ? 'محصول اصلی' : 'Source product') : (fa ? detail?.title : detail?.titleEn || detail?.title) || `#${component.productId ?? '?'}`
      const displayName = detail?.isService ? `${name} (${fa ? 'خدمت' : 'Service'})` : name
      const pending = component.productId !== sourceId && loading
      const replace = (change: Partial<typeof component>) => update({ ...bundle, components: bundle.components.map((row, i) => i === index ? { ...row, ...change } : row) })
      return <fieldset className="card" aria-label={displayName} key={component.clientKey || `${component.productId}:${component.variantId || 0}`}><legend>{displayName}</legend>
        <label htmlFor={`${inputId}-${index}-variant`}>{fa ? 'گونهٔ ثابت بسته' : 'Fixed bundle variant'}</label><select id={`${inputId}-${index}-variant`} className="input" disabled={component.productId !== sourceId && (loading || failed)} value={component.variantId || ''} onChange={event => replace({ variantId: Number(event.target.value) || null })}>
          <option value="">{pending ? (fa ? 'در حال دریافت…' : 'Loading…') : options.length ? (fa ? 'گونه را انتخاب کنید' : 'Select a variant') : (fa ? 'بدون گونه' : 'No variant')}</option>
          {component.variantId && !options.some(variant => variant.id === component.variantId) && <option value={component.variantId}>#{component.variantId} — {pending ? (fa ? 'در حال دریافت…' : 'Loading…') : (fa ? 'در دسترس نیست' : 'Unavailable')}</option>}
          {options.map(variant => <option key={variant.id} value={variant.id}>{variant.name || `#${variant.id}`}</option>)}
        </select>
        <label>{fa ? 'تعداد در بسته' : 'Quantity in bundle'}<input className="input" type="number" min={1} max={30} step={1} required value={component.quantity || ''} onChange={event => { const raw = event.target.value; const quantity = raw.trim() ? Number(raw) : 0; if (Number.isSafeInteger(quantity)) replace({ quantity }) }} /></label>
      </fieldset>
    })}
  </>
}

export default function ProductBundlesEditor({ form, setForm, sourceId }: { form: Record<string, any>; setForm: Dispatch<SetStateAction<Record<string, any>>>; sourceId: number | null }) {
  const { locale } = useI18n(), fa = locale === 'fa', bundles: DraftBundle[] = Array.isArray(form.bundles) ? form.bundles : []
  const variants = (Array.isArray(form.variants) ? form.variants : []).filter(variant => Number.isSafeInteger(variant.id)).map(variant => ({ id: variant.id, name: variant.name }))
  const setBundles = (next: DraftBundle[]) => setForm(current => ({ ...current, bundles: next }))
  return <section className="grid-column-span-3 card" aria-label={fa ? 'بسته‌های قابل خرید' : 'Purchasable bundles'}>
    <h3>{fa ? 'بسته‌های قابل خرید' : 'Purchasable bundles'}</h3>
    <p className="muted">{fa ? 'همهٔ اجزا با هم وارد سبد می‌شوند و سپس مانند کالاهای عادی قابل ویرایش‌اند. این بسته تخفیف جداگانه‌ای ندارد.' : 'All components enter the cart together and can then be edited as normal items. No separate bundle discount applies.'}</p>
    {!sourceId ? <p className="muted">{fa ? 'ابتدا محصول را ذخیره کنید، سپس بسته را در ویرایش محصول بسازید.' : 'Save the product first, then compose bundles while editing it.'}</p> : <>
      {bundles.map((bundle, index) => <fieldset className="card mb-3" key={bundle.id || bundle.clientKey}><legend>{bundle.name || (fa ? `بسته ${index + 1}` : `Bundle ${index + 1}`)}</legend>
        <BundleEditor bundle={bundle} sourceId={sourceId} variants={variants} update={next => setBundles(bundles.map((row, i) => i === index ? next : row))} />
        <button type="button" className="btn btn-secondary" onClick={() => setBundles(bundles.filter((_, i) => i !== index))}>{fa ? 'حذف بسته' : 'Remove bundle'}</button>
      </fieldset>)}
      <button type="button" className="btn btn-secondary" disabled={bundles.length >= 8} onClick={() => setBundles([...bundles, { clientKey: crypto.randomUUID(), name: '', nameEn: '', active: false, components: [{ clientKey: crypto.randomUUID(), productId: sourceId, variantId: variants[0]?.id || null, quantity: 1 }] }])}>{fa ? 'افزودن بسته' : 'Add bundle'}</button>
    </>}
  </section>
}
