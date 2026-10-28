'use client'

import VocabularyManager from '../../cms/VocabularyManager'
import { SectionShell } from '../../cms/SectionAdmin'
import { CELEBRITY_TABS } from '../tabs'

/** The artists' profile fields (country, born, died and the owner's own): add, rename, order, switch off or delete. */
export default function CelebrityFieldsAdmin() {
  return <SectionShell tabs={CELEBRITY_TABS} label="مدیریت هنرمندان و چهره‌ها" title="فیلدهای پروفایل هنرمند">
    <VocabularyManager section="celebrities" noun="هنرمند" />
  </SectionShell>
}
