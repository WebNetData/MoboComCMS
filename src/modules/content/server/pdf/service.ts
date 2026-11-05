import { isModuleEnabled } from '@/extensions/server/modules'
import { siteBase } from '@/modules/site/server/seo'
import { pdfRef,pdfKind,PdfError,type PdfSettings,type PdfKind,type PdfDesign } from '@/modules/content/domain/pdf'
import { getPdfSettings } from './settings'

let running=0
export async function withPdfSlot<T>(work:()=>Promise<T>){if(running>=2)throw new PdfError('دو فایل در حال آماده‌سازی است؛ چند لحظهٔ دیگر دوباره تلاش کنید',429);running++;try{return await work()}finally{running--}}
export async function contentPdfAvailable(key:string){const ref=pdfRef(key);if(!ref||!await isModuleEnabled('content-pdf'))return false;const s=await getPdfSettings(),kind=pdfKind(ref.type);return s.enabled&&!!kind&&(ref.type==='title'?s.assignments.movie.enabled||s.assignments.series.enabled:s.assignments[kind].enabled)}
export async function generateContentPdf(key:string){
  const ref=pdfRef(key)
  if(!ref||!await isModuleEnabled('content-pdf'))throw new PdfError('PDF در دسترس نیست',404)
  const settings=await getPdfSettings();if(!settings.enabled)throw new PdfError('PDF غیرفعال است',404)
  const {contentPdfSource}=await import('./source'),content=await contentPdfSource(ref),choice=settings.assignments[content.kind]
  if(!choice.enabled)throw new PdfError('دریافت PDF برای این نوع محتوا غیرفعال است',404)
  const {renderContentPdf}=await import('./render'),base=await siteBase(),bytes=await withPdfSlot(()=>renderContentPdf(content,settings,base,choice.design))
  const name=Array.from(content.title.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069/\\<>:"|?*]/g,' ').trim()).slice(0,120).join('')
  return {bytes,title:content.title,filename:(name||'mobocom')+'.pdf'}
}
export async function sampleContentPdf(settings:PdfSettings,kind:PdfKind,design:PdfDesign){
  const {renderContentPdf}=await import('./render'),base=await siteBase()
  return withPdfSlot(()=>renderContentPdf({ref:{type:'page',id:1},kind,title:kind==='product'?'کاتالوگ هدفون استودیویی':kind==='movie'?'پروندهٔ سینمایی: میان‌ستاره‌ای':kind==='series'?'روایت یک سریال تماشایی':'طراحی برای لحظه‌های ماندگار',subtitle:'MoboCom / نسخهٔ اختصاصی مطالعه',summary:'یک نسخهٔ حرفه‌ای برای خواندن، ذخیره‌کردن و همراه داشتن محتوای موبوکام؛ با تایپوگرافی فارسی، مشخصات ساختاریافته و هویت بصری هر بخش.',html:'<h2>جزئیات، با نظم و دقت</h2><p>این نمونه از همان موتور واقعی تولید PDF استفاده می‌کند. تیترها، متن و تصویرها در صفحه‌های استاندارد جای می‌گیرند و واترمارک انتخابی شما روی تمام صفحه‌ها نمایش داده می‌شود.</p><blockquote>طراحی خوب، خواندن را آسان می‌کند.</blockquote><h2>اطلاعات در یک نگاه</h2><table><tr><th>ویژگی</th><th>جزئیات</th></tr><tr><td>زبان</td><td>فارسی و متن ترکیبی English</td></tr><tr><td>کیفیت خروجی</td><td>متن قابل انتخاب، قلم تعبیه‌شده و اشکال برداری</td></tr></table><h2>ادامهٔ مطالعه</h2>'+('<p>محتوا با همان اطلاعات معتبر سایت ساخته می‌شود؛ نسخهٔ آنلاین همیشه مرجع تازه‌ترین تغییرات است. عددهای ۱۴۰۵ و نام‌های انگلیسی مانند MoboCom در کنار متن فارسی درست خوانده می‌شوند.</p>'.repeat(9)),image:'',url:base,updatedAt:new Date(),author:'تحریریهٔ موبوکام',facts:[['نسخه','نمونهٔ طراحی'],['بخش','قابل انتخاب در مدیریت'],['طراحی','اختصاصی موبوکام']]},settings,base,design))
}
