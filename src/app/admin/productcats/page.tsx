'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'
import { CATEGORY_KIND_LABEL, type CategoryKind } from '@/modules/catalog/domain/category-kind'
import { CATEGORY_TEMPLATE, templateRows } from '@/modules/catalog/domain/category-template'

type Row = { id: number; slug: string; name: string; nameEn: string; parentId: number | null; kind: string; attributeGroupId: number | null; image: string; sortOrder: number; _count?: { products: number } }
type Group = { id: number; name: string; nameEn: string; appliesTo: string }

const faNum = (value: number) => value.toLocaleString('fa-IR')

/** Products under a category and all of its descendants. */
function subtreeCount(rows: Row[], id: number, seen = new Set<number>()): number {
  if (seen.has(id)) return 0
  seen.add(id)
  const own = rows.find((row) => row.id === id)?._count?.products || 0
  return own + rows.filter((row) => row.parentId === id).reduce((sum, row) => sum + subtreeCount(rows, row.id, seen), 0)
}

/** One category with its own actions, then its children (folded below the first level). */
function Node({ row, rows, groups, depth, fa }: { row: Row; rows: Row[]; groups: Group[]; depth: number; fa: boolean }) {
  const children = rows.filter((item) => item.parentId === row.id)
  const group = groups.find((item) => item.id === row.attributeGroupId)
  const total = subtreeCount(rows, row.id)
  const head = <span className="pck-row">
    <span className="pck-name">{row.image && <img src={row.image} alt="" loading="lazy" />}{row.name}</span>
    <small className="pck-count" title={fa ? 'کالا در این دسته و زیردسته‌هایش' : 'Products here and below'}>{faNum(total)} {fa ? 'کالا' : 'items'}</small>
    {children.length > 0 && <small className="pck-kids">{faNum(children.length)} {fa ? 'زیردسته' : 'sub'}</small>}
    {group && <small className="pck-group">{group.name}</small>}
    <span className="pck-acts">
      <a href={`?edit=${row.id}`} className="sa-link">{fa ? 'ویرایش' : 'Edit'}</a>
      {depth < 4 && <a href={`?new=1&parentId=${row.id}`} className="sa-link">{fa ? '+ زیردسته' : '+ Sub'}</a>}
      <a href={`/products?category=${encodeURIComponent(row.slug)}`} className="sa-link" target="_blank" rel="noreferrer">{fa ? 'نمایش' : 'View'}</a>
    </span>
  </span>
  if (!children.length || depth > 5) return <li>{head}</li>
  return <li><details open={depth === 0}><summary>{head}</summary>
    <ul className="pck-sub">{children.map((child) => <Node key={child.id} row={child} rows={rows} groups={groups} depth={depth + 1} fa={fa} />)}</ul>
  </details></li>
}

export default function AdminProductCatsPage() {
  const { t, locale } = useI18n()
  const fa = locale === 'fa'
  const [groups, setGroups] = useState<Group[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const load = useCallback(() => fetch('/api/admin/cms?type=productcats&tree=1').then((r) => (r.ok ? r.json() : [])).then((data) => setRows(Array.isArray(data) ? data : [])).catch(() => undefined), [])
  useEffect(() => {
    fetch('/api/admin/cms?type=productgroups').then((r) => (r.ok ? r.json() : [])).then(setGroups).catch(() => undefined)
    load()
    // The table below saves through its own requests; the trees follow it.
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [load])
  const label = (kind: CategoryKind) => (fa ? CATEGORY_KIND_LABEL[kind].fa : CATEGORY_KIND_LABEL[kind].en)
  const missing = templateRows().filter((item) => !rows.some((row) => row.slug === item.slug)).length

  async function buildTemplate() {
    setBusy(true); setNotice('')
    const response = await fetch('/api/admin/cms?type=productcats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'store-v1' }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { setNotice(data?.error || (fa ? 'ساخته نشد' : 'Not built')); return }
    setNotice(fa
      ? `${faNum(data.created)} دسته ساخته شد؛ ${faNum(data.kept)} دسته از قبل بود و دست نخورد.${data.elsewhere?.length ? ` این دسته‌ها جای دیگری از درخت هستند و منتقل نشدند: ${data.elsewhere.join('، ')}` : ''}`
      : `${data.created} created, ${data.kept} kept.`)
    load()
  }

  // A parent is chosen by its whole path ("Networking › Routers") so same names in different branches stay apart.
  const pathOf = (list: Row[], row: Row) => { const names = [row.name]; let at = row; for (let guard = 0; at.parentId && guard < 8; guard++) { const up = list.find((item) => item.id === at.parentId); if (!up) break; names.unshift(up.name); at = up } return names.join(' › ') }
  const S = { name: fa ? 'نام دسته' : 'Category name', place: fa ? 'جایگاه و مشخصات' : 'Place & attributes', look: fa ? 'نمایش در فروشگاه' : 'Shop display' }
  const fields: FieldDef[] = [
    { section: S.name, key: 'slug', label: t.slug, required: true, dir: 'ltr', hint: fa ? 'نشانی دسته در فروشگاه: /products?category=…' : 'The category address' },
    { section: S.name, key: 'name', label: t.title, required: true },
    { section: S.name, key: 'nameEn', label: t.englishTitle, dir: 'ltr', hideInTable: true },
    { section: S.place, key: 'parentId', label: fa ? 'دستهٔ مادر' : 'Parent', type: 'select', optionsFromRows: (list, editId) => [{ value: '', label: fa ? '— دستهٔ اصلی (بدون مادر)' : '— top level' }, ...list.filter((row) => row.id !== editId).map((row) => ({ value: String(row.id), label: `${pathOf(list, row)}${row.kind && !row.parentId ? ` — ${label(row.kind as CategoryKind)}` : ''}` })).sort((a, b) => a.label.localeCompare(b.label, 'fa'))] },
    { section: S.place, key: 'kind', label: fa ? 'بخش فروشگاه (زیردسته، بخشِ دستهٔ مادر را می‌گیرد)' : 'Half of the shop (a sub-category takes its parent\'s)', type: 'select', options: [{ value: 'PHYSICAL', label: label('PHYSICAL') }, { value: 'VIRTUAL', label: label('VIRTUAL') }, { value: '', label: label('') }] },
    { section: S.place, key: 'attributeGroupId', label: fa ? 'گروه مشخصات (فیلترهای این دسته)' : 'Attribute group', type: 'select', hideInTable: true, options: [{ value: '', label: '—' }, ...groups.map((group) => ({ value: String(group.id), label: `${group.name}${group.appliesTo !== 'ANY' ? ` — ${label(group.appliesTo as CategoryKind)}` : ''}` }))], hint: fa ? 'زیردسته‌ها گروه مادر را به ارث می‌برند؛ مشخصات انتخابی همین گروه، فیلترهای فروشگاه می‌شوند.' : undefined },
    { section: S.look, key: 'image', label: fa ? 'تصویر دسته' : 'Image', type: 'image', hideInTable: true },
    { section: S.look, key: 'description', label: fa ? 'توضیح کوتاه (بالای صفحهٔ دسته و برای موتور جست‌وجو)' : 'Short description', type: 'textarea', hideInTable: true },
    { section: S.look, key: 'sortOrder', label: fa ? 'ترتیب نمایش (کوچک‌تر، جلوتر)' : 'Order', type: 'number', hideInTable: true },
  ]
  const rootsOf = (kind: string) => rows.filter((row) => row.parentId == null && (row.kind || '') === kind)
  const halves: CategoryKind[] = ['VIRTUAL', 'PHYSICAL']
  const undecided = rootsOf('')
  const products = rows.reduce((sum, row) => sum + (row._count?.products || 0), 0)
  return <>
    <section className="pck-template" aria-labelledby="pck-template-title">
      <div>
        <h2 id="pck-template-title">{fa ? 'درخت دسته‌بندی پیشنهادی' : 'Ready category tree'}</h2>
        <p>{fa ? `${faNum(templateRows().length)} دسته و زیردستهٔ حرفه‌ای برای دو فروشگاه (دیجیتال و فیزیکی). فقط دسته‌هایی که نشانی‌شان آزاد است ساخته می‌شوند؛ دسته‌های فعلی شما جابه‌جا یا تغییر نام داده نمی‌شوند و بعد از ساخت، همه را می‌توانید ویرایش یا حذف کنید.` : 'A professional tree for both stores; only missing categories are created.'}</p>
        <ul className="pck-template-roots">{CATEGORY_TEMPLATE.map((root) => <li key={root.slug} className={`is-${root.kind.toLowerCase()}`}>{root.name}<small>{faNum(templateRows([root]).length - 1)}</small></li>)}</ul>
      </div>
      <div className="pck-template-act">
        <button type="button" className="btn btn-primary" disabled={busy || !missing} onClick={() => void buildTemplate()}>{busy ? (fa ? 'در حال ساخت…' : 'Building…') : missing ? (fa ? `ساخت ${faNum(missing)} دستهٔ پیشنهادی` : `Build ${missing}`) : (fa ? 'همهٔ دسته‌های پیشنهادی ساخته شده‌اند' : 'All built')}</button>
        {notice && <p role="status" className="pck-notice">{notice}</p>}
      </div>
    </section>
    <p className="pck-totals">{fa ? `${faNum(rows.length)} دسته · ${faNum(products)} کالای دسته‌بندی‌شده` : `${rows.length} categories · ${products} products`}</p>
    <section className="pck" aria-label={fa ? 'دو بخش فروشگاه' : 'The two halves of the shop'}>
      {halves.map((kind) => <article key={kind} className={`pck-half is-${kind.toLowerCase()}`}>
        <header><h2>{label(kind)}</h2><span className="num">{faNum(rows.filter((row) => row.kind === kind).length)} {fa ? 'دسته' : 'categories'}</span><a href={`?new=1&kind=${kind}`} className="sa-link">{fa ? '+ دستهٔ اصلی' : '+ Top category'}</a></header>
        {rootsOf(kind).length
          ? <ul className="pck-tree">{rootsOf(kind).map((root) => <Node key={root.id} row={root} rows={rows} groups={groups} depth={0} fa={fa} />)}</ul>
          : <p className="pck-empty">{fa ? 'هنوز دسته‌ای در این بخش نیست. درخت پیشنهادی را بسازید یا «+ دستهٔ اصلی» را بزنید.' : 'No category in this half yet.'}</p>}
      </article>)}
      {undecided.length > 0 && <article className="pck-half is-undecided">
        <header><h2>{label('')}</h2><span className="num">{faNum(undecided.length)}</span></header>
        <p className="pck-empty">{fa ? 'این دسته‌ها پیش از دو بخش ساخته شده‌اند و هم کالای فیزیکی دارند هم مجازی (یا هیچ‌کدام). هر کدام را ویرایش کنید و بخشش را انتخاب کنید.' : 'Made before the two halves; edit each and choose its half.'}</p>
        <ul className="pck-tree">{undecided.map((root) => <Node key={root.id} row={root} rows={rows} groups={groups} depth={0} fa={fa} />)}</ul>
      </article>}
    </section>
    <AdminCrud type="productcats" fields={fields} titleKey="name" />
  </>
}
