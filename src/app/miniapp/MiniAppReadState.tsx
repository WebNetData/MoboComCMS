'use client'

import { useI18n } from '@/i18n/LocaleProvider'
import Icon from '@/components/site/Icon'

export default function MiniAppReadState({ error, retry }: { error: boolean; retry: () => void }) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  return error ? <div className="tg-state" role="alert"><Icon name="globe" size={26} /><h2>{fa ? 'ارتباط برقرار نشد' : 'Could not connect'}</h2><p>{fa ? 'دریافت اطلاعات انجام نشد. دوباره تلاش کنید.' : 'We could not load this information. Please try again.'}</p><button type="button" className="btn btn-ghost" onClick={retry}>{fa ? 'تلاش دوباره' : 'Try again'}</button></div>
    : <div className="tg-skeleton" role="status" aria-label={fa ? 'در حال بارگذاری' : 'Loading'} aria-busy="true"><i /><i /><i /></div>
}
