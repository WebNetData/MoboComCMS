import TicketCenter from '@/components/TicketCenter'
import s from './MerchantSupport.module.css'

/** Presentation only: the canonical Support UI, APIs, identity and department permissions remain owners. */
export default function MerchantSupport() {
  return <section className={s.support}>
    <TicketCenter workspace="pay" />
  </section>
}
