'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { MusicShell } from '../shared'

/** The music section's managed lists: genres, release types (album, EP, single…) and the roles of song credits. */
export default function MusicListsAdmin() {
  return <MusicShell title="فهرست‌های موزیک"><VocabularyManager section="music" noun="آهنگ" /></MusicShell>
}
