import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { KIND_LABEL, type PromptKind } from '@/modules/prompts/domain/prompts'
import TemplateCard, { type PromptCard } from './TemplateCard'
import g from './PromptGallery.module.css'

export default function RelatedPrompts({ templates, kind }: { templates: PromptCard[]; kind: PromptKind }) {
  if (!templates.length) return null
  return <section className={g.related} aria-labelledby="related-prompts-title">
    <header className={g.relatedHead}><div className={g.relatedHeading}><span className={g.relatedIcon}><Icon name="sparkles" size={23}/></span><div><h2 id="related-prompts-title">در همین حال‌وهوا کشف کن</h2><p>نمونه‌های بیشتر در {KIND_LABEL[kind]}؛ ببین، کپی کن و شخصی‌سازی کن.</p></div></div><div className={g.relatedTools}><span className={g.relatedCount}>{templates.length.toLocaleString('fa-IR')} پرامپت</span><Link href={'/prompts/library?kind='+kind}>دیدن همه<Icon name="arrow" size={16}/></Link></div></header>
    <div className={g.relatedGrid} data-count={templates.length}>{templates.map(template=><TemplateCard key={template.slug} template={template} category={KIND_LABEL[kind]} variant="related"/>)}</div>
  </section>
}
