'use client'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import { isKind, KIND_LABEL, readShowcase } from '@/modules/prompts/domain/prompts'
import PromptAuthor from './PromptAuthor'
import { TEMPLATE_STATUS, type EditableTemplate } from './admin-model'
import s from './PromptMaster.module.css'

export default function TemplateList({ entries, categories, canManage, reviewAuthors, busy, edit, remove, restore }: {
  entries: EditableTemplate[]; categories: { code: string; name: string }[]; canManage: boolean; reviewAuthors: boolean; busy: boolean
  edit: (entry: EditableTemplate) => void; remove: (entry: EditableTemplate) => void; restore: (entry: EditableTemplate) => void
}) {
  return <div className={s.adminList}><table><caption className={s.srOnly}>فهرست الگوهای پرامپت</caption><thead><tr><th scope="col">الگو و نمونه</th><th scope="col">نویسنده</th><th scope="col">نوع و دسته</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>{entries.map(entry => {
    const cover = readShowcase(entry.showcase).cover, editable = entry.status !== 'TRASHED' && (canManage || !reviewAuthors || entry.status !== 'PUBLISHED')
    return <tr key={entry.id}><td><div className={s.templateIdentity}><span className={s.templateThumb}>{cover ? <img src={cover} alt="" loading="lazy" width={62} height={74}/> : <Icon name="file" size={24}/>}</span><span><b>{entry.title}</b><small dir="ltr">/{entry.slug}</small>{entry.reviewNote && <span className={s.reviewNote}>یادداشت مدیر: {entry.reviewNote}</span>}</span></div></td><td data-label="نویسنده">{entry.createdBy ? <PromptAuthor author={entry.createdBy}/> : <span className={s.muted} title="نویسنده هنگام ثبت این الگو ذخیره نشده است">ثبت قدیمی</span>}</td><td data-label="نوع و دسته">{isKind(entry.kind) ? KIND_LABEL[entry.kind] : entry.kind}<small>{categories.find(c => c.code === entry.category)?.name || entry.category || 'بدون دسته'}</small></td><td data-label="وضعیت"><span className={s.stateBadge} data-state={entry.status}>{TEMPLATE_STATUS[entry.status] || entry.status}</span>{entry.featured && <small>انتخاب سردبیر</small>}</td><td><div className={s.historyButtons}>{editable && <button className={s.secondary} type="button" onClick={() => edit(entry)} disabled={busy}>{entry.status === 'PENDING' && canManage ? 'بازبینی و تصمیم' : 'ویرایش'}</button>}{entry.status === 'PUBLISHED' && <Link href={`/prompts/templates/${entry.slug}`} className={s.secondary}>مشاهده</Link>}{entry.status === 'TRASHED' && canManage && <button type="button" className={s.secondary} onClick={() => restore(entry)} disabled={busy}>بازگردانی</button>}{(entry.status !== 'TRASHED' || canManage) && <button className={s.textButton} type="button" onClick={() => remove(entry)} disabled={busy}>{canManage ? 'حذف' : 'درخواست حذف'}</button>}</div></td></tr>
  })}</tbody></table></div>
}
