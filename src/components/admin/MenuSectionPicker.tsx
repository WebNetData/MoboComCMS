'use client'

import { useEffect, useRef, useState } from 'react'
import type { SiteLink } from '@/modules/site/config/types'
import { defaultSectionConfig, MEGA_SECTIONS, SECTION_LABEL, type MegaSection } from '@/modules/navigation/domain/megamenu'
import { mergeMenuPreset, sectionMenuPreset } from '@/modules/navigation/domain/presets'
import styles from './MenuTreeEditor.module.css'

export default function MenuSectionPicker({ value, onChange, onBusy, disabled = false }: { value: SiteLink[]; onChange: (value: SiteLink[]) => void; onBusy?: (busy: boolean) => void; disabled?: boolean }) {
  const [section, setSection] = useState<MegaSection>('home')
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const latest = useRef({ value, onChange, onBusy }), controller = useRef<AbortController | null>(null)
  useEffect(() => { latest.current = { value, onChange, onBusy } }, [value, onChange, onBusy])
  useEffect(() => () => { controller.current?.abort(); latest.current.onBusy?.(false) }, [])
  async function insert() {
    if (busy || disabled) return
    controller.current?.abort(); const request = new AbortController(); controller.current = request
    setBusy(true); onBusy?.(true); setNotice('')
    try {
      const response = await fetch('/api/admin/mega-menu', { method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preview: section, config: defaultSectionConfig() }) })
      const body = await response.json()
      if (!response.ok) throw Error(body?.error || 'دریافت بخش انجام نشد')
      if (request.signal.aborted) return
      const preset = sectionMenuPreset(section, body.preview)
      latest.current.onChange(mergeMenuPreset(latest.current.value, preset))
      setNotice('بخش با دسته‌ها و لینک‌های آماده به پیش‌نویس اضافه شد؛ تنظیمات دلخواه را انجام دهید و منتشر کنید. لینک‌های قبلی حفظ شدند.')
    } catch (error) { if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : 'ارتباط برقرار نشد') }
    finally { if (!request.signal.aborted) { setBusy(false); onBusy?.(false) } }
  }
  return <div className={styles.preset}>
    <div><h3>افزودن کامل یک بخش</h3><p>دسته‌ها، زیردسته‌ها، آیکن‌ها و لینک‌های بخش را یک‌جا اضافه کنید؛ همهٔ موارد بعداً قابل ویرایش‌اند.</p></div>
    <label className="sh-field"><span>بخش آماده</span><select className="sh-input" value={section} disabled={busy || disabled} onChange={e => setSection(e.target.value as MegaSection)}>{MEGA_SECTIONS.map(key => <option value={key} key={key}>{SECTION_LABEL[key]}</option>)}</select></label>
    <button type="button" className="sh-btn" disabled={busy || disabled} onClick={() => void insert()}>{busy ? 'در حال دریافت بخش…' : '＋ افزودن کامل بخش'}</button>
    {notice && <p role="status">{notice}</p>}
  </div>
}
