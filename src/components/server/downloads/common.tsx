'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Notice, bytes, fa, faDate, useServerApi, useServerJson } from '@/app/admin/server/shared'
import { EMPTY_STORAGE, KIND_LABEL, STATUS, PHASE, TEXT_EXT, type Entry, type Overview, type ArchiveListing, type Job, type Listing, type Tone } from './types'
export function seconds(total: number) {
  if (total < 60) return `${fa(total)} ثانیه`
  if (total < 3600) return `${fa(Math.ceil(total / 60))} دقیقه`
  return `${fa(Math.floor(total / 3600))} ساعت و ${fa(Math.ceil((total % 3600) / 60))} دقیقه`
}

export function Crumbs({ dir, onOpen }: { dir: string; onOpen: (dir: string) => void }) {
  const parts = dir.split('/').filter(Boolean)
  return <nav className="dl-crumbs" aria-label="مسیر">
    <button type="button" onClick={() => onOpen('/')}>ریشه</button>
    {parts.map((part, index) => <span key={index}><i aria-hidden="true">/</i><button type="button" onClick={() => onOpen(`/${parts.slice(0, index + 1).join('/')}`)} dir="auto">{part}</button></span>)}
  </nav>
}
