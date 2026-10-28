'use client'

import { useEffect } from 'react'
import { dirOf } from './config'
import type { Locale } from './dictionaries'

export default function LocaleSetter({ locale, theme }: { locale: Locale; theme: string }) {
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('lang', locale)
    html.setAttribute('data-theme', theme)
    // While the page is translated (layout: data-translated), the translation's direction stays.
    const translated = html.getAttribute('data-translated')
    const dir = translated === 'ltr' || translated === 'rtl' ? translated : dirOf(locale)
    html.setAttribute('dir', dir)
    document.cookie = `theme=${theme};path=/;max-age=31536000`
  }, [locale, theme])
  return null
}
