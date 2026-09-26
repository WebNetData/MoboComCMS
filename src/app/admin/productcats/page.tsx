'use client'

import { useEffect, useState } from 'react'
import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminProductCatsPage() {
  const { t } = useI18n()
  const [groups, setGroups] = useState<{ id: number; name: string; nameEn: string }[]>([])
  useEffect(() => { fetch('/api/admin/cms?type=productgroups').then(r => r.ok ? r.json() : []).then(setGroups) }, [])
  const fields: FieldDef[] = [
    { key: 'slug', label: t.slug, required: true, dir: 'ltr' },
    { key: 'name', label: t.title, required: true },
    { key: 'nameEn', label: t.englishTitle, dir: 'ltr' },
    { key: 'parentId', label: 'Parent / دستهٔ مادر', type: 'select', optionsFromRows: (rows, editId) => [{ value: '', label: '—' }, ...rows.filter(row => row.id !== editId).map(row => ({ value: String(row.id), label: row.name }))] },
    { key: 'attributeGroupId', label: 'Attribute group / گروه مشخصات', type: 'select', options: [{ value: '', label: '—' }, ...groups.map(group => ({ value: String(group.id), label: group.name }))] },
  ]
  return <AdminCrud type="productcats" fields={fields} titleKey="name" />
}
