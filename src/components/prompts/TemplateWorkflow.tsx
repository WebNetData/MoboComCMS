import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { TEMPLATE_STATUS } from './admin-model'
import s from './PromptMaster.module.css'

export default function TemplateWorkflow({data,query,statusHref}:{data:{mine:boolean;reviewAuthors:boolean;counts:Record<string,number>}|null;query:string;statusHref:(status:string)=>string}) {
  if (!data) return null
  return <><div className={s.teamGuide}><Icon name={data.mine?'user':'shield'} size={23}/><div><b>{data.mine?'فضای نویسندگی شما':'مدیریت تحریریهٔ پرامپت'}</b><p>{data.mine?(data.reviewAuthors?'فقط الگوهای خودتان را می‌بینید. برای انتشار «در انتظار بازبینی» را انتخاب کنید؛ مدیر نتیجه را در یادداشت الگو ثبت می‌کند.':'فقط الگوهای خودتان را می‌بینید و منتشر می‌کنید؛ حذف نهایی و انتخاب سردبیر با مدیر است.'):'نویسندگان فقط به الگوهای خودشان دسترسی دارند. بازبینی، انتشار و بازیابی با مدیر این بخش است. تاریخچهٔ خصوصی اعضا اینجا نمایش داده نمی‌شود.'}</p></div></div><nav className={s.statusTabs} aria-label="وضعیت الگوها">{Object.entries(TEMPLATE_STATUS).map(([status,label])=><Link key={status} href={statusHref(status)} aria-current={new URLSearchParams(query).get('status')===status?'page':undefined}><span>{label}</span><b>{(data.counts[status]||0).toLocaleString('fa-IR')}</b></Link>)}</nav></>
}
