import type { BuilderDoc } from '@/modules/site/domain/builder'

/**
 * A whole-page template's form blocks name forms by address (e.g. `foreign-payment`). Any that do not exist yet are
 * made from the form builder's template of the same address, as drafts: prices, rate margins and payment settings
 * are for the owner to check in «فرم‌ها و پاسخ‌ها» before publishing. Returns a line for the editor, or ''.
 */
export async function ensureTemplateForms(doc: BuilderDoc): Promise<string> {
  const wanted = [...new Set(doc.sections.flatMap((section) => section.columns.flatMap((column) => column.widgets.filter((widget) => widget.type === 'form' && widget.props.slug).map((widget) => widget.props.slug))))]
  if (!wanted.length) return ''
  const listed = await fetch('/api/admin/forms', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!listed) return ''
  const have = new Set((listed.forms || []).map((form: { slug: string }) => form.slug))
  const made: string[] = []
  for (const slug of wanted) {
    if (have.has(slug)) continue
    const template = (listed.templates || []).find((entry: { form: { slug: string } }) => entry.form?.slug === slug)
    if (!template) continue
    const response = await fetch('/api/admin/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...template.form, published: false }) }).catch(() => null)
    if (response?.ok) made.push(template.form.title || slug)
  }
  return made.length ? `فرم ${made.map((title) => `«${title}»`).join('، ')} به‌صورت پیش‌نویس ساخته شد؛ پیش از انتشار، نرخ، کارمزد و پرداخت آن را در «فرم‌ها و پاسخ‌ها» بررسی و منتشر کنید.` : ''
}
