import { createSection, createWidget, emptyDoc, type BuilderDoc } from './builder'
import type { BundledTemplate } from './builder-templates'
import { DASHBOARD_PARTS } from '@/modules/site/domain/builder-surfaces'

function entry(): BuilderDoc {
  const doc = emptyDoc(), hero = createSection(1), body = createSection(1)
  hero.style.paddingY = 48
  const title = createWidget('dynamic-value'); title.props = { field: 'title', as: 'h1' }
  const lead = createWidget('dynamic-value'); lead.props = { field: 'excerpt', as: 'p' }
  hero.columns[0].widgets.push(title, lead)
  body.style.paddingY = 16; body.columns[0].widgets.push(createWidget('surface-content'))
  doc.sections.push(hero, body); return doc
}
function dashboard(): BuilderDoc {
  const doc = emptyDoc()
  for (const part of DASHBOARD_PARTS) {
    const section = createSection(1), widget = createWidget('dashboard-part')
    section.style.paddingY = 8; widget.props = { part }; section.columns[0].widgets.push(widget); doc.sections.push(section)
  }
  return doc
}
export const SURFACE_PRESETS: BundledTemplate[] = [
  { id: 'surface-entry', fa: 'جزئیات محتوا', en: 'Entry detail', descFa: 'عنوان و توضیح پویا، همراه محتوای واقعی همان بخش', descEn: 'Dynamic title and lead with the real owner content', doc: entry() },
  { id: 'surface-dashboard', fa: 'پیشخوان ماژولار', en: 'Modular member home', descFa: 'کارت‌های واقعی هر کاربر، قابل چیدمان و استایل', descEn: 'Arrange the current member’s real dashboard parts', doc: dashboard() },
]
