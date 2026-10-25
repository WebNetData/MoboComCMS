'use client'

import { useEffect, useState } from 'react'
import { seedEntries, type VocabularyEntry } from '@/modules/vocabulary/domain/vocabulary'
import { listsOf, type VocabularySection } from '@/modules/vocabulary/domain/registry'

export type ActiveLists = Record<string, VocabularyEntry[]>

const requests = new Map<string, Promise<ActiveLists | null>>()
const load = (section: string) => {
  if (!requests.has(section)) requests.set(section, fetch(`/api/admin/vocabulary?section=${section}`, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((data) => data?.lists ?? null).catch(() => null))
  return requests.get(section)!
}

/**
 * A section's managed lists for an item form: active entries in the owner's order (with `all`, inactive ones too, so a
 * select can show what an item already has), the old fixed values until they arrive.
 */
export function useSectionLists(section: VocabularySection, all = false): ActiveLists {
  const [lists, setLists] = useState<ActiveLists>(() => Object.fromEntries(listsOf(section).map((definition) => [definition.list, seedEntries(definition)])))
  useEffect(() => {
    let alive = true
    void load(section).then((loaded) => {
      if (alive && loaded) setLists(Object.fromEntries(Object.entries(loaded).map(([list, entries]) => [list, entries.filter((entry) => all || entry.active)])))
    })
    return () => { alive = false }
  }, [section, all])
  return lists
}

/** An entry list as code → name (with its emoji), followed by codes an item already has that the list no longer offers. */
export function optionsOf(entries: VocabularyEntry[] = [], kept: string[] = []): Record<string, string> {
  const listed = new Set(entries.map((entry) => entry.code))
  return { ...Object.fromEntries(entries.map((entry) => [entry.code, `${entry.icon ? `${entry.icon} ` : ''}${entry.name}`])), ...Object.fromEntries(kept.filter((code) => code && !listed.has(code)).map((code) => [code, code])) }
}
