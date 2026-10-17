'use client'

import { useState, type ReactNode } from 'react'

export type SeasonView = { number: number; name: string; episodes: { id: number; number: number; title: string; summary: string; summaryHtml?: string; still: string; runtime: string; airDate: string; vip: boolean; linkCount: number; links: ReactNode }[] }

/** Season tabs + collapsible episode rows with their download box. */
export default function SeasonTabs({ seasons, fa }: { seasons: SeasonView[]; fa: boolean }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState<number | null>(seasons[0]?.episodes[0]?.id ?? null)
  if (!seasons.length) return <p className="muted">{fa ? 'قسمتی منتشر نشده است.' : 'No episodes yet.'}</p>
  const season = seasons[Math.min(active, seasons.length - 1)]
  const num = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US')
  return (
    <div className="cn-seasons">
      <div className="cn-season-tabs" role="tablist">
        {seasons.map((s, i) => (
          <button key={s.number} type="button" role="tab" aria-selected={i === active} className={i === active ? 'is-active' : ''} onClick={() => { setActive(i); setOpen(s.episodes[0]?.id ?? null) }}>
            {s.name || (fa ? `فصل ${num(s.number)}` : `Season ${s.number}`)}<small>{num(s.episodes.length)} {fa ? 'قسمت' : 'ep.'}</small>
          </button>
        ))}
      </div>
      <ol className="cn-episodes">
        {season.episodes.map((episode) => {
          const isOpen = open === episode.id
          return (
            <li key={episode.id} className={isOpen ? 'is-open' : ''}>
              <button type="button" className="cn-episode-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : episode.id)}>
                <span className="cn-ep-no">{num(episode.number)}</span>
                {episode.still ? <img src={episode.still} alt="" loading="lazy" /> : null}
                <span className="cn-ep-title"><b>{episode.title || (fa ? `قسمت ${num(episode.number)}` : `Episode ${episode.number}`)}</b><small>{[episode.runtime, episode.airDate].filter(Boolean).join(' · ')}</small></span>
                {episode.vip && <span className="vip-chip is-small">♛ VIP</span>}
                <span className="cn-ep-count">{num(episode.linkCount)} {fa ? 'لینک' : 'links'}</span>
                <span className="cn-ep-caret" aria-hidden="true">⌄</span>
              </button>
              {isOpen && <div className="cn-episode-body">{episode.summaryHtml ? <div className="prose cn-episode-summary" dangerouslySetInnerHTML={{ __html: episode.summaryHtml }} /> : episode.summary ? <p className="muted">{episode.summary}</p> : null}{episode.links}</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
