'use client'

import CampaignArtwork from '@/components/site/popups/CampaignArtwork'
import { POPUP_CAMPAIGNS, type CampaignDesign } from '@/modules/popups/domain/campaigns'

export default function CampaignGallery({ onChoose }: { onChoose: (id: CampaignDesign) => void }) {
  return <section className="pm-gallery" aria-labelledby="popup-design-library-title">
    <header><div><span className="pm-kicker">مجموعهٔ طرح‌ها</span><h2 id="popup-design-library-title">پیشنهادتان را با یک طراحی به‌یادماندنی نشان دهید</h2><p>یک طرح انتخاب کنید، متن و تصویر خودتان را جایگزین کنید و پیش از انتشار، نمایش واقعی را ببینید.</p></div><span className="pm-gallery-count">۳ طرح قابل ویرایش</span></header>
    <div className="pm-gallery-grid">{POPUP_CAMPAIGNS.map(item => <article key={item.id} className={`pm-preset preset-${item.id}`}>
      <div className="pm-preset-art" aria-hidden="true"><CampaignArtwork variant={item.id} /><span>{item.id === 'campaign' ? 'یک پیشنهاد، هزار انتخاب' : item.id === 'ticket' ? 'بلیت انتخاب بعدی شما' : 'یک دعوت ویژه'}</span></div>
      <div className="pm-preset-copy"><h3>{item.name}</h3><p>{item.description}</p><button type="button" className="btn btn-ghost" onClick={() => onChoose(item.id)} aria-label={`استفاده از طرح ${item.name}`}>استفاده از طرح <span aria-hidden="true">←</span></button></div>
    </article>)}</div>
    <p className="sa-hint">انتخاب طرح فقط یک پیش‌نویس می‌سازد. مبلغ، تخفیف، شرایط و لینک پیشنهاد را خودتان وارد کنید؛ قالب کد تخفیف واقعی ایجاد نمی‌کند.</p>
  </section>
}
