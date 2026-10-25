'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { GamesShell } from '../shared'

/** The games section's managed lists: platforms, official stores, play modes and Persian localisations. */
export default function GameVocabularyAdmin() {
  return <GamesShell title="پلتفرم‌ها، فروشگاه‌ها و فهرست‌ها"><VocabularyManager section="games" noun="بازی" /></GamesShell>
}
