/**
 * The blocks every MoboCom site has: layout and plain content. Domain blocks (a product grid, a
 * film card, a forum topic list) are registered by their own modules, not here.
 */
import { BlockRegistry, type BlockDefinition } from '@/modules/editor/domain/registry'

const WIDTHS = ['container', 'narrow', 'wide', 'full'] as const
const SPACES = ['none', 'sm', 'md', 'lg', 'xl'] as const
const TONES = ['none', 'surface', 'accent', 'dark'] as const
const ALIGNS = ['start', 'center', 'end'] as const
const columnCount = { kind: 'responsive', of: { kind: 'int', min: 1, max: 6, default: 2 } } as const

export const CORE_BLOCKS: BlockDefinition[] = [
  // ---------------------------------------------------------------- layout
  { type: 'layout.section', version: 1, category: 'layout', kind: 'static', icon: 'layout', label: { fa: 'بخش', en: 'Section' },
    fields: { width: { kind: 'enum', values: WIDTHS, default: 'container' }, space: { kind: 'enum', values: SPACES, default: 'md' }, tone: { kind: 'enum', values: TONES, default: 'none' }, anchor: { kind: 'string', max: 60 } },
    children: { allowed: 'any' } },
  { type: 'layout.container', version: 1, category: 'layout', kind: 'static', icon: 'box', label: { fa: 'قاب', en: 'Container' },
    fields: { width: { kind: 'enum', values: WIDTHS, default: 'container' }, align: { kind: 'enum', values: ALIGNS, default: 'start' } },
    children: { allowed: 'any' } },
  { type: 'layout.columns', version: 1, category: 'layout', kind: 'static', icon: 'columns', label: { fa: 'ستون‌ها', en: 'Columns' },
    fields: { columns: columnCount, gap: { kind: 'enum', values: SPACES, default: 'md' }, align: { kind: 'enum', values: [...ALIGNS, 'stretch'], default: 'stretch' } },
    children: { allowed: ['layout.column'], max: 6 } },
  { type: 'layout.column', version: 1, category: 'layout', kind: 'static', icon: 'column', label: { fa: 'ستون', en: 'Column' },
    fields: { span: { kind: 'int', min: 1, max: 6, default: 1 } },
    children: { allowed: 'any' }, parents: ['layout.columns'] },
  { type: 'layout.stack', version: 1, category: 'layout', kind: 'static', icon: 'stack', label: { fa: 'پشته', en: 'Stack' },
    fields: { direction: { kind: 'responsive', of: { kind: 'enum', values: ['vertical', 'horizontal'], default: 'vertical' } }, gap: { kind: 'enum', values: SPACES, default: 'md' }, align: { kind: 'enum', values: ALIGNS, default: 'start' } },
    children: { allowed: 'any' } },
  { type: 'layout.spacer', version: 1, category: 'layout', kind: 'static', icon: 'spacer', label: { fa: 'فاصله', en: 'Spacer' },
    fields: { size: { kind: 'responsive', of: { kind: 'enum', values: SPACES, default: 'md' } } } },
  { type: 'layout.divider', version: 1, category: 'layout', kind: 'static', icon: 'divider', label: { fa: 'جداکننده', en: 'Divider' },
    fields: { line: { kind: 'enum', values: ['solid', 'dashed', 'dots'], default: 'solid' } } },

  // ---------------------------------------------------------------- content
  { type: 'content.richText', version: 2, migrate: { 1: props => props }, category: 'content', kind: 'static', icon: 'text', label: { fa: 'متن', en: 'Rich text' },
    fields: { content: { kind: 'richText' }, dir: { kind: 'enum', values: ['auto', 'rtl', 'ltr'], default: 'auto' } } },
  { type: 'content.heading', version: 1, category: 'content', kind: 'static', icon: 'heading', label: { fa: 'تیتر', en: 'Heading' },
    // H1 is the page's own title: a document's headings start at 2, so a page never has two H1.
    fields: { text: { kind: 'string', max: 300, role: 'heading' }, level: { kind: 'int', min: 2, max: 6, default: 2 }, align: { kind: 'enum', values: ALIGNS, default: 'start' }, anchor: { kind: 'string', max: 60 } } },
  { type: 'content.image', version: 1, category: 'media', kind: 'static', icon: 'image', label: { fa: 'تصویر', en: 'Image' },
    fields: { image: { kind: 'asset', accept: 'image' }, link: { kind: 'url' }, width: { kind: 'enum', values: WIDTHS, default: 'container' }, rounded: { kind: 'boolean', default: true } } },
  { type: 'content.gallery', version: 1, category: 'media', kind: 'static', icon: 'gallery', label: { fa: 'گالری', en: 'Gallery' },
    fields: { images: { kind: 'list', max: 60, item: { image: { kind: 'asset', accept: 'image' } } }, columns: { kind: 'responsive', of: { kind: 'int', min: 1, max: 6, default: 3 } }, gap: { kind: 'enum', values: SPACES, default: 'sm' } } },
  { type: 'content.video', version: 1, category: 'media', kind: 'static', icon: 'video', label: { fa: 'ویدیو از کتابخانه', en: 'Video file' },
    fields: { file: { kind: 'asset', accept: 'video' }, poster: { kind: 'asset', accept: 'image' }, title: { kind: 'string', max: 200, role: 'text' }, ratio: { kind: 'enum', values: ['16:9', '4:3', '1:1', '9:16'], default: '16:9' } } },
  { type: 'content.audio', version: 1, category: 'media', kind: 'static', icon: 'music', label: { fa: 'موسیقی و پادکست', en: 'Music and podcast' },
    fields: { file: { kind: 'asset', accept: 'audio' }, poster: { kind: 'asset', accept: 'image' }, title: { kind: 'string', max: 200, role: 'text' }, audioKind: { kind: 'enum', values: ['music', 'podcast', 'voice'], default: 'music' } } },
  { type: 'content.embed', version: 1, category: 'media', kind: 'static', icon: 'video', label: { fa: 'ویدیو از سرویس‌ها', en: 'Hosted video' },
    fields: { embed: { kind: 'embed' }, title: { kind: 'string', max: 200, role: 'text' }, ratio: { kind: 'enum', values: ['16:9', '4:3', '1:1', '9:16'], default: '16:9' } } },
  { type: 'content.button', version: 1, category: 'content', kind: 'static', icon: 'button', label: { fa: 'دکمه', en: 'Button' },
    fields: { label: { kind: 'string', max: 80, role: 'text' }, href: { kind: 'url' }, variant: { kind: 'enum', values: ['primary', 'secondary', 'ghost'], default: 'primary' }, size: { kind: 'enum', values: ['sm', 'md', 'lg'], default: 'md' }, newTab: { kind: 'boolean', default: false } } },
  { type: 'content.buttonGroup', version: 1, category: 'content', kind: 'static', icon: 'buttons', label: { fa: 'گروه دکمه', en: 'Button group' },
    fields: { align: { kind: 'enum', values: ALIGNS, default: 'start' }, gap: { kind: 'enum', values: SPACES, default: 'sm' } },
    children: { allowed: ['content.button'], max: 6 } },
  { type: 'content.quote', version: 1, category: 'content', kind: 'static', icon: 'quote', label: { fa: 'نقل‌قول', en: 'Quote' },
    fields: { content: { kind: 'richText' }, cite: { kind: 'string', max: 200, role: 'text' } } },
  { type: 'content.callout', version: 1, category: 'content', kind: 'static', icon: 'callout', label: { fa: 'نکته', en: 'Callout' },
    fields: { tone: { kind: 'enum', values: ['info', 'success', 'warning', 'danger'], default: 'info' }, title: { kind: 'string', max: 200, role: 'text' }, content: { kind: 'richText' } } },
  // A synced pattern: the block keeps only which pattern (and its name for the editor); the blocks shown are the
  // pattern's current ones, read when the page is rendered. Inserted from the pattern library, never typed in.
  { type: 'content.pattern', version: 1, category: 'layout', kind: 'dynamic', icon: 'stack', label: { fa: 'الگوی همگام', en: 'Synced pattern' }, dataSource: { kind: 'pattern' },
    fields: { pattern: { kind: 'int', min: 1, max: 2147483647, default: 1 }, title: { kind: 'string', max: 100, role: 'text' } } },
  // Part of a document for chosen readers. Who reads it is decided per request; everywhere else (saved HTML, search, feeds) it is the notice alone.
  { type: 'content.restricted', version: 1, category: 'layout', kind: 'static', icon: 'callout', label: { fa: 'محتوای محدود', en: 'Restricted content' }, dataSource: { kind: 'restricted' },
    fields: { audience: { kind: 'enum', values: ['vip', 'signed-in'], default: 'vip' }, minRank: { kind: 'int', min: 0, max: 99, default: 0 }, message: { kind: 'string', max: 200, role: 'text' } },
    children: { allowed: 'any' } },
  // A form of the form builder, placed in the text (owner, 2026-10-28); the page mounts the live form into it.
  { type: 'content.form', version: 1, category: 'content', kind: 'static', icon: 'form', label: { fa: 'فرم', en: 'Form' },
    fields: { form: { kind: 'string', max: 80 } } },
  { type: 'content.faq', version: 1, category: 'content', kind: 'static', icon: 'faq', label: { fa: 'پرسش‌های پرتکرار', en: 'FAQ' },
    fields: { items: { kind: 'list', max: 60, item: { question: { kind: 'string', max: 300, role: 'text' }, answer: { kind: 'richText' } } }, open: { kind: 'enum', values: ['none', 'first', 'all'], default: 'none' } } },
]

/** A registry holding the core blocks; modules and extensions add theirs to it. */
export function createRegistry(extra: readonly BlockDefinition[] = []): BlockRegistry {
  const registry = new BlockRegistry()
  for (const definition of [...CORE_BLOCKS, ...extra]) registry.register(definition)
  return registry
}
