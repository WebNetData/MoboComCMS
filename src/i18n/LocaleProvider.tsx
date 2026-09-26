'use client'

import { createContext, useContext } from 'react'
import { type Locale, type Dict } from './dictionaries'
import { dict, dirOf } from './config'

interface LocaleCtx {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: Dict
}

const Ctx = createContext<LocaleCtx>({ locale: 'en', dir: 'ltr', t: dict('en') })

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, dir: dirOf(locale), t: dict(locale) }}>{children}</Ctx.Provider>
}

export function useI18n() {
  return useContext(Ctx)
}
