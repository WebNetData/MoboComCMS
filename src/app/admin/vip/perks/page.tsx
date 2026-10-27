'use client'

import Link from '@/components/AppLink'
import { Notice, VipShell, fa, useJson } from '../shared'
import VocabularyManager from '../../cms/VocabularyManager'

type Perk = { key: string; section: string; label: string; count: number | null; state?: string; href: string }

/** Everything VIP unlocks, grouped by section, with a link to where each is managed. */
export default function VipPerksPage() {
  const { data, error } = useJson<{ perks: Perk[] }>('/api/admin/membership/perks')
  const groups = new Map<string, Perk[]>()
  for (const perk of data?.perks || []) groups.set(perk.section, [...(groups.get(perk.section) || []), perk])
  return <VipShell title="مزایای اشتراک ویژه در هر بخش">
    {error && <Notice tone="error">{error}</Notice>}
    <p className="sa-hint">این صفحه نشان می‌دهد اشتراک ویژه در هر بخش سایت چه چیزی را باز می‌کند. برای تغییر هر مورد روی «مدیریت» بزنید؛ مزایایی که روی کارت پلن‌ها نمایش داده می‌شوند در <Link href="/admin/vip/plans" className="sa-link">پلن‌ها</Link> ویرایش می‌شوند.</p>
    {!data ? <div className="sa-skeleton" aria-busy="true" /> : <div className="vp-grid">{[...groups].map(([section, perks]) => <section key={section} className="sa-card">
      <header className="sa-card-head"><h2>{section}</h2></header>
      <ul className="sa-rows">{perks.map((perk) => <li key={perk.key}><Link href={perk.href}>
        <span className="sa-grow"><b>{perk.label}</b></span>
        {perk.count !== null ? <span className={`sa-state ${perk.count ? 'is-info' : ''} num`}>{fa(perk.count)}</span> : <span className={`sa-state ${perk.state === 'خاموش' ? '' : 'is-ok'}`}>{perk.state}</span>}
        <span className="sa-link">مدیریت</span>
      </Link></li>)}</ul>
    </section>)}</div>}
    {/* The perk lines the plans show, picked per plan and edited once here. */}
    <section className="sa-card" aria-labelledby="vip-perk-lines"><header className="sa-card-head"><h2 id="vip-perk-lines">متن مزایا روی کارت پلن‌ها</h2></header><VocabularyManager section="membership" noun="پلن" /></section>
  </VipShell>
}
