'use client'

import { useState } from 'react'
import Icon from '@/components/site/Icon'
import type { PopupFace } from '@/modules/popups/domain/popups'
import { popupPresentation, type CampaignDesign } from '@/modules/popups/domain/campaigns'
import CampaignArtwork from './CampaignArtwork'
import './campaign-popup.css'

/** Campaigns are presentation of the same popup, audience and lifecycle. */
export default function CampaignContent({ popup, variant, titleId, onClose, onAction }: { popup: PopupFace; variant: CampaignDesign; titleId: string; onClose?: () => void; onAction?: (event?: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const copy = popupPresentation(popup.presentation)
  const [feedback, setFeedback] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const external = /^https:/.test(popup.actionUrl)
  async function copyCode() {
    try { await navigator.clipboard.writeText(copy.code); setFeedback('کد کپی شد') }
    catch { setFeedback('کپی خودکار ممکن نشد؛ کد را انتخاب و کپی کنید.') }
  }
  return <div className={`spp-card spp-campaign campaign-${variant}`}>
    {!popup.mustConfirm && <button type="button" className="spp-x" aria-label="بستن" onClick={onClose}><Icon name="close" size={18} /></button>}
    <div className="spp-campaign-art" aria-hidden="true">
      {popup.image && !imageFailed ? <img src={popup.image} key={popup.image} alt="" decoding="async" onError={() => setImageFailed(true)} /> : <CampaignArtwork variant={variant} />}
      <span className="spp-art-caption">MOBOCOM · {variant === 'membership' ? 'MEMBERSHIP' : 'SPECIAL SELECTION'}</span>
    </div>
    <div className="spp-campaign-copy">
      {copy.badge && <span className="spp-campaign-badge"><i aria-hidden="true" />{copy.badge}</span>}
      <h2 id={titleId} className="spp-title">{popup.title}</h2>
      {copy.highlight && <div className="spp-campaign-highlight"><strong dir="auto">{copy.highlight}</strong>{copy.highlightLabel && <span>{copy.highlightLabel}</span>}</div>}
      {popup.body && <p className="spp-note">{popup.body}</p>}
      {copy.detail && <p className="spp-campaign-detail"><Icon name={variant === 'membership' ? 'shield' : 'ticket'} size={18} /><span>{copy.detail}</span></p>}
      {copy.code && <div className="spp-coupon"><span>کد پیشنهاد</span><code dir="auto">{copy.code}</code><button type="button" onClick={() => void copyCode()} aria-label="کپی کد پیشنهاد"><Icon name="copy" size={17} />کپی</button></div>}
      <p className="spp-copy-feedback" role="status" aria-live="polite">{feedback}</p>
      <div className="spp-actions">
        {popup.actionUrl && <a className="spp-go" href={popup.actionUrl} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={onAction}>{popup.actionLabel}<Icon name="arrow" size={18} /></a>}
        {(popup.mustConfirm || popup.closeLabel || !popup.actionUrl) && <button type="button" className={popup.actionUrl ? 'spp-stay' : 'spp-go'} onClick={onClose}>{popup.closeLabel || (popup.mustConfirm ? 'متوجه شدم' : 'بستن')}</button>}
      </div>
      {copy.footnote && <p className="spp-campaign-footnote">{copy.footnote}</p>}
    </div>
  </div>
}
