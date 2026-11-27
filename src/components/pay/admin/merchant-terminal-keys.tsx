'use client'

import { useEffect, useState } from 'react'
import { api, date, json } from '../client'
import { ErrorNotice, Field } from '../shared'
import s from '../Pay.module.css'
import o from './Merchants.module.css'

type TerminalKey = { id: string; label: string; prefix: string; version: number; createdAt: string; rotatedAt: string | null; revokedAt: string | null }
type KeyView = { terminals: { id: string; name: string; active: boolean; keys: TerminalKey[] }[] }
type KeyResult = { key: TerminalKey; token?: string }
type IssueDraft = { label: string; note: string; confirmed: boolean }
type ActionDraft = { note: string; confirmed: boolean }
type OneTimeSecret = { label: string; token: string }
const emptyIssue = (): IssueDraft => ({ label: '', note: '', confirmed: false })
const emptyAction = (): ActionDraft => ({ note: '', confirmed: false })

export default function MerchantTerminalKeys({ merchantId, disabled = false }: { merchantId: string; disabled?: boolean }) {
  const [view, setView] = useState<KeyView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [issueDrafts, setIssueDrafts] = useState<Record<string, IssueDraft>>({})
  const [actionDrafts, setActionDrafts] = useState<Record<string, ActionDraft>>({})
  const [secret, setSecret] = useState<OneTimeSecret | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const refresh = () => { setLoading(true); setError(''); setReload(value => value + 1) }

  useEffect(() => {
    const controller = new AbortController()
    api<KeyView>(`/api/admin/mobocom-pay/terminal-keys?id=${encodeURIComponent(merchantId)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setView(result) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'فهرست کلیدهای پایانه دریافت نشد') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [merchantId, reload])

  const issueDraft = (terminalId: string) => issueDrafts[terminalId] ?? emptyIssue()
  const actionDraft = (keyId: string) => actionDrafts[keyId] ?? emptyAction()
  const updateIssue = (terminalId: string, patch: Partial<IssueDraft>) => setIssueDrafts(current => ({ ...current, [terminalId]: { ...(current[terminalId] ?? emptyIssue()), ...patch } }))
  const updateAction = (keyId: string, patch: Partial<ActionDraft>) => setActionDrafts(current => ({ ...current, [keyId]: { ...(current[keyId] ?? emptyAction()), ...patch } }))

  const issue = async (terminalId: string) => {
    const draft = issueDraft(terminalId)
    if (busy || disabled || secret || draft.label.trim().length < 1 || draft.note.trim().length < 3 || !draft.confirmed) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const result = await api<KeyResult>('/api/admin/mobocom-pay/terminal-keys', json('POST', { merchantId, terminalId, label: draft.label.trim(), note: draft.note.trim(), confirmed: true }))
      if (result.token) setSecret({ label: result.key.label, token: result.token })
      setIssueDrafts(current => { const next = { ...current }; delete next[terminalId]; return next })
      setFeedback(result.token ? 'کلید صادر شد؛ توکن کامل فقط در همین نوبت نمایش داده می‌شود.' : 'کلید صادر شد؛ پاسخ سرور توکن یک‌باره‌ای نداشت.')
      refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'صدور کلید انجام نشد') }
    finally { setBusy(false) }
  }

  const manage = async (terminalId: string, key: TerminalKey, action: 'rotate' | 'revoke') => {
    const draft = actionDraft(key.id)
    if (busy || disabled || secret || draft.note.trim().length < 3 || !draft.confirmed) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const result = await api<KeyResult>(`/api/admin/mobocom-pay/terminal-keys`, json('PATCH', { merchantId, terminalId, id: key.id, version: key.version, action, note: draft.note.trim(), confirmed: true }))
      if (action === 'rotate' && result.token) setSecret({ label: result.key.label, token: result.token })
      setActionDrafts(current => { const next = { ...current }; delete next[key.id]; return next })
      setFeedback(action === 'rotate' ? (result.token ? 'کلید چرخانده شد؛ توکن تازه فقط در همین نوبت نمایش داده می‌شود.' : 'کلید چرخانده شد؛ پاسخ سرور توکن یک‌باره‌ای نداشت.') : 'کلید لغو شد و دیگر نباید برای درخواست‌های تازه استفاده شود.')
      refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'تغییر کلید انجام نشد') }
    finally { setBusy(false) }
  }

  const copy = async () => {
    if (!secret) return
    try { await navigator.clipboard.writeText(secret.token); setCopyFeedback('توکن کپی شد؛ آن را در جای امن ذخیره کنید.') }
    catch { setCopyFeedback('کپی خودکار در دسترس نیست؛ توکن را از فیلد انتخاب و کپی کنید.') }
  }
  const secretVisible = Boolean(secret)

  return <section className={`${s.stack} ${o.terminalKeys}`} aria-labelledby="terminal-keys-title" aria-busy={loading || busy}>
    <div className={s.row}><h3 id="terminal-keys-title">کلیدهای دسترسی پایانه</h3><button type="button" className={s.secondary} disabled={loading || busy} onClick={refresh}>بازخوانی کلیدها</button></div>
    <p className={s.muted}>توکن کامل فقط یک‌بار پس از صدور یا چرخش نمایش داده می‌شود. آن را در سامانهٔ متصل ذخیره کنید؛ این صفحه آن را نگه نمی‌دارد.</p>
    {secretVisible && <p className={o.secretReminder} role="status">پس از ذخیره و بستن توکن، صدور، چرخش یا لغو کلید دوباره فعال می‌شود.</p>}
    <ErrorNotice error={error} />{feedback && <p className={s.notice} role="status">{feedback}</p>}{loading && <p role="status">در حال دریافت کلیدهای پایانه…</p>}
    {secret && <section className={o.oneTimeSecret} aria-label="توکن یک‌بارهٔ کلید">
      <div className={o.secretHeader}><strong>توکن کامل · {secret.label}</strong><button type="button" className={s.secondary} onClick={() => { setSecret(null); setCopyFeedback('') }}>بستن توکن</button></div>
      <label className={o.secretTokenLabel} htmlFor="terminal-key-one-time-token">این توکن را اکنون ذخیره کنید</label>
      <textarea id="terminal-key-one-time-token" className={o.secretToken} dir="ltr" rows={3} readOnly value={secret.token} onFocus={event => event.currentTarget.select()} />
      <div className={s.actions}><button type="button" className={s.button} onClick={() => void copy()}>کپی توکن</button><button type="button" className={s.secondary} onClick={() => { setSecret(null); setCopyFeedback('') }}>توکن را ذخیره کردم</button></div>
      {copyFeedback && <p role="status" className={s.muted}>{copyFeedback}</p>}
    </section>}
    {!loading && view && <div className={o.terminalKeyList}>
      {view.terminals.map(terminal => {
        const draft = issueDraft(terminal.id)
        return <article className={o.terminalKeyTerminal} key={terminal.id}>
          <header className={o.terminalKeyHeader}><div><h4>{terminal.name}</h4><p className={s.muted}>{terminal.active ? 'پایانه فعال' : 'پایانه متوقف'}</p></div><span>{terminal.keys.length.toLocaleString('fa-IR')} کلید</span></header>
          {!terminal.keys.length && <p className={s.muted}>برای این پایانه کلیدی ثبت نشده است.</p>}
          {terminal.keys.map(key => {
            const revoked = Boolean(key.revokedAt)
            const keyDraft = actionDraft(key.id)
            const canAct = !revoked && !disabled && !busy && !secretVisible
            return <section className={o.terminalKeyCard} key={key.id}>
              <div className={o.terminalKeyMetadata}><div><strong>{key.label}</strong><span className={revoked ? o.keyRevoked : o.keyActive}>{revoked ? 'لغوشده' : 'فعال'}</span></div><p>پیشوند: <bdi dir="ltr">{key.prefix}</bdi> · نسخهٔ {key.version.toLocaleString('fa-IR')}</p><p>صدور: {date(key.createdAt)}{key.rotatedAt ? ` · آخرین چرخش: ${date(key.rotatedAt)}` : ''}{key.revokedAt ? ` · لغو: ${date(key.revokedAt)}` : ''}</p></div>
              {!revoked && <div className={o.keyActions}>
                <Field label="دلیل چرخش یا لغو"><textarea rows={2} minLength={3} maxLength={300} required value={keyDraft.note} disabled={!canAct} onChange={event => updateAction(key.id, { note: event.target.value })} /></Field>
                <label className={s.check}><input type="checkbox" checked={keyDraft.confirmed} disabled={!canAct} onChange={event => updateAction(key.id, { confirmed: event.target.checked })} />اثر این عملیات بر سامانهٔ متصل را بررسی و تأیید می‌کنم.</label>
                <div className={s.actions}><button type="button" className={s.secondary} disabled={!terminal.active || !canAct || keyDraft.note.trim().length < 3 || !keyDraft.confirmed} onClick={() => void manage(terminal.id, key, 'rotate')}>چرخش کلید</button><button type="button" className={s.secondary} disabled={!canAct || keyDraft.note.trim().length < 3 || !keyDraft.confirmed} onClick={() => void manage(terminal.id, key, 'revoke')}>لغو کلید</button></div>
              </div>}
            </section>
          })}
          <div className={o.issueKey}>
            <h5>صدور کلید تازه</h5>
            <Field label="نام سامانه یا کاربرد"><input value={draft.label} maxLength={80} disabled={disabled || busy} onChange={event => setIssueDrafts(current => ({ ...current, [terminal.id]: { ...(current[terminal.id] ?? emptyIssue()), label: event.target.value } }))} /></Field>
            <Field label="دلیل صدور"><textarea rows={2} minLength={3} maxLength={300} required value={draft.note} disabled={disabled || busy} onChange={event => updateIssue(terminal.id, { note: event.target.value })} /></Field>
            <label className={s.check}><input type="checkbox" checked={draft.confirmed} disabled={disabled || busy} onChange={event => updateIssue(terminal.id, { confirmed: event.target.checked })} />ایجاد دسترسی تازه برای این پایانه را تأیید می‌کنم.</label>
            <button type="button" className={s.button} disabled={!terminal.active || disabled || busy || secretVisible || !draft.label.trim() || draft.note.trim().length < 3 || !draft.confirmed} onClick={() => void issue(terminal.id)}>صدور کلید</button>
          </div>
        </article>
      })}
      {!view.terminals.length && <p className={s.muted}>برای این پذیرنده پایانه‌ای ثبت نشده است.</p>}
    </div>}
  </section>
}
