/**
 * What a document says and how it reads as plain HTML, worked out from the registry's field
 * declarations: no block type is named here.
 *
 *  - `documentFacts`: plain text, headings, links and images, for search and for the SEO module.
 *  - `documentHtml`: semantic HTML with every value escaped, for feeds, e-mail, the stored plain
 *    copy and any place without the theme's components. Pages are rendered by the React renderer;
 *    this is never the source of truth and never trusted as input.
 */
import { walkBlocks, type MoboComBlock, type MoboComDocument } from '@/modules/editor/domain/document'
import { BREAKPOINTS, type AssetValue, type EmbedValue, type FieldSchema, type FieldSpec } from '@/modules/editor/domain/fields'
import type { BlockRegistry } from '@/modules/editor/domain/registry'
import { escapeHtml, richTextFacts, richTextHtml, safeLinkHref, textDirection } from '@/modules/editor/domain/rich-text'
import { editorialMediaHtml, mediaShortcodes } from '@/shared/media/editorial'
import { renderBBCode } from '@/shared/content/bbcode'

export interface DocumentFacts {
  text: string
  headings: Array<{ level: number; text: string; blockId: string }>
  links: Array<{ href: string; text: string; blockId: string }>
  images: Array<{ src: string; alt: string; blockId: string }>
  blocks: Array<{ id: string; type: string; supported: boolean }>
  /** Images without a description: an accessibility and SEO fault the editor can point at. */
  imagesWithoutAlt: number
}

function fieldFacts(spec: FieldSpec, value: unknown, block: MoboComBlock, facts: DocumentFacts, lines: string[], level: number) {
  if (value == null) return
  switch (spec.kind) {
    case 'string': {
      const text = typeof value === 'string' ? value.trim() : ''
      if (!text || !spec.role) return
      if (spec.role === 'heading') facts.headings.push({ level, text, blockId: block.id })
      lines.push(text)
      return
    }
    case 'richText': {
      const rich = richTextFacts(value)
      if (rich.text) lines.push(rich.text)
      for (const heading of rich.headings) facts.headings.push({ ...heading, blockId: block.id })
      for (const link of rich.links) facts.links.push({ ...link, blockId: block.id })
      return
    }
    case 'url': { const href = safeLinkHref(value); if (href) facts.links.push({ href, text: typeof block.props.label === 'string' ? block.props.label : '', blockId: block.id }); return }
    case 'asset': {
      const asset = value as AssetValue
      if (!asset.src) return
      if (spec.accept === 'image') { facts.images.push({ src: asset.src, alt: asset.alt || '', blockId: block.id }); if (!asset.alt?.trim()) facts.imagesWithoutAlt += 1 }
      if (asset.caption) lines.push(asset.caption)
      return
    }
    case 'list': { if (Array.isArray(value)) for (const item of value) schemaFacts(spec.item, item as Record<string, unknown>, block, facts, lines, level); return }
    default: return
  }
}

function schemaFacts(schema: FieldSchema, props: Record<string, unknown>, block: MoboComBlock, facts: DocumentFacts, lines: string[], level: number) {
  for (const [name, spec] of Object.entries(schema)) fieldFacts(spec, props?.[name], block, facts, lines, level)
}

export function documentFacts(document: MoboComDocument, registry: BlockRegistry): DocumentFacts {
  const facts: DocumentFacts = { text: '', headings: [], links: [], images: [], blocks: [], imagesWithoutAlt: 0 }
  const lines: string[] = []
  const visit = (blocks: readonly MoboComBlock[]) => {
    for (const block of blocks) {
      const definition = registry.get(block.type)
      const supported = !!definition && block.version === definition.version
      facts.blocks.push({ id: block.id, type: block.type, supported })
      // What an unsupported block holds is not read: its props are not known to mean what they look like.
      if (!supported) continue
      const level = typeof block.props.level === 'number' ? block.props.level : 2
      schemaFacts(definition.fields, block.props, block, facts, lines, level)
      // A restricted block's text stays out of search, descriptions and everything else built from these facts.
      if (definition.children && Array.isArray(block.children) && definition.dataSource?.kind !== 'restricted') visit(block.children)
    }
  }
  visit(document.blocks)
  facts.text = lines.join('\n')
  return facts
}

/** Heading order as a reader meets it: a level that skips more than one step down is reported (H2 then H4). */
export function headingProblems(facts: DocumentFacts): Array<{ blockId: string; message: string }> {
  const problems: Array<{ blockId: string; message: string }> = []
  let previous = 1
  for (const heading of facts.headings) {
    if (heading.level > previous + 1) problems.push({ blockId: heading.blockId, message: `heading level ${heading.level} follows level ${previous}` })
    previous = heading.level
  }
  return problems
}

// ------------------------------------------------------------------ plain HTML

const cls = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')
/** A value from a closed list, as a class name; anything else adds nothing. */
const token = (prefix: string, value: unknown) => (typeof value === 'string' && /^[a-z0-9:-]{1,20}$/i.test(value) ? `${prefix}-${value.replace(':', 'x')}` : typeof value === 'number' && Number.isInteger(value) ? `${prefix}-${value}` : '')
const responsive = (prefix: string, value: unknown) => (value && typeof value === 'object' ? BREAKPOINTS.map((point) => token(`${prefix}-${point}`, (value as Record<string, unknown>)[point])).join(' ') : '')
const anchor = (value: unknown) => (typeof value === 'string' && /^[A-Za-z][\w-]{0,59}$/.test(value) ? ` id="${value}"` : '')

function imageHtml(asset: AssetValue | undefined): string {
  if (!asset?.src) return ''
  const size = asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : ''
  const img = `<img src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.alt || '')}"${size} loading="lazy" decoding="async">`
  return asset.caption ? `<figure>${img}<figcaption>${escapeHtml(asset.caption)}</figcaption></figure>` : img
}

export type ModuleBlockHtml = (block: MoboComBlock) => string | undefined

export function restrictedNotice(message: unknown, audience: unknown): string {
  const fallback = audience === 'signed-in' ? 'این بخش برای کاربران عضو سایت است.' : 'این بخش مخصوص اعضای ویژه است.'
  const link = audience === 'signed-in' ? '<a class="mcb-restricted-link" href="/login">ورود به حساب</a>' : '<a class="mcb-restricted-link" href="/vip">مشاهدهٔ اشتراک ویژه</a>'
  return `<aside class="mcb mcb-content-restricted is-locked"><p>${escapeHtml(String(message || fallback))}</p>${link}</aside>`
}

function blockHtml(block: MoboComBlock, registry: BlockRegistry, moduleHtml?: ModuleBlockHtml): string {
  const definition = registry.get(block.type)
  // An unsupported block leaves a mark where it stands and shows nothing: its data is kept, not guessed at.
  if (!definition || block.version !== definition.version) return `<!-- unsupported block ${escapeHtml(block.type).replace(/--/g, '')} -->`
  const p = block.props, inner = () => (block.children || []).map((child) => blockHtml(child, registry, moduleHtml)).join('')
  const name = `mcb mcb-${block.type.replace('.', '-')}`
  switch (block.type) {
    case 'layout.section': return `<section class="${cls(name, token('mcb-width', p.width), token('mcb-space', p.space), token('mcb-tone', p.tone))}"${anchor(p.anchor)}>${inner()}</section>`
    case 'layout.container': return `<div class="${cls(name, token('mcb-width', p.width), token('mcb-align', p.align))}">${inner()}</div>`
    case 'layout.columns': return `<div class="${cls(name, responsive('mcb-cols', p.columns), token('mcb-gap', p.gap), token('mcb-align', p.align))}">${inner()}</div>`
    case 'layout.column': return `<div class="${cls(name, token('mcb-span', p.span))}">${inner()}</div>`
    case 'layout.stack': return `<div class="${cls(name, responsive('mcb-dir', p.direction), token('mcb-gap', p.gap), token('mcb-align', p.align))}">${inner()}</div>`
    case 'layout.spacer': return `<div class="${cls(name, responsive('mcb-size', p.size))}" aria-hidden="true"></div>`
    case 'layout.divider': return `<hr class="${cls(name, token('mcb-line', p.line))}">`
    case 'content.richText': return `<div class="${name}"${p.dir === 'rtl' || p.dir === 'ltr' ? ` dir="${p.dir}"` : ''}>${renderBBCode(mediaShortcodes(richTextHtml(p.content, p.dir)))}</div>`
    case 'content.heading': { const level = Math.min(6, Math.max(2, Number(p.level) || 2)); const dir = textDirection(p.text); return `<h${level} class="${cls(name, token('mcb-align', p.align))}"${anchor(p.anchor)}${dir ? ` dir="${dir}"` : ''}>${escapeHtml(String(p.text || ''))}</h${level}>` }
    case 'content.image': {
      const image = imageHtml(p.image as AssetValue), href = safeLinkHref(p.link)
      return image ? `<div class="${cls(name, token('mcb-width', p.width), p.rounded === true && 'is-rounded')}">${href ? `<a href="${escapeHtml(href)}">${image}</a>` : image}</div>` : ''
    }
    case 'content.gallery': return `<div class="${cls(name, responsive('mcb-cols', p.columns), token('mcb-gap', p.gap))}">${(Array.isArray(p.images) ? p.images : []).map((item) => imageHtml((item as { image?: AssetValue }).image)).join('')}</div>`
    case 'content.embed': {
      const embed = p.embed as EmbedValue | undefined
      return editorialMediaHtml({ kind: 'embed', src: embed?.url, title: p.title, ratio: p.ratio })
    }
    case 'content.video': case 'content.audio': {
      const file = p.file as AssetValue | undefined, poster = p.poster as AssetValue | undefined
      return editorialMediaHtml({ kind: block.type === 'content.video' ? 'video' : 'audio', src: file?.src, title: p.title, caption: file?.caption, poster: poster?.src, audioKind: p.audioKind, ratio: p.ratio })
    }
    case 'content.button': {
      const href = safeLinkHref(p.href), label = escapeHtml(String(p.label || ''))
      return label ? `<a class="${cls(name, token('mcb-variant', p.variant), token('mcb-size', p.size))}" href="${escapeHtml(href || '#')}"${p.newTab === true ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>` : ''
    }
    // The editor domain depends on nothing else: the address rule and the placeholder are the forms domain's (embed.ts), kept equal by a test.
    case 'content.form': { const slug = String(p.form || ''); return /^[a-z][a-z0-9-]{1,79}$/.test(slug) ? `<div class="mc-form-embed" data-mc-form="${slug}"></div>` : '' }
    case 'content.buttonGroup': return `<div class="${cls(name, token('mcb-align', p.align), token('mcb-gap', p.gap))}">${inner()}</div>`
    case 'content.quote': return `<figure class="${name}"><blockquote>${richTextHtml(p.content)}</blockquote>${p.cite ? `<figcaption>${escapeHtml(String(p.cite))}</figcaption>` : ''}</figure>`
    // Without a decision for this reader there is only the notice: the blocks inside are never written out here.
    case 'content.restricted': return moduleHtml?.(block) ?? restrictedNotice(p.message, p.audience)
    case 'content.callout': return `<aside class="${cls(name, token('mcb-tone', p.tone))}" role="note">${p.title ? `<strong>${escapeHtml(String(p.title))}</strong>` : ''}${richTextHtml(p.content)}</aside>`
    case 'content.faq': return `<div class="${name}">${(Array.isArray(p.items) ? p.items : []).map((item, index) => { const row = item as { question?: string; answer?: unknown }; return `<details${p.open === 'all' || (p.open === 'first' && index === 0) ? ' open' : ''}><summary>${escapeHtml(String(row.question || ''))}</summary>${richTextHtml(row.answer)}</details>` }).join('')}</div>`
    // A block registered by a module is rendered by that module's component on a page; here it leaves its place marked.
    default: return moduleHtml?.(block) ?? `<div class="${name}" data-block="${escapeHtml(block.type)}"></div>`
  }
}

export function documentHtml(document: MoboComDocument, registry: BlockRegistry, moduleHtml?: ModuleBlockHtml): string {
  return document.blocks.map((block) => blockHtml(block, registry, moduleHtml)).join('\n')
}

/** How many blocks of each type a document holds. */
export function blockCounts(document: MoboComDocument): Record<string, number> {
  const counts: Record<string, number> = {}
  walkBlocks(document.blocks, (block) => { counts[block.type] = (counts[block.type] || 0) + 1 })
  return counts
}
