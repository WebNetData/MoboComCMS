'use client'

import type { FormEvent } from 'react'
import { faDate } from '@/app/admin/store/shared'

export type PendingBusinessRequest = { id: number; kind: string; name: string; domain: string; category: string; note: string; requester: { name: string }; createdAt: string }
export default function BusinessRequestDecision({ request, busy, decide }: { request: PendingBusinessRequest; busy: boolean; decide: (input: Record<string, unknown>) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget), decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    if (decision !== 'APPROVED' && decision !== 'REJECTED') return
    void decide({ action: 'request.decide', requestId: request.id, decision, decisionNote: form.get('decisionNote'), slug: form.get('slug'), acknowledgeRepresentative: form.get('acknowledgeRepresentative') === 'on' })
  }
  return <details className="sa-card"><summary style={{ cursor: 'pointer', lineHeight: 2 }}><strong>{request.name}</strong> · {request.kind === 'CLAIM' ? 'بررسی نمایندگی' : 'معرفی کسب‌وکار'} · <bdi>{request.domain}</bdi></summary><p className="sa-sub">درخواست {request.requester.name || 'کاربر'} · {faDate(request.createdAt)}</p><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{request.note}</p>
    <form onSubmit={submit} className="rp-form" aria-busy={busy}>
      {request.kind === 'SUGGESTION' ? <label className="sa-field">شناسهٔ ثابت لاتین برای انتشار <small>برای رد درخواست لازم نیست.</small><input className="input" name="slug" dir="ltr" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={request.domain.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)} disabled={busy} /></label> : <label className="sa-check"><input type="checkbox" name="acknowledgeRepresentative" disabled={busy} /> ارتباط این حساب با کسب‌وکار را مستقل بررسی کرده‌ام؛ تأیید، اجازهٔ پاسخ رسمی می‌دهد.</label>}
      <label className="sa-field">نتیجه و دلیل بررسی <small>برای درخواست‌کننده قابل مشاهده است؛ اطلاعات محرمانه ننویسید.</small><textarea className="input" name="decisionNote" required minLength={10} maxLength={600} disabled={busy} /></label>
      <div className="sa-row-actions"><button type="submit" name="decision" value="APPROVED" className="btn btn-primary btn-sm" disabled={busy}>{request.kind === 'CLAIM' ? 'تأیید نمایندگی' : 'تأیید و انتشار کسب‌وکار'}</button><button type="submit" name="decision" value="REJECTED" className="btn btn-ghost btn-sm" disabled={busy}>رد درخواست با توضیح</button></div>
    </form>
  </details>
}
