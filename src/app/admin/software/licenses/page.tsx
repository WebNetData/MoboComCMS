'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { SoftwareShell } from '../shared'

/** The software section's managed lists: licence types, platforms (each a desktop, mobile or web one) and app stores. */
export default function SoftwareLicensesAdmin() {
  return <SoftwareShell title="فهرست‌های نرم‌افزار"><VocabularyManager section="software" noun="نرم‌افزار" /></SoftwareShell>
}
