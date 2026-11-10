'use client'
import SectionName from '@/components/site/SectionName'

import { useMemo } from 'react'
import Link from '@/components/AppLink'
import Icon from '@/components/site/Icon'
import HostingCatalog from '@/components/hosting/HostingCatalog'
import DomainSearch from '@/components/hosting/DomainSearch'
import { useRouter, useSearchParams } from '@/platform/routing/navigation'
import type { CheckoutGatewayChoice } from '@/modules/checkout/ui/client'
import type { PublicHostingProduct } from '@/modules/hosting/domain/catalog'
import { REGION_LABEL, regionOf, type CloudRegion } from '@/modules/hosting/domain/locations'

type What = 'server' | 'hosting' | 'domain'
const WHAT: { id: What; title: string; text: string; icon: string }[] = [
  { id: 'server', title: 'سرور', text: 'مجازی، ابری یا اختصاصی؛ با منابع مشخص، دوره‌ای یا ساعتی', icon: 'server' },
  { id: 'hosting', title: 'هاست سایت', text: 'هاست اشتراکی، ابری یا نمایندگی با کنترل‌پنل', icon: 'layers' },
  { id: 'domain', title: 'دامنه', text: 'ثبت یا انتقال دامنهٔ ایرانی و بین‌المللی', icon: 'globe' },
]
const REGION_TEXT: Record<CloudRegion, string> = {
  IR: 'دیتاسنترهای داخل کشور؛ پینگ پایین برای کاربران ایرانی',
  INTL: 'دیتاسنترهای اروپا، آسیا و آمریکا؛ آی‌پی و دسترسی بین‌المللی',
}
const nf = (n: number) => n.toLocaleString('fa-IR')

/** Step by step: what to build, Iran or abroad, which datacenter, then the plan and checkout of the existing catalogue. */
export default function CloudWizard({ servers, hosting, gateways, minHours, allowed }: { servers: PublicHostingProduct[]; hosting: PublicHostingProduct[]; gateways: CheckoutGatewayChoice[]; minHours: number; allowed: boolean }) {
  const router = useRouter(), params = useSearchParams()
  const what = (['server', 'hosting', 'domain'] as const).find((w) => w === params.get('type')) || null
  const region = (['IR', 'INTL'] as const).find((r) => r === params.get('region')) || null
  const requestedLocation = params.get('loc') || ''
  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) { if (value) q.set(key, value); else q.delete(key) }
    router.replace(`/dashboard/cloud/new${q.toString() ? `?${q}` : ''}`, { scroll: false })
  }
  const pool = useMemo(() => (what === 'server' ? servers : what === 'hosting' ? hosting : []), [what, servers, hosting])
  const byRegion = useMemo(() => ({ IR: pool.filter((p) => regionOf(p.location) === 'IR'), INTL: pool.filter((p) => regionOf(p.location) !== 'IR') }), [pool])
  const inRegion = region ? byRegion[region] : []
  const location = inRegion.some((p) => p.location.trim() === requestedLocation) ? requestedLocation : ''
  const places = [...new Set(inRegion.map((p) => p.location.trim()).filter(Boolean))]
  const shown = location ? inRegion.filter((p) => p.location.trim() === location) : inRegion
  const step = !what ? 1 : what === 'domain' ? 2 : !region ? 2 : 3

  if (!allowed) return <div className="dt-page cw-page" dir="rtl"><div className="dt-empty"><Icon name="lock" size={28} /><b>این بخش فعلاً برای حساب شما باز نیست</b><span>از پشتیبانی راهنمایی بگیرید.</span><Link className="btn btn-primary" href="/dashboard/tickets">پشتیبانی</Link></div></div>
  return <div className="dt-page cw-page" dir="rtl">
    <header className="cw-hero">
      <span className="cw-orb" aria-hidden="true"><Icon name="cloud" size={28} /></span>
      <div><p className="cw-eyebrow"><SectionName id="hosting" en="MoboCom Cloud">موبوکام کلاد</SectionName></p><h1>ساخت سرویس تازه</h1><p>نوع سرویس، کشور دیتاسنتر و پلن را انتخاب کنید؛ پرداخت با کیف پول یا درگاه و تحویل در «سرویس‌های من».</p></div>
    </header>
    <ol className="cw-steps" aria-label="مراحل">
      {(what === 'domain' ? ['نوع سرویس', 'جست‌وجو و ثبت دامنه'] : ['نوع سرویس', 'ایران یا خارج', 'پلن و پرداخت']).map((label, i) => <li key={label} className={step > i + 1 ? 'is-done' : step === i + 1 ? 'is-on' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span>{nf(i + 1)}</span>{label}</li>)}
    </ol>

    <section className="cw-block" aria-labelledby="cw-what">
      <h2 id="cw-what">چه چیزی می‌خواهید بسازید؟</h2>
      <div className="cw-choices" role="radiogroup" aria-labelledby="cw-what">{WHAT.map((item) => {
        const count = item.id === 'server' ? servers.length : item.id === 'hosting' ? hosting.length : null
        return <label key={item.id} className={`cw-choice${what === item.id ? ' is-on' : ''}`}>
          <input type="radio" name="cloud-service-type" value={item.id} checked={what === item.id} aria-label={item.title} onChange={() => go({ type: item.id, region: null, loc: null })} />
          <span className="cw-choice-icon" aria-hidden="true"><Icon name={item.icon} size={24} /></span>
          <b>{item.title}</b><span>{item.text}</span>
          {count !== null && <small>{count ? `${nf(count)} پلن` : 'به‌زودی'}</small>}
        </label>
      })}</div>
    </section>

    {what === 'domain' && <section className="cw-block" aria-label="جست‌وجو و سفارش دامنه"><DomainSearch signedIn surface="dashboard" /></section>}

    {what && what !== 'domain' && <section className="cw-block" aria-labelledby="cw-region">
      <h2 id="cw-region">{what === 'hosting' ? 'هاست کجا باشد؟' : 'سرور کجا باشد؟'}</h2>
      <div className="cw-choices is-two" role="radiogroup" aria-labelledby="cw-region">{(['IR', 'INTL'] as const).map((r) => {
        const list = byRegion[r]
        return <label key={r} className={`cw-choice cw-region is-${r.toLowerCase()}${region === r ? ' is-on' : ''}`}>
          <input type="radio" name="cloud-region" value={r} checked={region === r} disabled={!list.length} aria-label={REGION_LABEL[r]} onChange={() => go({ region: r, loc: null })} />
          <span className="cw-flag" aria-hidden="true">{r === 'IR' ? 'IR' : 'EU · US · AS'}</span>
          <b>{REGION_LABEL[r]}</b><span>{REGION_TEXT[r]}</span>
          <small>{list.length ? `${nf(list.length)} پلن` : 'به‌زودی'}</small>
        </label>
      })}</div>
      {region && places.length > 1 && <div className="cw-places" role="radiogroup" aria-label="دیتاسنتر">
        <label className={!location ? 'is-on' : ''}><input type="radio" name="cloud-location" checked={!location} onChange={() => go({ loc: null })} />همهٔ دیتاسنترها</label>
        {places.map((place) => <label key={place} className={location === place ? 'is-on' : ''}><input type="radio" name="cloud-location" checked={location === place} onChange={() => go({ loc: place })} /><Icon name="pin" size={14} />{place}</label>)}
      </div>}
    </section>}

    {what && what !== 'domain' && region && <section className="cw-block cw-plans" aria-labelledby="cw-plans">
      <h2 id="cw-plans">پلن و دورهٔ پرداخت</h2>
      {shown.length ? <HostingCatalog key={`${what}-${region}-${location}`} products={shown} gateways={gateways} signedIn minHours={minHours} surface="dashboard" />
        : <div className="dt-empty"><Icon name="server" size={28} /><b>در این مکان پلنی عرضه نشده است</b><span>مکان یا کشور دیگری را انتخاب کنید یا از پشتیبانی سرور اختصاصی بخواهید.</span><Link className="btn btn-ghost" href="/dashboard/tickets">درخواست از پشتیبانی</Link></div>}
    </section>}
  </div>
}
