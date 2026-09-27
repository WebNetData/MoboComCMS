'use client'

import { useEffect, useState, type ReactNode } from 'react'

export type PollData = {
  id: number; postId: number; name: string; title: string; type: string; min: number; max: number; results: string
  closed: boolean; closesAt: string | null; voters: number; mine: string[]; showResults: boolean
  options: { id: string; label: string; votes: number | null; percent: number | null }[]
}

const fa = (n: number) => n.toLocaleString('fa-IR')

/** One poll: choose and vote, then (depending on settings) see the results. */
export function Poll({ poll: initial, signedIn, canManage, onLogin, onError }: { poll: PollData; signedIn: boolean; canManage: boolean; onLogin: () => void; onError: (message: string) => void }) {
  const [poll, setPoll] = useState(initial)
  const [picked, setPicked] = useState<string[]>(initial.mine)
  const [editing, setEditing] = useState(initial.mine.length === 0)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPoll(initial); setPicked(initial.mine); setEditing(initial.mine.length === 0) }, [initial])
  const multiple = poll.type === 'multiple'
  const voted = poll.mine.length > 0
  const showingResults = poll.showResults && (!editing || poll.closed)

  async function send(action: 'vote' | 'unvote' | 'close' | 'open') {
    if (!signedIn) { onLogin(); return }
    setBusy(true)
    const response = await fetch(`/api/forum/polls/${poll.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, options: picked }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) { onError(data?.error || 'انجام نشد'); return }
    setPoll(data.poll); setPicked(data.poll.mine); setEditing(data.poll.mine.length === 0)
  }

  const toggle = (id: string) => setPicked((list) => (multiple ? (list.includes(id) ? list.filter((item) => item !== id) : list.length < poll.max ? [...list, id] : list) : [id]))

  return <div className="fp-poll" role="group" aria-label={poll.title || 'نظرسنجی'}>
    <div className="fp-poll-head">
      <b>📊 {poll.title || 'نظرسنجی'}</b>
      <small>{multiple ? `حداکثر ${fa(poll.max)} گزینه` : 'یک گزینه'} · {fa(poll.voters)} رأی‌دهنده{poll.closed ? ' · بسته شد' : poll.closesAt ? ` · تا ${new Date(poll.closesAt).toLocaleDateString('fa-IR')}` : ''}</small>
    </div>
    {showingResults ? <ul className="fp-results">{poll.options.map((option) => <li key={option.id} className={poll.mine.includes(option.id) ? 'is-mine' : ''}>
      <div className="fp-row"><span>{poll.mine.includes(option.id) && '✓ '}{option.label}</span><b className="num">{fa(option.percent ?? 0)}٪</b></div>
      <div className="fp-bar" aria-hidden="true"><span style={{ width: `${option.percent ?? 0}%` }} /></div>
      <small className="num">{fa(option.votes ?? 0)} رأی</small>
    </li>)}</ul>
      : <fieldset className="fp-options" disabled={poll.closed || busy}>
        <legend className="fx-sr">گزینه‌ها</legend>
        {poll.options.map((option) => <label key={option.id} className={picked.includes(option.id) ? 'is-picked' : ''}>
          <input type={multiple ? 'checkbox' : 'radio'} name={`poll-${poll.id}`} checked={picked.includes(option.id)} onChange={() => toggle(option.id)} />
          <span>{option.label}</span>
        </label>)}
      </fieldset>}
    <div className="fp-actions">
      {!poll.closed && (showingResults
        ? voted && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>تغییر رأی</button>
        : <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || picked.length < poll.min || picked.length > poll.max} onClick={() => void send('vote')}>{busy ? '…' : voted ? 'ثبت رأی جدید' : 'ثبت رأی'}</button>
            {voted && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send('unvote')}>پس‌گرفتن رأی</button>}
            {voted && poll.showResults && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>نتایج</button>}
          </>)}
      {!poll.showResults && !poll.closed && <small className="fx-muted">{poll.results === 'on_close' ? 'نتایج پس از بسته‌شدن نظرسنجی نمایش داده می‌شود' : 'نتایج پس از رأی دادن نمایش داده می‌شود'}</small>}
      {canManage && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send(poll.closed ? 'open' : 'close')}>{poll.closed ? 'بازکردن نظرسنجی' : 'بستن نظرسنجی'}</button>}
    </div>
  </div>
}

/**
 * The post body (server-rendered HTML) with live polls placed where the
 * Markdown renderer left their slots. The HTML is split at the slots (always
 * top-level blocks), so no portal ever reaches into server-rendered markup.
 */
export function CookedWithPolls({ html, polls, ...rest }: { html: string; polls: PollData[]; signedIn: boolean; canManage: boolean; onLogin: () => void; onError: (message: string) => void }) {
  if (!polls.length) return <div className="fx-cooked" dangerouslySetInnerHTML={{ __html: html }} />
  const parts = html.split(/<div class="fr-poll-slot" data-poll="([a-z0-9_-]*)"><\/div>/)
  const placed = new Set<number>()
  const nodes: ReactNode[] = []
  parts.forEach((part, index) => {
    if (index % 2 === 0) { if (part) nodes.push(<div key={`h${index}`} className="fx-cooked-part" dangerouslySetInnerHTML={{ __html: part }} />); return }
    const poll = polls.find((row) => row.name === part && !placed.has(row.id))
    if (poll) { placed.add(poll.id); nodes.push(<Poll key={`p${poll.id}`} poll={poll} {...rest} />) }
  })
  for (const poll of polls) if (!placed.has(poll.id)) nodes.push(<Poll key={`p${poll.id}`} poll={poll} {...rest} />)
  return <div className="fx-cooked">{nodes}</div>
}
