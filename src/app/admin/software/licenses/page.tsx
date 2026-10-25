'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { SoftwareShell } from '../shared'

/** The software section's managed lists: licence types (free, paid, open source and the owner's own). */
export default function SoftwareLicensesAdmin() {
  return <SoftwareShell title="انواع مجوز"><VocabularyManager section="software" noun="نرم‌افزار" /></SoftwareShell>
}
