'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/AppLink'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import { LEGACY_SOURCES, TAXONOMIES, TAXONOMY_INFO, descendants, flatten, isTaxonomy, type Taxonomy } from '@/modules/taxonomy/domain/taxonomy'
import { TERM_FACETS } from '@/modules/taxonomy/domain/projection'

type Node = {
  facet: string; id: number; parentId: number | null; slug: string; name: string; sortOrder: number; description: string; icon: string; image: string
  color: string; inMenu: boolean; count: number; seoTitle: string; seoDescription: string; path: string; depth: number; children: Node[]
}
type Draft = { facet: string; id: number | null; name: string; slug: string; parentId: number | null; description: string; icon: string; image: string; color: string; inMenu: boolean; seoTitle: string; seoDescription: string }
const EMPTY: Draft = { facet: '', id: null, name: '', slug: '', parentId: null, description: '', icon: '', image: '', color: '', inMenu: true, seoTitle: '', seoDescription: '' }

/** Category and sub-category manager for each content section. */
function TaxonomyManager() {
  const params = useSearchParams()
  const router = useRouter()
  const taxonomy: Taxonomy = isTaxonomy(params.get('tax')) ? (params.get('tax') as Taxonomy) : 'software'
  const [tree, setTree] = useState<Node[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const flat = useMemo(() => (tree ? flatten(tree) : []), [tree])
  const api = `/api/admin/taxonomy?tax=${taxonomy}`

  const call = useCallback(async (init: RequestInit & { url?: string }, success?: string) => {
    setBusy(true); setMessage(null)
    const response = await fetch(init.url || api, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json' } }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setMessage({ text: body?.error || 'انجام نشد؛ دوباره تلاش کنید', error: true }); return null }
    if (body?.tree) setTree(body.tree)
    if (success) setMessage({ text: success, error: false })
    return body
  }, [api])

  useEffect(() => { setTree(null); setDraft(null); void call({ method: 'GET' }) }, [call])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    const body = await call({ method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(draft) }, draft.id ? 'دسته به‌روز شد' : 'دسته ساخته شد')
    if (body) setDraft(null)
  }

  async function remove(node: Node) {
    const note = node.children.length ? `\n${node.children.length.toLocaleString('fa-IR')} زیردستهٔ آن یک سطح بالاتر می‌روند.` : ''
    if (!window.confirm(`دستهٔ «${node.name}» حذف شود؟ محتوای داخل آن حذف نمی‌شود.${note}`)) return
    await call({ method: 'DELETE', url: `${api}&id=${node.id}` }, 'دسته حذف شد')
    if (draft?.id === node.id) setDraft(null)
  }

  async function move(node: Node, direction: -1 | 1) {
    const siblings = flat.filter((n) => n.parentId === node.parentId)
    const index = siblings.findIndex((n) => n.id === node.id)
    const target = siblings[index + direction]
    if (!target) return
    const order = siblings.map((n) => n.id)
    order.splice(index, 1); order.splice(index + direction, 0, node.id)
    await call({ method: 'POST', body: JSON.stringify({ action: 'reorder', moves: order.map((id, i) => ({ id, parentId: node.parentId, sortOrder: i * 10 })) }) })
  }

  const edit = (node: Node) => setDraft({ facet: node.facet || '', id: node.id, name: node.name, slug: node.slug, parentId: node.parentId, description: node.description, icon: node.icon, image: node.image, color: node.color, inMenu: node.inMenu, seoTitle: node.seoTitle, seoDescription: node.seoDescription })
  const blocked = draft?.id ? new Set(descendants(flat, draft.id)) : new Set<number>()
  const info = TAXONOMY_INFO[taxonomy]
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current))

  const row = (node: Node) => {
    const siblings = flat.filter((n) => n.parentId === node.parentId)
    const index = siblings.findIndex((n) => n.id === node.id)
    return <li key={node.id}>
      <div className={`tx-row${draft?.id === node.id ? ' is-editing' : ''}`} style={{ paddingInlineStart: `${12 + (node.depth - 1) * 26}px` }}>
        {node.depth > 1 && <span className="tx-branch" aria-hidden="true">└</span>}
        {node.color && <span className="tx-swatch" style={{ background: node.color }} aria-hidden="true" />}
        <b className="tx-name">{node.name}</b>
        <bdi className="tx-slug" dir="auto">{node.slug}</bdi>
        <span className="tx-count" title="محتوای منتشرشده (با زیردسته‌ها)">{node.count.toLocaleString('fa-IR')}</span>
        {!node.inMenu && <span className="tx-flag">خارج از منو</span>}
        <span className="tx-actions">
          <button type="button" className="tx-icon" aria-label={`بالا بردن ${node.name}`} disabled={busy || index === 0} onClick={() => void move(node, -1)}>↑</button>
          <button type="button" className="tx-icon" aria-label={`پایین بردن ${node.name}`} disabled={busy || index === siblings.length - 1} onClick={() => void move(node, 1)}>↓</button>
          <button type="button" className="sh-link" onClick={() => edit(node)}>ویرایش</button>
          {node.depth < 4 && <button type="button" className="sh-link" onClick={() => setDraft({ ...EMPTY, parentId: node.id })}>+ زیردسته</button>}
          <Link className="sh-link" href={node.path} target="_blank">مشاهده ↗</Link>
          <button type="button" className="sh-link is-danger" disabled={busy} onClick={() => void remove(node)}>حذف</button>
        </span>
      </div>
      {node.children.length > 0 && <ul>{node.children.map(row)}</ul>}
    </li>
  }

  return <div className="xm-page sh-admin" dir="rtl">
    <header className="tb-hero"><div><span className="tb-eyebrow">TAXONOMY</span><h1>دسته‌بندی‌ها و زیردسته‌ها</h1>
      <p>هر بخش درخت دسته‌بندی مستقل خودش را دارد (تا چهار سطح). مگامنو، صفحهٔ هر دسته، مسیر صفحه و فیلترها از همین درخت ساخته می‌شوند. محتوا را در ویرایشگر هر بخش به دسته‌ها وصل کنید.</p></div></header>
    <nav className="tb-tabs" role="tablist" aria-label="بخش">{TAXONOMIES.map((key) => <button key={key} type="button" role="tab" aria-selected={key === taxonomy} className={key === taxonomy ? 'is-active' : ''} onClick={() => router.replace(`/admin/taxonomy?tax=${key}`)}>{TAXONOMY_INFO[key].label}</button>)}</nav>
    {message && <div className={`xm-notice${message.error ? ' is-error' : ''}`} role="status">{message.text}</div>}

    <div className="tx-layout">
      <section className="sh-panel tx-tree-panel" aria-label={info.label}>
        <header className="sh-panel-head"><h2>{info.label}</h2>
          <div className="sh-actions">
            <button type="button" className="sh-btn sh-btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ دستهٔ اصلی</button>
            {LEGACY_SOURCES.includes(taxonomy) && <button type="button" className="sh-btn sh-btn-ghost" disabled={busy} onClick={() => void call({ method: 'POST', body: JSON.stringify({ action: 'import' }) }, 'دسته‌ها از اطلاعات فعلی ساخته و به محتوا وصل شدند')} title="از فیلدهای متنی قدیمی (پلتفرم، دسته، سبک) درخت می‌سازد">ساخت از اطلاعات فعلی</button>}
            <button type="button" className="sh-btn sh-btn-ghost" disabled={busy} onClick={() => void call({ method: 'POST', body: JSON.stringify({ action: 'recount' }) }, 'شمارش به‌روز شد')}>شمارش دوباره</button>
          </div>
        </header>
        {tree === null ? <div className="sh-skeleton" aria-busy="true" /> : tree.length ? <ul className="tx-tree">{tree.map(row)}</ul> : <div className="sh-empty is-compact">
          <p>هنوز دسته‌ای برای {info.item} ساخته نشده. دستهٔ اصلی بسازید یا با «ساخت از اطلاعات فعلی» درخت را از داده‌های موجود بسازید.</p>
        </div>}
      </section>

      {draft && <form className="sh-panel tx-form" onSubmit={save} aria-label={draft.id ? 'ویرایش دسته' : 'دستهٔ جدید'}>
        <header className="sh-panel-head"><h2>{draft.id ? `ویرایش «${flat.find((n) => n.id === draft.id)?.name || ''}»` : draft.parentId ? 'زیردستهٔ جدید' : 'دستهٔ اصلی جدید'}</h2>
          <button type="button" className="sh-icon-btn" aria-label="بستن" onClick={() => setDraft(null)}>×</button></header>
        <label className="sh-field"><span>نام</span><input className="sh-input" required maxLength={80} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
        <label className="sh-field"><span>نامک (بخشی از آدرس)</span><input className="sh-input" dir="auto" maxLength={60} placeholder="خودکار از نام" value={draft.slug} onChange={(e) => set('slug', e.target.value)} /></label>
        <label className="sh-field"><span>دستهٔ والد</span>
          <select className="sh-input" value={draft.parentId ?? ''} onChange={(e) => set('parentId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">— دستهٔ اصلی (بدون والد) —</option>
            {flat.filter((n) => !blocked.has(n.id) && n.depth < 4).map((n) => <option key={n.id} value={n.id}>{'— '.repeat(n.depth - 1)}{n.name}</option>)}
          </select></label>
        {Object.keys(TERM_FACETS[taxonomy]).length > 0 && <label className="sh-field"><span>پر کردن خودکار فیلد محتوا</span><select className="sh-input" value={draft.facet} onChange={e => set('facet', e.target.value)}><option value="">خودکار / ارث‌بری از والد</option><option value="none">بدون ارتباط با فیلد</option>{Object.entries(TERM_FACETS[taxonomy]).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><small className="muted">انتخاب این دسته یا زیردسته‌های آن، فیلد مرتبط را در ویرایشگر محتوا پر می‌کند.</small></label>}
        <label className="sh-field"><span>توضیح (بالای صفحهٔ دسته)</span><textarea className="sh-input tx-textarea" rows={3} maxLength={1000} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="sh-grid">
          <label className="sh-field"><span>رنگ</span><input className="sh-input" type="color" value={draft.color || '#5b36f2'} onChange={(e) => set('color', e.target.value)} /></label>
          <label className="sh-field"><span>آیکون (اختیاری)</span><input className="sh-input" maxLength={40} placeholder="🛡 یا نام آیکون" value={draft.icon} onChange={(e) => set('icon', e.target.value)} /></label>
        </div>
        <label className="sh-field"><span>تصویر شاخص (اختیاری)</span><input className="sh-input" dir="ltr" placeholder="/uploads/…" value={draft.image} onChange={(e) => set('image', e.target.value)} /></label>
        <label className="sh-check"><input type="checkbox" checked={draft.inMenu} onChange={(e) => set('inMenu', e.target.checked)} />در مگامنو نمایش داده شود</label>
        <fieldset className="tx-seo"><legend>سئو</legend>
          <label className="sh-field"><span>عنوان سئو</span><input className="sh-input" maxLength={90} placeholder={draft.name ? `دانلود ${draft.name}` : ''} value={draft.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} /></label>
          <label className="sh-field"><span>توضیح متا</span><textarea className="sh-input tx-textarea" rows={2} maxLength={200} value={draft.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} /></label>
        </fieldset>
        <div className="sh-actions"><button type="submit" className="sh-btn sh-btn-primary" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button><button type="button" className="sh-btn sh-btn-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
      </form>}
    </div>
  </div>
}

export default function AdminTaxonomyPage() {
  return <Suspense fallback={<div className="sh-skeleton" aria-busy="true" />}><TaxonomyManager /></Suspense>
}
