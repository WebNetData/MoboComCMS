import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isKind, KIND_LABEL, readShowcase, hasShowcase } from '@/modules/prompts/domain/prompts'
import ShowcasePreview from './ShowcasePreview'
import PromptCopy from './PromptCopy'
import g from './PromptGallery.module.css'
import PromptAuthor, { type PromptAuthorView } from './PromptAuthor'

export type PromptCard = { slug: string; title: string; summary: string; kind: string; category: string; tags: string; featured: boolean; showcase?: string; example?: string; createdBy?: PromptAuthorView | null }
export default function TemplateCard({ template, category, variant = 'gallery' }: { template: PromptCard; category?: string; variant?: 'gallery' | 'compact' | 'related' }) {
  const kind=isKind(template.kind)?template.kind:'TEXT',sample=readShowcase(template.showcase),ready=hasShowcase(sample),url='/prompts/templates/'+template.slug
  return <article className={g.card} data-kind={kind} data-sample={ready} data-variant={variant}>
    <Link href={url} className={g.cardVisual} aria-label={`مشاهدهٔ نمونه و پرامپت ${template.title}`} style={variant==='related'?undefined:{aspectRatio:variant==='compact'?'16/10':sample.aspect==='portrait'?'3/4':sample.aspect==='wide'?'4/3':'1/1'}}><ShowcasePreview sample={sample} kind={kind} title={template.title} compact/><span className={g.cardBadge}>{KIND_LABEL[kind]}</span>{template.featured&&<span className={g.curated}><Icon name="sparkles" size={12}/>منتخب</span>}</Link>
    <div className={g.cardBody}><span className={g.cardCategory}>{category||template.category}</span><h3><Link href={url}>{template.title}</Link></h3><p>{template.summary}</p><PromptAuthor author={template.createdBy}/><div className={g.cardActions}><Link href={url}>دیدن پرامپت<Icon name="arrow" size={15}/></Link>{template.example&&<PromptCopy text={template.example} title={template.title} compact/>}</div></div>
  </article>
}
