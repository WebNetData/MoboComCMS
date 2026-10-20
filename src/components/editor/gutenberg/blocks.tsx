'use client'

import { Component, useContext, useState, type ReactNode } from 'react'
import { useDispatch } from '@wordpress/data'
import { instantiatePattern } from '@/modules/editor/domain/structure'
import type { MoboComDocument } from '@/modules/editor/domain/document'
import { EditorEntityContext } from './module-preview-context'
import { createBlock, getBlockType, registerBlockType, unregisterBlockType, setCategories } from '@wordpress/blocks'
import { InnerBlocks, InspectorControls, useBlockProps, useInnerBlocksProps, type EngineBlockObject } from '@wordpress/block-editor'
import { PanelBody } from '@wordpress/components'
import { UNSUPPORTED_BLOCK, engineName, newEngineAttributes, toEngineBlocks, type EngineBlock } from '@/modules/editor/adapters/gutenberg/convert'
import { fieldDefault, type FieldSpec } from '@/modules/editor/domain/fields'
import type { BlockDefinition, BlockRegistry } from '@/modules/editor/domain/registry'
import { documentHtml } from '@/modules/editor/domain/render'
import { textDirection, type RichTextDoc } from '@/modules/editor/domain/rich-text'
import FieldControls from './FieldControls'
import RichTextField from './RichTextField'
import ModuleBlockPreview from './ModuleBlockPreview'
import ModuleItemsControl from './ModuleItemsControl'

// Every registered MoboCom block type becomes a Gutenberg block type with the same generic editing
// component: its settings panel comes from its fields, and what it shows on the canvas is built by
// the renderer the public page uses. A block type needs no editor code of its own.

const CATEGORY_TITLES: Record<string, string> = { layout: 'چیدمان', content: 'محتوا', media: 'رسانه', store: 'فروشگاه', journal: 'مجله', cinema: 'فیلم و سریال', music: 'موزیک', games: 'بازی', software: 'نرم‌افزار', forum: 'تالار', extension: 'افزونه‌ها' }

const attributeType = (spec: FieldSpec) => (spec.kind === 'int' ? 'integer' : spec.kind === 'boolean' ? 'boolean' : spec.kind === 'list' ? 'array' : spec.kind === 'string' || spec.kind === 'enum' || spec.kind === 'url' ? 'string' : 'object')

/** The class names the public renderer gives this block, so the canvas lays it out the same way. */
function rendered(definition: BlockDefinition, props: Record<string, unknown>, registry: BlockRegistry) {
  const html = documentHtml({ version: 1, blocks: [{ id: 'preview', type: definition.type, version: definition.version, props }] }, registry)
  return { html, className: /^<[a-z0-9]+ class="([^"]*)"/.exec(html)?.[1] || `mcb mcb-${definition.type.replace('.', '-')}` }
}

/** One broken block shows its own fault; the rest of the page stays editable. */
class BlockBoundary extends Component<{ type: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error(`[editor] block ${this.props.type} failed to render`, error) }
  render() { return this.state.failed ? <div className="mc-block-fault" role="alert">این بلوک ({this.props.type}) نمایش داده نشد. داده‌اش دست‌نخورده است و با ذخیره حفظ می‌شود.</div> : this.props.children }
}

function ContainerCanvas({ definition, className }: { definition: BlockDefinition; className: string }) {
  const allowed = definition.children!.allowed
  const horizontal = definition.type === 'layout.columns' || definition.type === 'content.buttonGroup'
  const inner = useInnerBlocksProps(useBlockProps({ className }), { allowedBlocks: allowed === 'any' ? true : allowed.map(engineName), orientation: horizontal ? 'horizontal' : 'vertical', renderAppender: InnerBlocks.ButtonBlockAppender })
  return <div {...inner} />
}

function LeafCanvas({ definition, attributes, setAttributes, registry, className, html }: { definition: BlockDefinition; attributes: Record<string, unknown>; setAttributes: (patch: Record<string, unknown>) => void; registry: BlockRegistry; className: string; html: string }) {
  const blockProps = useBlockProps({ className: definition.type === 'content.richText' || definition.type === 'content.heading' ? className : 'mc-block-preview' })
  if (definition.dataSource?.kind === 'pattern') return <div {...blockProps}><div className="mc-synced-head"><span className="mc-synced-badge">الگوی همگام</span><strong>{String(attributes.title || '')}</strong></div><ModuleBlockPreview definition={definition} props={attributes} /></div>
  if (definition.owner) return <div {...blockProps}><ModuleBlockPreview definition={definition} props={attributes} /></div>
  // The two blocks people write in are edited where they stand; every other block shows what the page will show.
  if (definition.type === 'content.richText') return <div {...blockProps}><RichTextField label={definition.label.fa} blockDirection={attributes.dir} value={(attributes.content as RichTextDoc) || (fieldDefault(definition.fields.content) as RichTextDoc)} onChange={(content) => setAttributes({ content })} /></div>
  if (definition.type === 'content.heading') {
    const Tag = `h${Math.min(6, Math.max(2, Number(attributes.level) || 2))}` as 'h2'
    return <Tag {...blockProps}><input className="mc-heading-input" dir={textDirection(attributes.text) || 'rtl'} aria-label="متن تیتر" placeholder="تیتر…" value={String(attributes.text ?? '')} onChange={(event) => setAttributes({ text: event.target.value })} onKeyDown={(event) => event.stopPropagation()} /></Tag>
  }
  void registry
  return <div {...blockProps}>{html ? <div className="mc-block-preview-body" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="mc-block-empty">{definition.label.fa}: از پنل تنظیمات پر کنید</div>}</div>
}

/** A synced pattern's own panel: what it is, and turning this one place into an independent, editable copy. */
function SyncedPatternPanel({ clientId, patternId, registry }: { clientId: string; patternId: number; registry: BlockRegistry }) {
  const entity = useContext(EditorEntityContext)
  const { replaceBlocks } = useDispatch('core/block-editor') as unknown as { replaceBlocks(clientIds: string, blocks: EngineBlockObject[]): void }
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function detach() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/editor/patterns?entity=${entity}`, { cache: 'no-store' }), data = await response.json().catch(() => null)
      const row = Array.isArray(data?.patterns) ? (data.patterns as { id: number; kind: string; document: MoboComDocument }[]).find(item => item.id === patternId && item.kind === 'synced') : null
      if (!response.ok || !row) throw Error(data?.error || 'این الگو دیگر در کتابخانه نیست.')
      replaceBlocks(clientId, toLiveBlocks(toEngineBlocks(instantiatePattern(row.document), registry)))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'جدا کردن انجام نشد.') }
    finally { setBusy(false) }
  }
  return <InspectorControls><PanelBody title="الگوی همگام" initialOpen>
    <p className="mc-synced-help">محتوای این بلوک از الگوی همگام خوانده می‌شود و فقط با به‌روزرسانی همان الگو در کتابخانه عوض می‌شود. برای ویرایش فقط در همین‌جا، آن را جدا کنید.</p>
    <button type="button" className="mc-editor-tool" disabled={busy || !entity} onClick={() => void detach()}>{busy ? 'در حال جدا کردن…' : 'جدا کردن و ویرایش در همین‌جا'}</button>
    {message && <p role="status">{message}</p>}
  </PanelBody></InspectorControls>
}

function Edit({ definition, registry, attributes, setAttributes, clientId }: { definition: BlockDefinition; registry: BlockRegistry; attributes: Record<string, unknown>; setAttributes: (patch: Record<string, unknown>) => void; clientId: string }) {
  const { mcId: _id, mcVersion: _version, ...props } = attributes
  const view = rendered(definition, props, registry)
  if (definition.dataSource?.kind === 'pattern') return <BlockBoundary type={definition.type}><SyncedPatternPanel clientId={clientId} patternId={Number(props.pattern)} registry={registry} /><LeafCanvas definition={definition} attributes={props} setAttributes={setAttributes} registry={registry} className={view.className} html={view.html} /></BlockBoundary>
  const onCanvas = definition.type === 'content.richText' ? ['content'] : definition.type === 'content.heading' ? ['text'] : []
  const hasPanel = Object.keys(definition.fields).some((name) => !onCanvas.includes(name))
  return (
    <BlockBoundary type={definition.type}>
      {hasPanel ? <InspectorControls><PanelBody title={definition.label.fa} initialOpen><FieldControls schema={definition.fields} values={props} onChange={setAttributes} skip={definition.dataSource?.kind === 'public-items' ? [...onCanvas, 'items'] : onCanvas} />{definition.dataSource?.kind === 'public-items' && props.source === 'selected' ? <ModuleItemsControl definition={definition} value={props.items} onChange={items => setAttributes({ items })} /> : null}</PanelBody></InspectorControls> : null}
      {definition.children ? <ContainerCanvas definition={definition} className={view.className} /> : <LeafCanvas definition={definition} attributes={props} setAttributes={setAttributes} registry={registry} className={view.className} html={view.html} />}
    </BlockBoundary>
  )
}

function UnsupportedEdit({ attributes }: { attributes: Record<string, unknown> }) {
  const stored = attributes.stored as { type?: string; version?: number } | undefined
  return <div {...useBlockProps({ className: 'mc-block-unsupported' })} role="note"><strong>بلوک پشتیبانی‌نشده: {String(stored?.type || 'ناشناخته')}</strong><span>ماژول یا افزونه‌ای که این بلوک را می‌سازد خاموش است، یا نسخهٔ آن تازه‌تر است. داده‌اش دست‌نخورده می‌ماند و با ذخیره حذف نمی‌شود.</span></div>
}

/** Registers the MoboCom block types with the editing engine, once per page load. */
export function registerMoboComBlocks(registry: BlockRegistry) {
  const used = [...new Set(registry.list().map((definition) => definition.category))]
  setCategories(used.map((slug) => ({ slug, title: CATEGORY_TITLES[slug] || slug, icon: null })))
  for (const definition of registry.list()) {
    const name = engineName(definition.type)
    if (getBlockType(name)) unregisterBlockType(name)
    registerBlockType(name, {
      apiVersion: 3, title: definition.label.fa, description: definition.label.en, category: definition.category, icon: 'block-default',
      attributes: { mcId: { type: 'string' }, lock: { type: 'object' }, mcVersion: { type: 'integer', default: definition.version }, ...Object.fromEntries(Object.entries(definition.fields).map(([field, spec]) => [field, { type: attributeType(spec), default: fieldDefault(spec) }])) },
      // No HTML editing, no free class name, no reusable copy: a block is its data.
      supports: { html: false, className: false, customClassName: false, reusable: false, anchor: false, inserter: definition.dataSource?.kind !== 'pattern' },
      ...(definition.parents ? { parent: definition.parents.map(engineName) } : {}),
      edit: ({ attributes, setAttributes, clientId }: { attributes: Record<string, unknown>; setAttributes: (patch: Record<string, unknown>) => void; clientId: string }) => <Edit definition={definition} registry={registry} attributes={attributes} setAttributes={setAttributes} clientId={clientId} />,
      // Nothing the engine serializes is stored: the document is built from the block list by the adapter.
      save: () => null,
    })
  }
  if (!getBlockType(UNSUPPORTED_BLOCK)) registerBlockType(UNSUPPORTED_BLOCK, {
    apiVersion: 3, title: 'بلوک پشتیبانی‌نشده', category: used[0] || 'content', icon: 'warning',
    attributes: { mcId: { type: 'string' }, stored: { type: 'object' } },
    supports: { html: false, className: false, customClassName: false, reusable: false, inserter: false, multiple: true },
    edit: ({ attributes }: { attributes: Record<string, unknown> }) => <UnsupportedEdit attributes={attributes} />,
    save: () => null,
  })
}

/** Engine blocks as the engine wants them: with ids of its own. */
export function toLiveBlocks(blocks: readonly EngineBlock[]): EngineBlockObject[] {
  return blocks.map((block) => createBlock(block.name, block.attributes, toLiveBlocks(block.innerBlocks)) as unknown as EngineBlockObject)
}

export { newEngineAttributes }
