'use client'

import { usePathname } from '@/platform/routing/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useModuleEnabled } from '@/extensions/client/ExtensionProvider'
import { usePromptPlacement } from './usePromptPlacement'
import { normalizeTrackedPath } from '@/modules/analytics/domain/analytics'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const PROMPT_KEY = 'mobocom.push.prompt'
const VISITS_KEY = 'mobocom.visits'
const INSTALL_KEY = 'mobocom.install.dismissed'
const PRIVATE = /^\/(admin|studio|builder-preview|miniapp)(\/|$)/

const read = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* storage unavailable */ } }

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** Subscribes this browser to web push (asks for permission first). */
export async function enablePush(): Promise<'granted' | 'denied' | 'unsupported' | 'error'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  try {
    const registration = await navigator.serviceWorker.ready
    const { key } = await fetch('/api/push/key').then((response) => response.json())
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
    return response.ok ? 'granted' : 'error'
  } catch { return 'error' }
}

/**
 * Site-wide client extras: registers the service worker, sends a cookie-free
 * page-view beacon, offers "install the app" and — after a few visits —
 * browser notifications. Nothing runs on admin pages.
 */
export default function PwaClient() {
  const pathname = usePathname()
  const pushOn = useModuleEnabled('web-push')
  const analyticsOn = useModuleEnabled('analytics')
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [showPush, setShowPush] = useState(false)
  const [pushState, setPushState] = useState('')
  const isPrivate = PRIVATE.test(pathname)
  const promptRef = useRef<HTMLDivElement>(null)
  usePromptPlacement(promptRef, isPrivate ? null : showPush ? 'push' : installEvent ? 'install' : null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production' && !read('mobocom.sw.dev')) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  }, [])

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); if (read(INSTALL_KEY) !== '1') setInstallEvent(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Page-view beacon (on every client-side navigation).
  useEffect(() => {
    if (!analyticsOn || isPrivate || !normalizeTrackedPath(pathname)) return
    const params = new URLSearchParams(window.location.search)
    const payload = JSON.stringify({ p: pathname, r: document.referrer, u: params.get('utm_source') || '' })
    const sent = navigator.sendBeacon?.('/api/analytics/collect', new Blob([payload], { type: 'text/plain' }))
    if (!sent) fetch('/api/analytics/collect', { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => undefined)
  }, [analyticsOn, isPrivate, pathname])

  // Ask for notifications only after a few page views and never more than every 14 days.
  useEffect(() => {
    if (!pushOn || isPrivate || !('Notification' in window) || !('serviceWorker' in navigator) || Notification.permission !== 'default') return
    const visits = Number(read(VISITS_KEY) || 0) + 1
    write(VISITS_KEY, String(visits))
    const dismissed = Number(read(PROMPT_KEY) || 0)
    if (visits >= 3 && Date.now() - dismissed > 14 * 86_400_000) setShowPush(true)
  }, [pushOn, isPrivate, pathname])

  const install = useCallback(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice.catch(() => undefined)
    setInstallEvent(null)
  }, [installEvent])

  if (isPrivate) return null
  return (
    <>
      {installEvent && !showPush && (
        <div ref={promptRef} className="pwa-chip" role="dialog" aria-label="نصب اپلیکیشن">
          <span aria-hidden="true">📲</span>
          <span>موبوکام را مثل اپ روی گوشی نصب کنید</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>نصب</button>
          <button type="button" className="pwa-x" aria-label="بستن" onClick={() => { write(INSTALL_KEY, '1'); setInstallEvent(null) }}>✕</button>
        </div>
      )}
      {showPush && (
        <div ref={promptRef} className="pwa-chip is-push" role="dialog" aria-label="اعلان‌ها">
          <span aria-hidden="true">🔔</span>
          <span>{pushState || 'از نسخه‌های جدید، تخفیف‌ها و وضعیت سفارش‌ها باخبر شوید؟'}</span>
          {!pushState && <button type="button" className="btn btn-primary btn-sm" onClick={async () => {
            const result = await enablePush()
            write(PROMPT_KEY, String(Date.now()))
            setPushState(result === 'granted' ? 'اعلان‌ها فعال شد ✓' : result === 'denied' ? 'اجازهٔ اعلان داده نشد؛ از تنظیمات مرورگر قابل تغییر است.' : 'این مرورگر از اعلان پشتیبانی نمی‌کند.')
            setTimeout(() => setShowPush(false), 3500)
          }}>فعال‌سازی</button>}
          <button type="button" className="pwa-x" aria-label="بعداً" onClick={() => { write(PROMPT_KEY, String(Date.now())); setShowPush(false) }}>✕</button>
        </div>
      )}
    </>
  )
}
