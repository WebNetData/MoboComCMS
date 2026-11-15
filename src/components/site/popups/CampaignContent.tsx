'use client'

import { useState } from 'react'
import Icon from '@/components/site/Icon'
import { POPUP_KINDS, type PopupFace } from '@/modules/popups/domain/popups'
import { popupPresentation, type CampaignDesign } from '@/modules/popups/domain/campaigns'
import { customPopupStyle } from '@/modules/popups/domain/custom'
import CampaignArtwork from './CampaignArtwork'
import './campaign-popup.css'
import './custom-popup.css'

/** Campaigns are presentation of the same popup, audience and lifecycle. */
export default function CampaignContent({ popup, variant, titleId, onClose, onAction }: { popup: PopupFace; variant: CampaignDesign | 'custom'; titleId: string; onClose?: () => void; onAction?: (event?: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const copy = popupPresentation(popup.presentation)
  const custom = variant === 'custom' ? customPopupStyle(copy.custom) : null
  const kind = POPUP_KINDS.find(item => item.id === popup.kind) || POPUP_KINDS[0]
  const badge = copy.badge || (custom ? kind.label : '')
  const buttonIcon = custom?.buttonIcon ?? 'arrow'
  const [feedback, setFeedback] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const external = /^https:/.test(popup.actionUrl)
  async function copyCode() {
    try { await navigator.clipboard.writeText(copy.code); setFeedback('کد کپی شد') }
    catch { setFeedback('کپی خودکار ممکن نشد؛ کد را انتخاب و کپی کنید.') }
  }
  return <div className={`spp-card spp-campaign campaign-${variant}${custom ? ' spp-custom' : ''}`} data-layout={custom?.layout} data-palette={custom?.palette} data-accent={custom?.accent} data-align={custom?.align} data-width={custom?.width} data-fit={custom?.imageFit} data-button={custom?.buttonStyle}>
    {!popup.mustConfirm && <button type="button" className="spp-x" aria-label="بستن" onClick={onClose}><Icon name="close" size={18} /></button>}
    {custom?.layout !== 'text' && <div className="spp-campaign-art" aria-hidden="true">
      {popup.image && !imageFailed ? <img src={popup.image} key={popup.image} alt="" decoding="async" onError={() => setImageFailed(true)} /> : variant === 'custom' ? <div className="spp-custom-placeholder"><Icon name={kind.icon} size={64} /><span>{kind.label}</span></div> : <CampaignArtwork variant={variant} />}
      {!custom && <span className="spp-art-caption">MOBOCOM · {variant === 'membership' ? 'MEMBERSHIP' : 'SPECIAL SELECTION'}</span>}
    </div>}
    <div className="spp-campaign-copy">
      {badge && <span className="spp-campaign-badge"><i aria-hidden="true" />{badge}</span>}
      <h2 id={titleId} className="spp-title">{popup.title}</h2>
      {copy.highlight && <div className="spp-campaign-highlight"><strong dir="auto">{copy.highlight}</strong>{copy.highlightLabel && <span>{copy.highlightLabel}</span>}</div>}
      {popup.body && <p className="spp-note">{popup.body}</p>}
      {copy.detail && <p className="spp-campaign-detail"><Icon name={custom ? kind.icon : variant === 'membership' ? 'shield' : 'ticket'} size={18} /><span>{copy.detail}</span></p>}
      {copy.code && <div className="spp-coupon"><span>کد پیشنهاد</span><code dir="auto">{copy.code}</code><button type="button" onClick={() => void copyCode()} aria-label="کپی کد پیشنهاد"><Icon name="copy" size={17} />کپی</button></div>}
      <p className="spp-copy-feedback" role="status" aria-live="polite">{feedback}</p>
      <div className="spp-actions">
        {popup.actionUrl && <a className="spp-go" href={popup.actionUrl} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={onAction}>{popup.actionLabel}{buttonIcon !== 'none' && <Icon name={buttonIcon} size={18} />}</a>}
        {(popup.mustConfirm || popup.closeLabel || !popup.actionUrl) && <button type="button" className={popup.actionUrl ? 'spp-stay' : 'spp-go'} onClick={onClose}>{popup.closeLabel || (popup.mustConfirm ? 'متوجه شدم' : 'بستن')}</button>}
      </div>
      {copy.footnote && <p className="spp-campaign-footnote">{copy.footnote}</p>}
    </div>
  </div>
}
