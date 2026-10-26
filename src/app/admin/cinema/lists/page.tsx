'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { CinemaShell } from '../shared'

/** The film section's managed lists: genres, countries and languages (each with the English name imports use). */
export default function CinemaListsAdmin() {
  return <CinemaShell title="ژانرها، کشورها و زبان‌ها"><VocabularyManager section="cinema" noun="فیلم" /></CinemaShell>
}
