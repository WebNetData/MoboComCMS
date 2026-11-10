'use client'
import type { ProductionBatchView } from '@/modules/ai/client/production'
import css from './Production.module.css'
import ProductionQuality from './ProductionQuality'
type ProductPart=NonNullable<NonNullable<ProductionBatchView['items'][number]['output']>['product']>
/** What the assistant proposes for the product itself, shown before the save so it is reviewed like the text. */
function ProductFields({product}:{product:ProductPart}){
  const specs=Object.entries(product.specifications||{})
  return <section className={css.product} aria-label="فیلدهای پیشنهادی محصول">
    <h4>فیلدهای محصول</h4>
    <dl>{product.sku&&<><dt>SKU</dt><dd dir="ltr">{product.sku}</dd></>}{product.warranty&&<><dt>گارانتی</dt><dd>{product.warranty}</dd></>}{product.seoTitle&&<><dt>عنوان سئو</dt><dd>{product.seoTitle}</dd></>}{specs.map(([k,v])=><div key={k} style={{display:'contents'}}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {product.variants?.length>0&&<table><caption>گونه‌ها (فقط گونه‌های قیمت‌دار و سازگار با دسته ذخیره می‌شوند)</caption><thead><tr><th>SKU</th><th>نام</th><th>قیمت</th><th>موجودی</th></tr></thead><tbody>{product.variants.map(v=><tr key={v.sku}><td dir="ltr">{v.sku}</td><td>{v.name}</td><td>{v.price?Number(v.price).toLocaleString('fa-IR'):'—'}</td><td>{v.stock<0?'نامحدود':v.stock.toLocaleString('fa-IR')}</td></tr>)}</tbody></table>}
    {product.faqs?.length>0&&<p className="muted">{product.faqs.length.toLocaleString('fa-IR')} پرسش متداول پیشنهاد شده است.</p>}
  </section>
}
const states:Record<string,string>={READY:'آمادهٔ تولید',RUNNING:'در حال تولید',REVIEW:'آمادهٔ بازبینی',SAVED:'پیش‌نویس ذخیره شد',FAILED:'نیازمند بررسی'}
export default function ProductionItems({batch,busy,onAction}:{batch:ProductionBatchView;busy:boolean;onAction:(action:string,id:string,extra?:Record<string,unknown>)=>void}) {
  return <div className="grid gap-4">{batch.items.map(item=><article key={item.id} id={'item-'+item.id} className={css.item} aria-label={'ردیف '+(item.position+1)}>
    <div className="flex items-center justify-between gap-2"><h3>{item.position+1}. {item.seed.topic}</h3><span className="badge">{states[item.state]||item.state}</span></div>
    {item.error&&<p role="status" className="error-text">{item.error}</p>}
    {item.state==='RUNNING'&&<p className="muted">اگر مرورگر بسته شده، پس از پایان مهلت این درخواست «ادامه و بازیابی همین مرحله» را بزنید. پاسخ نامطمئن خودکار تکرار نمی‌شود.</p>}
    {item.output&&<details><summary>بازبینی متن، توضیح تصویر و تصاویر تولیدشده</summary><h4>{item.output.title}</h4><p className={css.prose}>{item.output.excerpt}</p>{item.output.sections.map((s,i)=><section key={i}><h4>{s.heading}</h4><p className={css.prose}>{s.text}</p><p className="muted">طرح تصویر: {s.imagePrompt}</p></section>)}{item.output.product&&<ProductFields product={item.output.product}/>}<div className={css.preview}>{item.images.map(image=><figure key={image.index}><img src={image.url} alt={image.alt}/><figcaption>{image.index===0?'تصویر شاخص':`تصویر داخلی ${image.index}`} · {image.caption}</figcaption></figure>)}</div></details>}
    {item.state==='REVIEW'&&batch.status!=='CANCELLED'&&<ProductionQuality batchId={batch.id} itemId={item.id} version={item.version} busy={busy} kind={batch.kind} onSave={(acknowledged,publish)=>onAction('save',item.id,{acknowledged,publish})}/>}
    <div className="flex flex-wrap gap-2">{(item.state==='FAILED'||item.state==='RUNNING'&&item.expiresAt&&Date.parse(item.expiresAt)<Date.now())&&<button type="button" className="btn btn-ghost btn-sm" disabled={busy||batch.status==='CANCELLED'} onClick={()=>onAction('retry',item.id)}>ادامه و بازیابی همین مرحله</button>}{(item.state==='FAILED'||item.state==='RUNNING'&&item.expiresAt&&Date.parse(item.expiresAt)<Date.now())&&(item.output?batch.config.generation?.image.source:batch.config.generation?.text.source)!=='api'&&<button type="button" className="btn btn-ghost btn-sm" disabled={busy||batch.status==='CANCELLED'} title="فقط گفتگوی پل بازنشانی می‌شود؛ تولید ممکن است تکرار شود. متن و تصاویر ذخیره‌شده حفظ می‌شوند." onClick={()=>onAction('retry-fresh',item.id)}>گفتگوی تازه؛ احتمال تولید دوباره</button>}{item.saved&&<a className="btn btn-ghost btn-sm" href={item.saved.href}>بازکردن برای ویرایش</a>}</div>
  </article>)}</div>
}
