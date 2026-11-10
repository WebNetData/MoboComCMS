import type { CSSProperties, ReactNode } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { Money } from '@/components/store/Storefront'
import FileStoreTilt from '@/components/store/FileStoreTilt'
import { sized, srcSet } from '@/shared/media/image'
import type { FileCard, fileStoreHome } from '@/modules/store/server/catalog'
import s from './file-store.module.css'

type Home = Awaited<ReturnType<typeof fileStoreHome>>
const fa = (n: number) => n.toLocaleString('fa-IR')
/** Bytes as people read them (۲٫۴ گیگابایت). */
export function readableSize(bytes: number) {
  if (!bytes) return '—'
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت']
  let value = bytes, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toLocaleString('fa-IR', { maximumFractionDigits: value < 10 && unit ? 1 : 0 })} ${units[unit]}`
}
const FLOATERS = ['PDF', 'ZIP', 'APK', 'MP4', 'PSD', 'EXE', 'MP3', 'AI', 'DOCX', 'ISO']
const TYPE_TONE: Record<string, string> = { PDF: 'red', ZIP: 'amber', RAR: 'amber', '7Z': 'amber', APK: 'green', EXE: 'blue', MSI: 'blue', DMG: 'blue', ISO: 'blue', MP4: 'violet', MKV: 'violet', MP3: 'pink', WAV: 'pink', FLAC: 'pink', PSD: 'cyan', AI: 'amber', DOCX: 'blue', XLSX: 'green', PPTX: 'red' }
const tone = (type: string) => TYPE_TONE[type] || 'slate'
const base = '/products?files=1'

function Types({ types, max = 3 }: { types: string[]; max?: number }) {
  if (!types.length) return null
  return <span className={s.types}>{types.slice(0, max).map((type) => <span key={type} className={s.type} data-tone={tone(type)}>{type}</span>)}{types.length > max && <span className={s.type} data-tone="slate">+{fa(types.length - max)}</span>}</span>
}

function Price({ card }: { card: FileCard }) {
  if (card.price <= 0) return <span className={s.free}>رایگان</span>
  return <span className={s.price}>{card.discount > 0 && <s className="num">{Math.round(card.listPrice).toLocaleString('fa-IR')}</s>}<Money amount={card.price} currency={card.currency} /></span>
}

/** One file product: its cover with the kinds of files it holds, how many and how large, and its price. */
export function FileTile({ card, rank }: { card: FileCard; rank?: number }) {
  return <Link href={`/products/${card.slug}`} className={s.tile} data-tilt="">
    <span className={s.cover}>
      {card.image ? <img src={sized(card.image, 480)} srcSet={srcSet(card.image, 480)} alt="" loading="lazy" /> : <span className={s.coverEmpty}><Icon name="file" size={40} /></span>}
      <Types types={card.files.types} />
      {rank !== undefined && <span className={s.rank}>{fa(rank)}</span>}
      {card.discount > 0 && <span className={s.off}>{fa(card.discount)}٪</span>}
      <span className={s.shine} aria-hidden="true" />
    </span>
    <span className={s.tileBody}>
      {card.category && <small className={s.cat}>{card.category}</small>}
      <b className={s.name}>{card.name}</b>
      <span className={s.facts}>
        <span><Icon name="layers" size={14} />{fa(card.files.count)} فایل</span>
        <span><Icon name="download" size={14} />{readableSize(card.files.bytes)}</span>
        {card.rating > 0 && <span><Icon name="star" size={14} />{card.rating.toLocaleString('fa-IR')}</span>}
      </span>
      <span className={s.tileFoot}><Price card={card} />{card.soldCount > 0 && <small>{fa(card.soldCount)} دریافت</small>}</span>
    </span>
  </Link>
}

function Section({ title, icon, more, children }: { title: string; icon: string; more?: string; children: ReactNode }) {
  return <section className={s.section}>
    <header className={s.sectionHead}><h2><span className={s.sectionIcon} aria-hidden="true"><Icon name={icon} size={18} /></span>{title}</h2>{more && <Link href={more} className={s.more}>مشاهدهٔ همه<Icon name="arrow" size={16} /></Link>}</header>
    {children}
  </section>
}

/** The file store: a vault of files to pick from — hero and search, categories, a spotlight, new, best-selling and free files, and how delivery works. */
export default function FileStore({ home }: { home: Home }) {
  const { settings, stats, spotlight } = home
  return <div className={s.store} dir="rtl">
    <FileStoreTilt />
    <header className={s.hero}>
      <div className={s.heroScene} aria-hidden="true">
        <span className={s.floor} />
        <span className={s.glow} /><span className={s.glow2} />
        {FLOATERS.map((type, i) => <span key={type} className={s.floater} data-tone={tone(type)} style={{ '--i': i } as CSSProperties}><Icon name="file" size={18} />{type}</span>)}
      </div>
      <div className={s.heroText}>
        <span className={s.eyebrow}><span className={s.live} aria-hidden="true" />{settings.fileStoreName}</span>
        <h1>{settings.fileStoreTitle}</h1>
        {settings.fileStoreDescription && <p>{settings.fileStoreDescription}</p>}
        <form action="/products" className={s.search} role="search">
          <input type="hidden" name="files" value="1" />
          <Icon name="search" size={20} />
          <input name="q" type="search" placeholder="نام فایل، نرم‌افزار یا قالب…" aria-label={`جست‌وجو در ${settings.fileStoreName}`} />
          <button type="submit">جست‌وجو</button>
        </form>
        <dl className={s.stats}>
          <div><dt>محصول فایلی</dt><dd className="num">{fa(stats.products)}</dd></div>
          <div><dt>فایل آمادهٔ دریافت</dt><dd className="num">{fa(stats.files)}</dd></div>
          <div><dt>حجم کل</dt><dd>{readableSize(stats.bytes)}</dd></div>
          {stats.sold > 0 && <div><dt>دریافت</dt><dd className="num">{fa(stats.sold)}</dd></div>}
        </dl>
      </div>
    </header>

    {home.categories.length > 0 && <nav className={s.cats} aria-label="دسته‌بندی‌های فایل">
      <Link href={base} className={s.catChip}><Icon name="grid" size={18} /><span>همهٔ فایل‌ها</span><small className="num">{fa(stats.products)}</small></Link>
      {home.categories.map((cat) => <Link key={cat.slug} href={`${base}&category=${encodeURIComponent(cat.slug)}`} className={s.catChip}>{cat.image ? <img src={sized(cat.image, 96)} alt="" loading="lazy" /> : <Icon name="folder" size={18} />}<span>{cat.name}</span><small className="num">{fa(cat.total)}</small></Link>)}
    </nav>}

    {spotlight && <section className={s.spotlight} aria-labelledby="fs-spot">
      <Link href={`/products/${spotlight.slug}`} className={s.spotCover} data-tilt="">
        {spotlight.image ? <img src={sized(spotlight.image, 960)} srcSet={srcSet(spotlight.image, 720)} alt="" /> : <span className={s.coverEmpty}><Icon name="file" size={56} /></span>}
        <span className={s.shine} aria-hidden="true" />
      </Link>
      <div className={s.spotText}>
        <span className={s.badge}><Icon name="star" size={14} />{spotlight.soldCount > 0 ? 'پرطرفدارترین فایل' : 'تازه‌ترین فایل'}</span>
        <h2 id="fs-spot">{spotlight.name}</h2>
        {spotlight.excerpt && <p>{spotlight.excerpt}</p>}
        <Types types={spotlight.files.types} max={6} />
        <ul className={s.spotFacts}>
          <li><Icon name="layers" size={18} /><span><b className="num">{fa(spotlight.files.count)}</b>فایل</span></li>
          <li><Icon name="download" size={18} /><span><b>{readableSize(spotlight.files.bytes)}</b>حجم</span></li>
          {spotlight.soldCount > 0 && <li><Icon name="users" size={18} /><span><b className="num">{fa(spotlight.soldCount)}</b>دریافت</span></li>}
        </ul>
        <div className={s.spotActions}><Price card={spotlight} /><Link href={`/products/${spotlight.slug}`} className={s.cta}>مشاهده و دریافت<Icon name="arrow" size={18} /></Link></div>
      </div>
    </section>}

    {home.newest.length > 0 && <Section title="تازه‌ترین فایل‌ها" icon="sparkles" more={`${base}&sort=newest`}><div className={s.grid}>{home.newest.map((card) => <FileTile key={card.id} card={card} />)}</div></Section>}
    {home.bestselling.length >= 3 && <Section title="پردانلودترین‌ها" icon="chart" more={`${base}&sort=bestselling`}><div className={s.grid}>{home.bestselling.map((card, i) => <FileTile key={card.id} card={card} rank={i + 1} />)}</div></Section>}

    <section className={s.steps} aria-label="دریافت فایل">
      {[['search', 'انتخاب', 'فایل یا بستهٔ موردنیازتان را پیدا کنید؛ نوع، تعداد و حجم فایل‌ها پیش از خرید پیداست.'], ['lock', 'پرداخت امن', 'با کیف پول یا درگاه بانکی بپردازید؛ اعضای ویژه به فایل‌های ویژه دسترسی مستقیم دارند.'], ['download', 'دریافت از حساب', 'لینک امن و زمان‌دار در حساب شما؛ هر وقت لازم شد دوباره دانلود کنید.']].map(([icon, title, text], i) => <div key={title} className={s.step}><span className={s.stepNum}>{fa(i + 1)}</span><Icon name={icon} size={22} /><b>{title}</b><p>{text}</p></div>)}
    </section>

    {!home.newest.length && <div className={s.empty}><Icon name="file" size={40} /><b>هنوز فایلی برای فروش منتشر نشده است</b><span>برای محصول مجازی، تحویل «فایل» را انتخاب و فایل‌ها را بارگذاری کنید.</span></div>}
  </div>
}
