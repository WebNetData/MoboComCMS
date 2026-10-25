'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { CinemaShell } from '../shared'

/** The lists every section's links share: audio sides (dub, original, dubbing studios…) and suggested qualities. */
export default function LinkListsAdmin() {
  return <CinemaShell title="صدا و کیفیت لینک‌ها"><VocabularyManager section="media" noun="لینک" /></CinemaShell>
}
