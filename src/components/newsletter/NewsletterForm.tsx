'use client'

import { useHumanCheck } from '@/components/HumanCheck'
import { useState, type FormEvent } from 'react'

/** Newsletter sign-up (double opt-in): a confirmation link is emailed. */
export default function NewsletterForm({ compact = false, title = 'عضویت در خبرنامه', text = 'تازه‌ترین مطالب، تخفیف‌ها و محصولات را در ایمیل خود بگیرید.' }: { compact?: boolean; title?: string; text?: string }) {
  const human = useHumanCheck('form')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !human.ready) return
    setBusy(true); setState(null)
    const response = await fetch('/api/newsletter/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, humanCheck: human.token }) }).catch(() => null)
    const data = await response?.json().catch(() => null)
    setBusy(false); human.reset()
    if (!response?.ok) { setState({ tone: 'error', text: data?.error || 'انجام نشد؛ دوباره تلاش کنید' }); return }
    setState({ tone: 'ok', text: data.status === 'ACTIVE' ? 'شما عضو خبرنامه هستید.' : 'یک ایمیل تأیید برایتان فرستادیم؛ با زدن پیوند آن عضویت کامل می‌شود.' })
    setEmail(''); setName('')
  }
  return <form className={`nl-form${compact ? ' is-compact' : ''}`} onSubmit={submit}>
    {!compact && <div className="nl-form-text"><h2>{title}</h2><p>{text}</p></div>}
    <div className="nl-form-row">
      {!compact && <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام (اختیاری)" aria-label="نام" maxLength={80} autoComplete="name" />}
      <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="ایمیل" required autoComplete="email" />
      <button type="submit" className="btn btn-primary" disabled={busy || !human.ready}>{busy ? '…' : 'عضویت'}</button>
    </div>
    {human.widget}
    {state && <p className={`nl-note is-${state.tone}`} role="status">{state.text}</p>}
  </form>
}
