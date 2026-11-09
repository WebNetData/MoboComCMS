'use client'
import { SUPPORT_SOURCE_TYPES, type KnowledgeSettings } from '@/modules/livechat/domain/knowledge-config'

export default function KnowledgeControls({ value, onChange }: { value: KnowledgeSettings; onChange: (value: KnowledgeSettings) => void }) {
  return <fieldset className="sa-card" aria-describedby="support-sources-help">
    <legend>پاسخ مستند به اطلاعات سایت</legend>
    <p id="support-sources-help" className="sa-sub">دستیار منابع عمومی و منتشرشدهٔ بخش‌های انتخابی را جستجو می‌کند و ارجاع پاسخ را نمایش می‌دهد. اطلاعات سفارش و کیف پول فقط متعلق به همان کاربر است. در نبود اطلاعات کافی، سؤال روشن‌کننده یا بررسی همکار پیشنهاد می‌شود.</p>
    <label className="sa-check"><input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} /> استفاده از منابع زنده و ارجاع در پاسخ</label>
    <div className="sa-cols">{SUPPORT_SOURCE_TYPES.map(source => <label className="sa-check" key={source.id}><input type="checkbox" disabled={!value.enabled} checked={value.types.includes(source.id)} onChange={e => onChange({ ...value, types: e.target.checked ? [...value.types, source.id] : value.types.filter(id => id !== source.id) })} />{source.label}</label>)}</div>
    <label className="sa-field"><span>حداکثر نتیجهٔ جستجو در هر پاسخ</span><select className="input" disabled={!value.enabled} value={value.maxSources} onChange={e => onChange({ ...value, maxSources: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n.toLocaleString('fa-IR')}</option>)}</select></label>
    <p className="sa-sub">بدون بخش انتخاب‌شده، فقط راهنمای پشتیبانیِ واردشده در این فرم و اطلاعات خود کاربر استفاده می‌شود. خاموش‌کردن این گزینه، شیوهٔ پاسخ‌گویی قبلی را نگه می‌دارد.</p>
  </fieldset>
}
