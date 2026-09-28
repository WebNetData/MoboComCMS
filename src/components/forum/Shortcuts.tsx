'use client'

import { useRouter } from '@/platform/routing/navigation'
import { useEffect, useRef, useState } from 'react'

// Discourse-style keyboard shortcuts. Ignored while typing in a field.

type Handlers = Partial<Record<'next' | 'prev' | 'reply' | 'replyToPost' | 'like' | 'bookmark' | 'quote' | 'top' | 'bottom' | 'help' | 'escape', () => void>>

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export function useForumShortcuts(handlers: Handlers, enabled = true) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return
      const map: Record<string, keyof Handlers> = { j: 'next', k: 'prev', r: 'replyToPost', R: 'reply', l: 'like', b: 'bookmark', q: 'quote', '?': 'help', Escape: 'escape' }
      if (event.shiftKey && event.key === 'R') { event.preventDefault(); ref.current.reply?.(); return }
      const name = map[event.key]
      if (!name) return
      const handler = ref.current[name]
      if (handler) { event.preventDefault(); handler() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** Site-wide forum navigation: g h / g l / g n / g u / g b / g m, "/" search, "?" help. */
export function GlobalShortcuts() {
  const router = useRouter()
  const [help, setHelp] = useState(false)
  useEffect(() => {
    let pendingG = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return
      if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('.fx-search input, input[name="q"]')
        if (search) { event.preventDefault(); search.focus() }
        return
      }
      if (event.key === '?' && !document.querySelector('.fx-topic')) { event.preventDefault(); setHelp((open) => !open); return }
      if (event.key === 'Escape') { setHelp(false); return }
      if (event.key === 'g') { pendingG = Date.now(); return }
      if (pendingG && Date.now() - pendingG < 1200) {
        const target: Record<string, string> = { h: '/forum', l: '/forum', n: '/forum/new-topics', u: '/forum/unread', t: '/forum/top', b: '/forum/bookmarks', m: '/forum/messages', c: '/forum/categories' }
        pendingG = 0
        if (target[event.key]) { event.preventDefault(); router.push(target[event.key]) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])
  return help ? <ShortcutHelp onClose={() => setHelp(false)} /> : null
}

const GROUPS: [string, [string, string][]][] = [
  ['رفتن به', [['g h', 'خانهٔ تالار'], ['g l', 'تازه‌ترین‌ها'], ['g n', 'جدیدها'], ['g u', 'خوانده‌نشده‌ها'], ['g t', 'برترین‌ها'], ['g b', 'نشان‌شده‌ها'], ['g m', 'پیام‌های خصوصی'], ['g c', 'دسته‌بندی‌ها']]],
  ['در موضوع', [['j / k', 'پیام بعدی / قبلی'], ['r', 'پاسخ به پیام انتخاب‌شده'], ['Shift + r', 'پاسخ به موضوع'], ['q', 'نقل‌قول پیام'], ['l', 'پسندیدن پیام'], ['b', 'نشان‌کردن پیام']]],
  ['عمومی', [['/', 'جست‌وجو'], ['?', 'این راهنما'], ['Esc', 'بستن'], ['Ctrl + Enter', 'ارسال در ویرایشگر']]],
]

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return <div className="fx-modal" role="dialog" aria-modal="true" aria-label="میان‌برهای صفحه‌کلید" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="fx-modal-card is-wide fx-shortcuts">
      <h2>⌨ میان‌برهای صفحه‌کلید</h2>
      <div className="fx-shortcuts-grid">{GROUPS.map(([title, items]) => <section key={title}><h3>{title}</h3><dl>{items.map(([key, label]) => <div key={key}><dt>{key.split(' ').map((part, i) => part === '/' && key.length > 1 ? <span key={i}> / </span> : part === '+' ? <span key={i}> + </span> : <kbd key={i}>{part}</kbd>)}</dt><dd>{label}</dd></div>)}</dl></section>)}</div>
      <div className="fx-modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>بستن</button></div>
    </div>
  </div>
}
