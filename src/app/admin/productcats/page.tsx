'use client'

import { useEffect, useState } from 'react'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'
import { CATEGORY_KIND_LABEL, type CategoryKind } from '@/modules/catalog/domain/category-kind'

type Row = { id: number; name: string; nameEn: string; slug: string; parentId: number | null; kind: string; attributeGroupId: number | null }
type Group = { id: number; name: string; nameEn: string; appliesTo: string }

/** One half of the shop as its tree of categories, each with the attribute group it uses. */
function Branch({ rows, groups, parentId, depth = 0 }: { rows: Row[]; groups: Group[]; parentId: number | null; depth?: number }) {
  const here = rows.filter((row) => row.parentId === parentId)
  if (!here.length || depth > 5) return null
  return <ul className={depth ? 'pck-sub' : 'pck-tree'}>{here.map((row) => {
    const group = groups.find((item) => item.id === row.attributeGroupId)
    return <li key={row.id}><span className="pck-name">{row.name}</span>{group && <small className="pck-group">{group.name}</small>}<Branch rows={rows} groups={groups} parentId={row.id} depth={depth + 1} /></li>
  })}</ul>
}

export default function AdminProductCatsPage() {
  const { t, locale } = useI18n()
  const fa = locale === 'fa'
  const [groups, setGroups] = useState<Group[]>([])
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    fetch('/api/admin/cms?type=productgroups').then(r => r.ok ? r.json() : []).then(setGroups)
    const load = () => fetch('/api/admin/cms?type=productcats').then(r => r.ok ? r.json() : []).then((data) => setRows(Array.isArray(data) ? data : data?.rows || []))
    load()
    // The table below saves through its own requests; the two trees follow it.
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [])
  const label = (kind: CategoryKind) => (fa ? CATEGORY_KIND_LABEL[kind].fa : CATEGORY_KIND_LABEL[kind].en)
  const S = {
    name: fa ? 'نام دسته' : 'Category name',
    place: fa ? 'جایگاه و مشخصات' : 'Place & attributes',
  }
  const fields: FieldDef[] = [
    { section: S.name, key: 'slug', label: t.slug, required: true, dir: 'ltr' },
    { section: S.name, key: 'name', label: t.title, required: true },
    { section: S.name, key: 'nameEn', label: t.englishTitle, dir: 'ltr', hideInTable: true },
    { section: S.place, key: 'kind', label: fa ? 'بخش فروشگاه (زیردسته، بخشِ دستهٔ مادر را می‌گیرد)' : 'Half of the shop (a sub-category takes its parent\'s)', type: 'select', options: [{ value: 'PHYSICAL', label: label('PHYSICAL') }, { value: 'VIRTUAL', label: label('VIRTUAL') }, { value: '', label: label('') }] },
    { section: S.place, key: 'parentId', label: 'Parent / دستهٔ مادر', type: 'select', optionsFromRows: (list, editId) => [{ value: '', label: '—' }, ...list.filter(row => row.id !== editId).map(row => ({ value: String(row.id), label: `${row.name}${row.kind ? ` — ${label(row.kind as CategoryKind)}` : ''}` }))] },
    { section: S.place, key: 'attributeGroupId', label: 'Attribute group / گروه مشخصات', type: 'select', options: [{ value: '', label: '—' }, ...groups.map(group => ({ value: String(group.id), label: `${group.name}${group.appliesTo !== 'ANY' ? ` — ${label(group.appliesTo as CategoryKind)}` : ''}` }))] },
  ]
  // Roots are sorted into their half; whatever hangs under a root is drawn with it.
  const rootsOf = (kind: string) => rows.filter((row) => row.parentId == null && (row.kind || '') === kind)
  const halves: CategoryKind[] = ['PHYSICAL', 'VIRTUAL']
  const undecided = rootsOf('')
  return <>
    <section className="pck" aria-label={fa ? 'دو بخش فروشگاه' : 'The two halves of the shop'}>
      {halves.map((kind) => <article key={kind} className={`pck-half is-${kind.toLowerCase()}`}>
        <header><h2>{label(kind)}</h2><span className="num">{rows.filter((row) => row.kind === kind).length.toLocaleString(fa ? 'fa-IR' : 'en-US')} {fa ? 'دسته' : 'categories'}</span></header>
        {rootsOf(kind).length
          ? <ul className="pck-tree">{rootsOf(kind).map((root) => {
              const group = groups.find((item) => item.id === root.attributeGroupId)
              return <li key={root.id}><span className="pck-name">{root.name}</span>{group && <small className="pck-group">{group.name}</small>}<Branch rows={rows} groups={groups} parentId={root.id} depth={1} /></li>
            })}</ul>
          : <p className="pck-empty">{fa ? 'هنوز دسته‌ای در این بخش نیست. در فرم پایین یک دسته بسازید و همین بخش را برایش انتخاب کنید.' : 'No category in this half yet.'}</p>}
      </article>)}
      {undecided.length > 0 && <article className="pck-half is-undecided">
        <header><h2>{label('')}</h2><span className="num">{undecided.length.toLocaleString(fa ? 'fa-IR' : 'en-US')}</span></header>
        <p className="pck-empty">{fa ? 'این دسته‌ها پیش از دو بخش ساخته شده‌اند و هم کالای فیزیکی دارند هم مجازی (یا هیچ‌کدام). هر کدام را ویرایش کنید و بخشش را انتخاب کنید.' : 'These categories predate the halves. Edit each and choose its half.'}</p>
        <ul className="pck-tree">{undecided.map((root) => <li key={root.id}><span className="pck-name">{root.name}</span><Branch rows={rows} groups={groups} parentId={root.id} depth={1} /></li>)}</ul>
      </article>}
    </section>
    <AdminCrud type="productcats" fields={fields} titleKey="name" />
  </>
}
