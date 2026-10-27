'use client'

import { useEffect, useState } from 'react'
import { type BuilderDoc, type BuilderSection, cloneSections, parseBuilderDoc } from '@/modules/site/domain/builder'
import { ensureTemplateForms } from './template-forms'

type L = (en: string, fa: string) => string
type Bundled = { id: string; fa: string; en: string; descFa: string; descEn: string; sections: number; doc: BuilderDoc }
type Mine = { id: string; name: string; nameEn: string; createdAt: string; kind?: 'page' | 'post'; doc: BuilderDoc }

type Props = {
  open: boolean
  pageId: string
  currentDoc: BuilderDoc
  L: L
  postTemplateId?: string | null
  onSetTemplate?: (templateId: string) => void
  onClose: () => void
  onInsert: (sections: BuilderSection[]) => void
  /** A line for the editor's message bar (forms made for a whole-page template). */
  onNotice?: (text: string) => void
}

export default function TemplatesPanel({ open, pageId, currentDoc, L, postTemplateId, onSetTemplate, onClose, onInsert, onNotice }: Props) {
  const [bundled, setBundled] = useState<Bundled[]>([])
  const [pages, setPages] = useState<Bundled[]>([])
  const [postBundled, setPostBundled] = useState<Bundled[]>([])
  const [mine, setMine] = useState<Mine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [kind, setKind] = useState<'page' | 'post'>('page')
  const [busy, setBusy] = useState(false)
  const isPost = pageId.startsWith('post-')

  async function load() {
    setLoading(true); setError('')
    const response = await fetch(`/api/admin/builder/templates?pageId=${encodeURIComponent(pageId)}`, { cache: 'no-store' }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { setBundled(data.bundled || []); setPages(data.pageBundled || []); setPostBundled(data.postBundled || []); setMine(data.mine || []) }
    else setError(data?.error || L('Could not load templates.', 'بارگذاری قالب‌ها ممکن نشد.'))
    setLoading(false)
  }
  useEffect(() => { if (open) void load() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  async function saveAs() {
    setBusy(true); setError('')
    const response = await fetch('/api/admin/builder/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, name, nameEn, kind: isPost ? kind : 'page', doc: currentDoc }),
    }).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (response?.ok) { setName(''); setNameEn(''); setKind('page'); await load() }
    else setError(data?.error || L('Could not save the template.', 'ذخیره قالب ممکن نشد.'))
    setBusy(false)
  }

  async function remove(id: string) {
    setBusy(true); setError('')
    const response = await fetch(`/api/admin/builder/templates?pageId=${encodeURIComponent(pageId)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (response?.ok) await load()
    else { const data = await response?.json().catch(() => null); setError(data?.error || L('Could not delete.', 'حذف ممکن نشد.')) }
    setBusy(false)
  }

  const insert = (doc: BuilderDoc) => { onInsert(cloneSections(doc.sections)); onClose() }
  // A whole page also brings the forms its form blocks name, made from the form builder's templates as drafts.
  const usePage = (doc: BuilderDoc) => { insert(doc); void ensureTemplateForms(doc).then((notice) => { if (notice) onNotice?.(notice) }) }

  return <div className="bld-modal" role="dialog" aria-modal="true" aria-labelledby="bld-templates-title" onClick={onClose}>
    <div className="bld-modal-box" onClick={(event) => event.stopPropagation()}>
      <header>
        <h2 id="bld-templates-title">{L('Templates', 'قالب‌ها')}</h2>
        <button aria-label={L('Close', 'بستن')} type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </header>
      {error && <p role="status" className="bld-warning">{error}</p>}

      <section className="bld-saveas">
        <h3>{L('Save the current page as a template', 'ذخیره صفحه فعلی به‌عنوان قالب')}</h3>
        <div className="bld-saveas-row">
          <input className="input" placeholder={L('Name (FA)', 'نام (فا)')} value={name} onChange={(event) => setName(event.target.value)} />
          <input className="input" dir="ltr" placeholder={L('Name (EN)', 'نام (EN)')} value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
          {isPost && (
            <select className="input" value={kind} onChange={(event) => setKind(event.target.value === 'post' ? 'post' : 'page')} aria-label={L('Template kind', 'نوع قالب')}>
              <option value="page">{L('Page template', 'قالب صفحه')}</option>
              <option value="post">{L('Post template', 'قالب مقاله')}</option>
            </select>
          )}
          <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={saveAs}>{busy ? L('Saving…', 'در حال ذخیره…') : L('Save template', 'ذخیره قالب')}</button>
        </div>
        <p className="muted text-sm">{kind === 'post' && isPost
          ? L('Saved as a post template — selectable for any article (WordPress-style).', 'به‌عنوان قالب مقاله ذخیره می‌شود — برای هر مطلب قابل انتخاب است (مثل وردپرس).')
          : L('Saved templates are available on every page you edit.', 'قالب‌های ذخیره‌شده روی همه صفحه‌ها در دسترس‌اند.')}</p>
      </section>

      {!isPost && pages.length > 0 && <section>
        <h3>{L('Whole pages', 'صفحه‌های کامل')}</h3>
        <p className="muted text-sm">{L('A complete page to start from; every part stays a block to edit, move or delete.', 'یک صفحهٔ کامل برای شروع؛ همهٔ بخش‌ها بلوک‌های عادی‌اند و ویرایش، جابه‌جایی و حذف می‌شوند.')}</p>
        <div className="bld-tpl-grid">
          {pages.map((template) => <article className="bld-tpl bld-tpl-page" key={template.id}>
            <b>{L(template.en, template.fa)}</b>
            <p className="muted text-sm">{L(template.descEn, template.descFa)}</p>
            <footer>
              <small className="muted">{template.sections} {L('sections', 'بخش')}</small>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => usePage(template.doc)}>{L('Use this page', 'استفاده از این صفحه')}</button>
            </footer>
          </article>)}
        </div>
      </section>}

      <section>
        <h3>{L('Prebuilt sections', 'بخش‌های آماده')}</h3>
        {loading && <p className="muted">{L('Loading…', 'در حال بارگذاری…')}</p>}
        <div className="bld-tpl-grid">
          {bundled.map((template) => <article className="bld-tpl" key={template.id}>
            <b>{L(template.en, template.fa)}</b>
            <p className="muted text-sm">{L(template.descEn, template.descFa)}</p>
            <footer>
              <small className="muted">{template.sections} {L('sections', 'بخش')}</small>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => insert(template.doc)}>{L('Insert', 'درج')}</button>
            </footer>
          </article>)}
        </div>
      </section>

      {isPost && (
        <section>
          <h3>{L('Post layouts — choose for this article', 'قالب‌های مقاله — انتخاب برای این مطلب')}</h3>
          <div className="bld-tpl-grid">
            {[...postBundled.map((template) => ({ ...template, mine: false })), ...mine.filter((entry) => entry.kind === 'post').map((entry) => ({ id: entry.id, fa: entry.name, en: entry.nameEn || entry.name, descFa: '', descEn: '', sections: entry.doc.sections.length, doc: entry.doc, mine: true }))]
              .map((template) => {
                const active = postTemplateId === template.id
                return <article className={`bld-tpl${active ? ' is-active' : ''}`} key={template.id}>
                  <b>{template.mine ? template.fa : L(template.en, template.fa)}</b>
                  {L(template.descEn, template.descFa) && <p className="muted text-sm">{L(template.descEn, template.descFa)}</p>}
                  <footer>
                    <small className="muted">{active ? L('Active', 'فعال') : `${template.sections} ${L('sections', 'بخش')}`}</small>
                    {onSetTemplate && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || active} onClick={() => { void onSetTemplate(template.id); onClose() }}>
                        {active ? L('In use', 'در حال استفاده') : L('Use for this post', 'استفاده برای این مطلب')}
                      </button>
                    )}
                  </footer>
                </article>
              })}
          </div>
          {onSetTemplate && postTemplateId && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { void onSetTemplate(''); onClose() }}>
              {L('Remove template (default layout)', 'حذف قالب (چیدمان پیش‌فرض)')}
            </button>
          )}
        </section>
      )}

      <section>
        <h3>{L('Your templates', 'قالب‌های شما')}</h3>
        {!mine.length && <p className="muted text-sm">{L('Nothing saved yet.', 'هنوز چیزی ذخیره نشده.')}</p>}
        <div className="bld-tpl-grid">
          {mine.map((template) => <article className="bld-tpl" key={template.id}>
            <b>{template.name}{template.nameEn ? <span dir="ltr"> · {template.nameEn}</span> : null}</b>
            <p className="muted text-sm">{template.kind === 'post' ? L('Post template', 'قالب مقاله') : `${template.doc.sections.length} ${L('sections', 'بخش')}`}</p>
            <footer>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => insert(parseBuilderDoc(template.doc))}>{L('Insert', 'درج')}</button>
              <button type="button" className="btn btn-ghost btn-sm bld-danger" disabled={busy} onClick={() => remove(template.id)}>{L('Delete', 'حذف')}</button>
            </footer>
          </article>)}
        </div>
      </section>
    </div>
  </div>
}
