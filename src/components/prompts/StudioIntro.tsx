import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { readShowcase } from '@/modules/prompts/domain/prompts'
import type { PromptCard } from './TemplateCard'
import s from './PromptMaster.module.css'
import h from './StudioIntro.module.css'

export default function StudioIntro({ title, description, templates }: { title: string; description: string; templates: PromptCard[] }) {
  const pictures = templates.map(template => ({ ...readShowcase(template.showcase), title: template.title })).filter(sample => sample.cover && !sample.video).slice(0, 3)
  return <header className={h.hero}>
    <div className={h.content}><span className={h.signature}><Icon name="sparkles" size={18}/>پرامپت مستر موبوکام<span aria-hidden="true"/><bdi>Prompt Master</bdi></span><h1>{title}</h1><p>{description}</p>
      <nav className={h.actions} aria-label="ابزارهای پرامپت"><Link className={s.primary} href="/prompts/library"><Icon name="layers" size={18}/>کتابخانهٔ الگوها<Icon name="arrow" size={16}/></Link><Link className={s.secondary} href="/prompts/history"><Icon name="clock" size={17}/>تاریخچهٔ من</Link></nav>
      <div className={h.features}><span><Icon name="sliders" size={14}/>قابل شخصی‌سازی</span><span><Icon name="file" size={14}/>خروجی قابل ویرایش</span><span><Icon name="shield" size={14}/>تاریخچهٔ خصوصی</span></div>
    </div>
    <Link className={h.visual} href="/prompts/library" aria-label="کشف نمونه‌های تصویری و پرامپت‌ها"><div className={h.artwork} aria-hidden="true">{pictures.map((sample, index) => <figure key={sample.cover} data-position={index}><img src={sample.cover} alt="" width={300} height={370} fetchPriority={index === 1 ? 'high' : 'auto'}/><figcaption><Icon name="sparkles" size={12}/>{sample.title}</figcaption></figure>)}{!pictures.length&&<div className={h.fallback}><Icon name="sparkles" size={50}/><span>جای ایدهٔ بعدی تو</span></div>}</div><span className={h.visualCaption}><span><Icon name="image" size={16}/>نمونه را ببین، با ایدهٔ خودت ادامه بده</span><Icon name="arrow" size={17}/></span></Link>
  </header>
}
