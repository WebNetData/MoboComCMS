'use client'

import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminLocationsPage() {
  const { t } = useI18n()
  const fields: FieldDef[] = [
    { key: 'country', label: t.country, required: true, dir: 'ltr' },
    { key: 'countryFa', label: t.countryFa },
    { key: 'city', label: t.city, dir: 'ltr' },
    { key: 'flag', label: t.flag, dir: 'ltr' },
    { key: 'lat', label: t.lat, type: 'number', required: true },
    { key: 'lng', label: t.lng, type: 'number', required: true },
    { key: 'active', label: t.active, type: 'checkbox' },
  ]
  return <AdminCrud type="locations" fields={fields} titleKey="country" />
}
