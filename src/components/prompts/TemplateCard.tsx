import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isKind, KIND_ICON, KIND_LABEL } from '@/modules/prompts/domain/prompts'
import s from './PromptMaster.module.css'

export type PromptCard = { slug: string; title: string; summary: string; kind: string; category: string; tags: string; featured: boolean }
export default function TemplateCard({ template, category }: { template: PromptCard; category?: string }) {
  const kind = isKind(template.kind) ? template.kind : 'TEXT'
  return <article className={s.templateCard}>
    <div className={s.art} data-kind={kind}><span className={s.tag}>{KIND_LABEL[kind]}</span><Icon name={KIND_ICON[kind]} size={70} /><small>{category || template.category}</small>{template.featured && <span className={s.tag}>منتخب</span>}</div>
    <div className={s.templateText}><h3><Link href={`/prompts/templates/${template.slug}`}>{template.title}</Link></h3><p>{template.summary}</p><div className={s.templateBottom}><Link href={`/prompts?template=${template.slug}`}><Icon name="sparkles" size={16} />استفاده از الگو</Link><Link href={`/prompts/templates/${template.slug}`} aria-label={`جزئیات ${template.title}`}><Icon name="arrow" size={18} /></Link></div></div>
  </article>
}
