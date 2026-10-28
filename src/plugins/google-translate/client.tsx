'use client'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import type { PluginClientModule, PluginProps } from '../types'
import { LanguageFlag, NATIVE_NAMES, PERSIAN_NAMES } from './flags'

// Google Translate website widget, driven by its own `googtrans` cookie:
// choosing a language sets the cookie and reloads, and the widget script is
// only loaded while a translation is active, so Persian visitors never
// download it. The choice lives in the site header (flags, like international
// sites) where the theme offers `site.header-actions`; elsewhere it floats.

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
  // The widget's own (hidden) element: the floating button renders it; a page with only the header choice gets one here.
  if (!document.getElementById('mc-translate-element')) { const element = document.createElement('div'); element.id = 'mc-translate-element'; element.hidden = true; document.body.appendChild(element) }
  w.mcTranslateInit = () => {
    if (w.google?.translate) new w.google.translate.TranslateElement({ pageLanguage: SOURCE, includedLanguages: languages.join(','), autoDisplay: false }, 'mc-translate-element')
  }
  const script = document.createElement('script')
  script.id = 'mc-translate-script'
  script.src = 'https://translate.google.com/translate_a/element.js?cb=mcTranslateInit'
  script.async = true
  document.body.appendChild(script)
}

/** The languages offered, the one in use, the browser's language to suggest, and choosing one. */
function useTranslation(settings: PluginProps['settings']) {
  const languages = String(settings.languages || 'en').split(',').map(code => code.trim()).filter(code => /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(code) && code !== SOURCE)
  const [active, setActive] = useState('')
  const [suggestion, setSuggestion] = useState('')
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
  const choose = useCallback((target: string) => {
    writeTranslation(target)
    window.location.reload()
  }, [])
  const dismiss = () => { document.cookie = `${DISMISS}=1;path=/;max-age=${60 * 60 * 24 * 90};SameSite=Lax`; setSuggestion('') }
  return { languages, active, suggestion, choose, dismiss }
}

/** Closes a popover on a click outside it or Escape. */
function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: (refocus: boolean) => void) {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(true) }
    document.addEventListener('mousedown', onPointer); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open, root, close])
}

function GoogleTranslate({ settings }: PluginProps) {
  const { languages, active, suggestion, choose, dismiss } = useTranslation(settings)
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, panel, close)
  if (!languages.length) return null

  return <div className="mc-translate notranslate" translate="no" ref={panel}>
    <div id="mc-translate-element" hidden/>
    {suggestion && !active && <div className="mc-translate-suggest" role="dialog" aria-label="Translate">
      <span>This site is in Persian. Translate to {NATIVE_NAMES[suggestion] || suggestion}?</span>
      <button type="button" className="mc-translate-yes" onClick={() => choose(suggestion)}>Translate</button>
      <button type="button" onClick={dismiss} aria-label="No thanks">×</button>
    </div>}
    {/* On a phone the label is hidden; the button keeps its name for screen readers. */}
    <button type="button" className="mc-translate-button" aria-label={active ? NATIVE_NAMES[active] || active : 'Language'} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
      <span>{active ? NATIVE_NAMES[active] || active : 'Language'}</span>
    </button>
    {open && <div className="mc-translate-menu" role="listbox" aria-label="Language">
      <button type="button" role="option" aria-selected={!active} onClick={() => choose('')}>فارسی <small>Original</small></button>
      {languages.map(code => <button type="button" role="option" aria-selected={active === code} key={code} onClick={() => choose(code)}>{NATIVE_NAMES[code] || code}</button>)}
    </div>}
  </div>
}

/**
 * The language choice in the site header: the flag and code of the language in use; a panel of flags with each
 * language's own name and its Persian name, Persian (the original) first. Arrow keys, Home and End move between
 * languages, Escape closes and returns to the button. A visitor whose browser speaks an offered language is asked
 * once, in a small bubble under the button.
 */
function HeaderLanguage({ settings }: PluginProps) {
  const { languages, active, suggestion, choose, dismiss } = useTranslation(settings)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus() }, [])
  useDismiss(open, root, close)
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }, [open])
  if (!languages.length) return null
  const current = active || SOURCE
  const all = [SOURCE, ...languages]
  const move = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [])]
    const at = options.indexOf(document.activeElement as HTMLButtonElement)
    const columns = window.matchMedia('(max-width: 520px)').matches ? 1 : 2
    const step: Record<string, number> = { ArrowDown: columns, ArrowUp: -columns, ArrowLeft: document.documentElement.dir === 'rtl' ? 1 : -1, ArrowRight: document.documentElement.dir === 'rtl' ? -1 : 1 }
    let next = -1
    if (event.key in step) next = Math.min(options.length - 1, Math.max(0, (at < 0 ? 0 : at) + step[event.key]))
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = options.length - 1
    if (next >= 0) { event.preventDefault(); options[next]?.focus() }
  }

  return <div className="mc-lang notranslate" translate="no" ref={root}>
    <button ref={button} type="button" className="mc-lang-button" aria-expanded={open} aria-haspopup="listbox" aria-controls="mc-lang-panel" onClick={() => setOpen(value => !value)}
      aria-label={`${current.split('-')[0].toUpperCase()} — زبان سایت: ${NATIVE_NAMES[current] || current} (Language)`}>
      <LanguageFlag code={current} className="mc-lang-flag"/>
      <span className="mc-lang-code">{current.split('-')[0].toUpperCase()}</span>
      <svg className="mc-lang-caret" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open && <div className="mc-lang-panel" id="mc-lang-panel">
      <div className="mc-lang-head"><b>زبان سایت</b><span>Language</span></div>
      <div ref={list} className="mc-lang-list" role="listbox" aria-label="زبان سایت — Language" onKeyDown={move}>
        {all.map(code => <button key={code} type="button" role="option" aria-selected={current === code} className="mc-lang-option" lang={code} onClick={() => (code === current ? close(true) : choose(code === SOURCE ? '' : code))}>
          <LanguageFlag code={code} className="mc-lang-option-flag"/>
          <span className="mc-lang-names"><b>{NATIVE_NAMES[code] || code}</b><small lang="fa">{PERSIAN_NAMES[code] || code}</small></span>
          {current === code && <svg className="mc-lang-check" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>}
        </button>)}
      </div>
      <p className="mc-lang-note">ترجمهٔ خودکار با Google؛ متن اصلی سایت فارسی است.</p>
    </div>}
    {suggestion && !active && !open && <div className="mc-lang-suggest" role="dialog" aria-label="Translate">
      <LanguageFlag code={suggestion} className="mc-lang-option-flag"/>
      <span lang="en" dir="ltr">This site is in Persian. Read it in {NATIVE_NAMES[suggestion] || suggestion}?</span>
      <button type="button" className="mc-lang-yes" onClick={() => choose(suggestion)}>Translate</button>
      <button type="button" className="mc-lang-no" onClick={dismiss} aria-label="No thanks">×</button>
    </div>}
  </div>
}

export const plugin: PluginClientModule = { ui: [
  { slot: 'site.header-actions', Component: HeaderLanguage, order: 5 },
  // Themes without a header slot (and the account panel) keep the floating button; it hides where the header has one.
  { slot: 'site.after-footer', Component: GoogleTranslate, order: 5 },
  { slot: 'dashboard.bottom', Component: GoogleTranslate, order: 5 },
] }
