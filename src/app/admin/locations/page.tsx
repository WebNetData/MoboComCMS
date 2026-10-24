'use client'

import AdminCrud, { type FieldDef } from '../cms/AdminCrud'
import { useI18n } from '@/i18n/LocaleProvider'

export default function AdminLocationsPage() {
  const { t, locale } = useI18n()
  const S = {
    place: locale === 'fa' ? 'مکان' : 'Place',
    map: locale === 'fa' ? 'مختصات و وضعیت' : 'Coordinates & state',
  }
  const fields: FieldDef[] = [
    { section: S.place, key: 'country', label: t.country, required: true, dir: 'ltr' },
    { section: S.place, key: 'countryFa', label: t.countryFa },
    { section: S.place, key: 'city', label: t.city, dir: 'ltr' },
    { section: S.place, key: 'flag', label: t.flag, dir: 'ltr' },
    { section: S.map, key: 'lat', label: t.lat, type: 'number', required: true },
    { section: S.map, key: 'lng', label: t.lng, type: 'number', required: true },
    { section: S.map, key: 'active', label: t.active, type: 'checkbox' },
  ]
  return <AdminCrud type="locations" fields={fields} titleKey="country" />
}
