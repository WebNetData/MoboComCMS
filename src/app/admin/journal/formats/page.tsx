'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { JournalShell } from '../shared'

/** The magazine's post formats: article, news, review, video, interview and the owner's own, each of a family. */
export default function JournalFormatsAdmin() {
  return <JournalShell title="قالب‌های نوشته"><VocabularyManager section="journal" noun="نوشته" /></JournalShell>
}
