import Icon from '@/components/site/Icon'
import s from './PromptMaster.module.css'

export default function OutputPlaceholder({ busy }: { busy: boolean }) {
  return <div className={s.emptyOutput}>
    <div className={s.previewSheet} aria-hidden="true"><div><span><Icon name="sparkles" size={17}/>پیش‌نمایش ساختار</span><Icon name="file" size={16}/></div><p><b>هدف و نقش</b><i/><i/></p><p><b>زمینه و جزئیات</b><i/><i/></p><p><b>قالب خروجی</b><i/></p><span className={s.previewSeal}><Icon name="check" size={15}/></span></div>
    <h3>{busy ? 'ایده‌ات در حال شکل‌گرفتن است' : 'ایدهٔ ساده، دستور روشن'}</h3><p>{busy ? 'پرامپت اینجا آماده می‌شود؛ کمی صبر کن.' : 'ایده‌ات را بنویس و «ساخت پرامپت» را بزن. خروجی را همین‌جا ویرایش، کپی یا دریافت کن.'}</p>
    <div className={s.structure}><span>ایدهٔ تو</span><Icon name="arrow" size={13}/><span>ساختار دقیق</span><Icon name="arrow" size={13}/><span>پرامپت آماده</span></div>
  </div>
}
