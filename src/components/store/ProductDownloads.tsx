import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { formatBytes } from '@/components/media/api'
import s from './ProductFiles.module.css'

type Access = { open: boolean; reason: string; files: { id: number; label: string; filename: string; sizeBytes: string; sha256: string }[] }

export function FileStoreDoor({ settings }: { settings: { showFileStore: boolean; fileStoreName?: string; fileStoreTitle: string; fileStoreDescription: string } }) {
  if (!settings.showFileStore) return null
  return <Link className={s.door} href="/products?files=1"><span className={s.doorIcon}><Icon name="download" size={31} /></span><div><small>{settings.fileStoreName || 'فروشگاه فایل'}</small><h2>{settings.fileStoreTitle}</h2><p>{settings.fileStoreDescription}</p></div><span className={s.doorAction}>کشف فایل‌ها<Icon name="arrow" size={19} /></span></Link>
}

export default function ProductDownloads({ access, slug, title, anchor = 'downloads' }: { access: Access; slug: string; title: string; anchor?: string }) {
  return <section id={anchor} className={s.downloads} aria-label={`فایل‌های ${title}`} dir="rtl">
    <header className={s.header}><div><span className={s.eyebrow}><Icon name="download" size={16} />تحویل دیجیتال</span><h2>فایل‌های {title}</h2><p>{access.reason === 'purchased' ? 'خرید شما تأیید شده؛ فایل‌ها از همین حساب در دسترس‌اند.' : access.reason === 'free' ? 'دریافت این فایل‌ها با عضویت فعلی شما رایگان است.' : 'پس از خرید یا با عضویت واجد شرایط، فایل‌ها از همین صفحه قابل دریافت‌اند.'}</p></div><span className={s.status}><Icon name={access.open ? 'check' : 'lock'} size={16} />{access.open ? 'دسترسی فعال' : 'نیازمند دسترسی'}</span></header>
    {!access.files.length ? <p className={s.note}>در حال حاضر فایل فعالی برای دریافت وجود ندارد.</p> : <ul className={s.list}>{access.files.map(file => <li key={file.id}><span className={s.fileIcon}><Icon name="file" size={24} /></span><div className={s.fileName}><h3>{file.label}</h3><span dir="auto">{file.filename}</span><small dir="ltr">{formatBytes(Number(file.sizeBytes))}</small></div>{access.open ? <a className={s.download} href={`/api/store/files/${file.id}`}><Icon name="download" size={16} />دریافت فایل</a> : <span className={s.locked}><Icon name="lock" size={16} />پس از فعال‌شدن دسترسی</span>}</li>)}</ul>}
    {!access.open && <div className={s.footer}>{access.reason === 'login' ? <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/products/${slug}#downloads`)}`}>ورود و ادامه</Link> : <a className="btn btn-primary" href={`/products/${slug}#product-purchase`}>مشاهدهٔ قیمت و خرید</a>}<p className={s.note}>پس از خرید، فایل‌ها از همین صفحه و بخش سفارش‌های حساب شما قابل دریافت‌اند.</p></div>}
  </section>
}
