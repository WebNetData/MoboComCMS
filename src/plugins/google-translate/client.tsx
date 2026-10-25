'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PluginClientModule, PluginProps } from '../types'

// Google Translate website widget, driven by its own `googtrans` cookie:
// choosing a language sets the cookie and reloads, and the widget script is
// only loaded while a translation is active, so Persian visitors never
// download it.

const NAMES: Record<string, string> = {
  en: 'English', ar: 'العربية', tr: 'Türkçe', de: 'Deutsch', fr: 'Français', ru: 'Русский', es: 'Español', it: 'Italiano',
  'zh-CN': '中文', hi: 'हिन्दी', ur: 'اردو', az: 'Azərbaycan', ja: '日本語', ko: '한국어', pt: 'Português', nl: 'Nederlands', ku: 'Kurdî', ps: 'پښتو', tg: 'Тоҷикӣ',
}
const SOURCE = 'fa'
const DISMISS = 'mc-translate-dismissed'

type GoogleWindow = Window & { google?: { translate?: { TranslateElement: new (options: object, element: string) => unknown } }; mcTranslateInit?: () => void; __mcTranslatePatched?: boolean }

function readCookie(name: string) {
  return document.cookie.split('; ').find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || ''
}
function writeTranslation(target: string) {
  const value = target ? `/${SOURCE}/${target}` : ''
  const expires = target ? '' : ';expires=Thu, 01 Jan 1970 00:00:00 GMT'
  const host = window.location.hostname
  // Google reads the cookie on the host and on the parent domain; clear/set both.
  for (const domain of ['', `;domain=${host}`, host.includes('.') ? `;domain=.${host.split('.').slice(-2).join('.')}` : '']) document.cookie = `googtrans=${value};path=/${domain}${expires}`
}
export function activeTranslation() {
  const match = /^\/[^/]+\/(.+)$/.exec(decodeURIComponent(readCookie('googtrans')))
  return match?.[1] || ''
}

/** Translated text nodes confuse React's reconciler; ignore the resulting stale-node errors. */
function patchDomForTranslation() {
  const w = window as GoogleWindow
  if (w.__mcTranslatePatched) return
  w.__mcTranslatePatched = true
  const remove = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child
    return remove.call(this, child) as T
  }
  const insert = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return node
    return insert.call(this, node, reference) as T
  }
}

function loadWidget(languages: string[]) {
  const w = window as GoogleWindow
  if (document.getElementById('mc-translate-script')) return
  patchDomForTranslation()
  w.mcTranslateInit = () => {
    if (w.google?.translate) new w.google.translate.TranslateElement({ pageLanguage: SOURCE, includedLanguages: languages.join(','), autoDisplay: false }, 'mc-translate-element')
  }
  const script = document.createElement('script')
  script.id = 'mc-translate-script'
  script.src = 'https://translate.google.com/translate_a/element.js?cb=mcTranslateInit'
  script.async = true
  document.body.appendChild(script)
}

function GoogleTranslate({ settings }: PluginProps) {
  const languages = String(settings.languages || 'en').split(',').map(code => code.trim()).filter(code => /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(code) && code !== SOURCE)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const key = languages.join(',')

  useEffect(() => {
    const current = activeTranslation()
    setActive(current)
    if (current) { loadWidget(key.split(',')); return }
    if (settings.suggest === false || readCookie(DISMISS)) return
    const browser = (navigator.languages?.[0] || navigator.language || '').trim()
    if (!browser || browser.toLowerCase().startsWith('fa')) return
    const match = key.split(',').find(code => code.toLowerCase() === browser.toLowerCase()) || key.split(',').find(code => code.split('-')[0] === browser.split('-')[0].toLowerCase())
    if (match) setSuggestion(match)
  }, [key, settings.suggest])
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !panel.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  const choose = useCallback((target: string) => {
    writeTranslation(target)
    window.location.reload()
  }, [])
  const dismiss = () => { document.cookie = `${DISMISS}=1;path=/;max-age=${60 * 60 * 24 * 90};SameSite=Lax`; setSuggestion('') }
  if (!languages.length) return null

  return <div className="mc-translate notranslate" translate="no" ref={panel}>
    <div id="mc-translate-element" hidden/>
    {suggestion && !active && <div className="mc-translate-suggest" role="dialog" aria-label="Translate">
      <span>This site is in Persian. Translate to {NAMES[suggestion] || suggestion}?</span>
      <button type="button" className="mc-translate-yes" onClick={() => choose(suggestion)}>Translate</button>
      <button type="button" onClick={dismiss} aria-label="No thanks">×</button>
    </div>}
    {/* On a phone the label is hidden; the button keeps its name for screen readers. */}
    <button type="button" className="mc-translate-button" aria-label={active ? NAMES[active] || active : 'Language'} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
      <span>{active ? NAMES[active] || active : 'Language'}</span>
    </button>
    {open && <div className="mc-translate-menu" role="listbox" aria-label="Language">
      <button type="button" role="option" aria-selected={!active} onClick={() => choose('')}>فارسی <small>Original</small></button>
      {languages.map(code => <button type="button" role="option" aria-selected={active === code} key={code} onClick={() => choose(code)}>{NAMES[code] || code}</button>)}
    </div>}
  </div>
}

export const plugin: PluginClientModule = { ui: [{ slot: 'site.after-footer', Component: GoogleTranslate, order: 5 }, { slot: 'dashboard.bottom', Component: GoogleTranslate, order: 5 }] }
