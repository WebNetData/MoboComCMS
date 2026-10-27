'use client'

import { useEffect, useState } from 'react'

/** A filter tick or choice applies at once (the form's button stays for typed prices and without script). */
export function FilterAutoApply({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const apply = (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.type === 'checkbox' || input.type === 'radio') form.requestSubmit()
    }
    form.addEventListener('change', apply)
    return () => form.removeEventListener('change', apply)
  }, [formId])
  return null
}

/** Narrows a long list of choices (brands, specification values) by what is typed. */
export function FacetFind({ target, label }: { target: string; label: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const list = document.getElementById(target)
    if (!list) return
    const needle = text.trim().toLowerCase()
    for (const item of Array.from(list.querySelectorAll<HTMLElement>('label'))) item.hidden = !!needle && !(item.textContent || '').toLowerCase().includes(needle)
  }, [target, text])
  return <input type="search" className="sx-facet-find" aria-label={label} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} />
}
