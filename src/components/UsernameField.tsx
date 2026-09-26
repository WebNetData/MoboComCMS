'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/LocaleProvider'

/**
 * Lets the customer choose the config username the VPN panel will create.
 * Availability is checked against the panel while typing; an unavailable or
 * malformed name simply means the order is placed with an auto-generated one.
 */
export default function UsernameField({
  value,
  onChange,
  planId,
  onValidity,
}: {
  value: string
  onChange: (value: string) => void
  planId?: number
  onValidity?: (ok: boolean) => void
}) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [suggestion, setSuggestion] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const raw = value.trim()
    if (!raw) {
      setState('idle')
      onValidity?.(false)
      return
    }
    setState('checking')
    timer.current = setTimeout(async () => {
      const res = await fetch(
        `/api/subscriptions/username-available?username=${encodeURIComponent(raw)}${planId ? `&planId=${planId}` : ''}`
      )
      if (!res.ok) {
        setState('idle')
        onValidity?.(false)
        return
      }
      const data = await res.json().catch(() => null)
      setSuggestion(data?.suggestion || '')
      const ok = Boolean(data?.available)
      setState(ok ? 'free' : data?.reason === 'invalid_chars' || data?.reason === 'too_short' ? 'invalid' : 'taken')
      onValidity?.(ok)
    }, 450)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, planId, onValidity])

  const hint =
    state === 'checking'
      ? t.usernameChecking
      : state === 'free'
        ? `✓ ${t.usernameFree}`
        : state === 'taken'
          ? t.usernameTaken
          : state === 'invalid'
            ? t.usernameRules
            : t.usernameHint

  const cls = state === 'free' ? 'success-text' : state === 'taken' || state === 'invalid' ? 'error-text' : 'muted'

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div>
          <h2 className="h3">{t.usernameTitle}</h2>
          <p className="muted text-sm">{t.usernameSub}</p>
        </div>
        <span className="badge badge-gray num" dir="ltr">
          {t.usernameOptional}
        </span>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input
          className="input num imp-w-72"
          dir="ltr"
          placeholder="my_config"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          maxLength={30}
        />
        {suggestion && state !== 'free' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(suggestion)}>
            {t.usernameUse} {suggestion}
          </button>
        )}
      </div>

      <p className={`${cls} text-xs mt-2`}>{hint}</p>
    </div>
  )
}
