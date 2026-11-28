import TicketCenter from '@/components/TicketCenter'
import s from './Pay.module.css'
import m from './dashboard/Dashboard.module.css'

/** Presentation only: the canonical Support UI, APIs, identity and department permissions remain owners. */
export default function MerchantSupport() {
  return <section className={`${s.page} ${m.dashboard} ${m.support}`}>
    <TicketCenter workspace="pay" />
  </section>
}
