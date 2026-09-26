import { db } from '@/platform/database/prisma'
import { parseBuilderDoc, type BuilderDoc } from '@/modules/site/domain/builder'
import { POST_TEMPLATES } from '@/modules/site/domain/builder-templates'
import type { Permission } from '@/modules/identity/rbac'
import { cleanRichText, cleanWidgetHtml, sanitizeWidgetCss } from '@/shared/content/sanitize'

/** Page ids: numeric CMS page ids, `home`, `blog`, `post-<id>`, `product-<id>`. */
export const BUILDER_PAGE_ID = /^[a-zA-Z0-9-]{1,40}$/

export const USER_TEMPLATES_KEY = 'page.builder.templates.v1'
const MAX_USER_TEMPLATES = 20
const MAX_TEMPLATE_DOC = 200_000

export type TemplateKind = 'page' | 'post'
export type UserTemplate = { id: string; name: string; nameEn: string; createdAt: string; kind: TemplateKind; doc: BuilderDoc }

export function builderKey(pageId: string) {
  return `page.builder.${pageId}`
}

export function draftKey(pageId: string) {
  return `page.builder.draft.${pageId}`
}

/** Admin-authored JavaScript (advanced code) runs for every visitor — it needs a stronger permission. */
export const SCRIPT_PERMISSION: Permission = 'settings.manage'

export function docUsesScripts(doc: BuilderDoc): boolean {
  if (doc.code.advanced && (doc.code.html || doc.code.js || doc.code.css)) return true
  return doc.sections.some((section) => section.columns.some((column) => column.widgets.some((widget) => widget.type === 'html' && widget.props.advanced === '1')))
}

function scriptFingerprint(doc: BuilderDoc | null): string {
  if (!doc) return '[]'
  const parts: string[] = []
  if (doc.code.advanced) parts.push(`page:${doc.code.html}\u0000${doc.code.css}\u0000${doc.code.js}`)
  for (const section of doc.sections) for (const column of section.columns) for (const widget of column.widgets) {
    if (widget.type === 'html' && widget.props.advanced === '1') parts.push(`${widget.props.html}\u0000${widget.props.css}\u0000${widget.props.js}`)
  }
  return JSON.stringify(parts.sort())
}

/**
 * True when the document adds or edits advanced (script-running) code compared to
 * the published version. Editors without the script permission may still save
 * pages that merely keep code a site admin already published.
 */
export async function introducesScripts(pageId: string, doc: BuilderDoc): Promise<boolean> {
  if (!docUsesScripts(doc)) return false
  return scriptFingerprint(doc) !== scriptFingerprint(await getBuilderDoc(pageId))
}

export function permFor(pageId: string): Permission {
  const template = /^tpl-(header|footer|page|post|product)-/.exec(pageId)
  if (template) {
    if (template[1] === 'post') return 'cms.posts'
    if (template[1] === 'product') return 'cms.products'
    if (template[1] === 'page') return 'cms.pages'
    return 'settings.manage'
  }
  if (pageId === 'home') return 'settings.manage'
  if (pageId === 'blog') return 'cms.posts'
  if (pageId.startsWith('post-')) return 'cms.posts'
  if (pageId.startsWith('product-')) return 'cms.products'
  return 'cms.pages'
}

function parseMeaningful(raw: string): BuilderDoc | null {
  try {
    const doc = parseBuilderDoc(JSON.parse(raw))
    return doc.sections.length || doc.mode === 'code' || doc.code.html || doc.code.css || doc.code.js ? doc : null
  } catch {
    return null
  }
}

export async function getBuilderDoc(pageId: string): Promise<BuilderDoc | null> {
  if (!BUILDER_PAGE_ID.test(pageId)) return null
  const row = await db.setting.findUnique({ where: { key: builderKey(pageId) } })
  if (!row) return null
  return parseMeaningful(row.value)
}

/**
 * Unsaved editor draft — only consumed by the live-preview route.
 * `present` distinguishes "user cleared the page" from "no draft saved".
 */
export async function getBuilderDraft(pageId: string): Promise<{ present: boolean; doc: BuilderDoc | null }> {
  if (!BUILDER_PAGE_ID.test(pageId)) return { present: false, doc: null }
  const row = await db.setting.findUnique({ where: { key: draftKey(pageId) } })
  if (!row) return { present: false, doc: null }
  return { present: true, doc: parseMeaningful(row.value) }
}

export async function saveBuilderDraft(pageId: string, doc: BuilderDoc): Promise<void> {
  const key = draftKey(pageId)
  const value = JSON.stringify(doc)
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}

export async function clearBuilderDraft(pageId: string): Promise<void> {
  await db.setting.delete({ where: { key: draftKey(pageId) } }).catch(() => undefined)
}

export async function saveBuilderDoc(pageId: string, doc: BuilderDoc): Promise<void> {
  const key = builderKey(pageId)
  const value = JSON.stringify(doc)
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
}

/** Render-time safety net: rich text / custom code are cleaned before persistence. */
export function sanitizeBuilderDoc(doc: BuilderDoc): BuilderDoc {
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        widgets: column.widgets.map((widget) => {
          const props = { ...widget.props }
          if (widget.type === 'text') {
            props.html = cleanRichText(props.html)
            props.htmlEn = cleanRichText(props.htmlEn)
          }
          if (widget.type === 'html') {
            if (widget.props.advanced === '1') {
              props.html = String(props.html || '').slice(0, 60000)
              props.css = String(props.css || '').slice(0, 40000)
              props.js = String(props.js || '').slice(0, 30000)
            } else {
              props.html = cleanWidgetHtml(props.html)
              props.css = sanitizeWidgetCss(props.css)
              props.js = ''
            }
          }
          if (widget.type === 'template') {
            props.templateId = props.templateId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
          }
          return { ...widget, props }
        }),
      })),
    })),
  }
}

async function readTemplatesRow(): Promise<UserTemplate[]> {
  const row = await db.setting.findUnique({ where: { key: USER_TEMPLATES_KEY } })
  if (!row) return []
  try {
    const parsed = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): UserTemplate[] => {
      if (!entry || typeof entry !== 'object') return []
      try {
        const doc = sanitizeBuilderDoc(parseBuilderDoc(entry.doc))
        const id = String(entry.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
        const name = String(entry.name || '').slice(0, 80)
        if (!id || !name) return []
        return [{
          id,
          name,
          nameEn: String(entry.nameEn || '').slice(0, 80),
          createdAt: String(entry.createdAt || ''),
          kind: entry.kind === 'post' ? 'post' : 'page',
          doc,
        }]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

export async function listUserTemplates(): Promise<UserTemplate[]> {
  return readTemplatesRow()
}

export async function addUserTemplate(input: { name: string; nameEn?: string; doc: BuilderDoc; kind?: TemplateKind }): Promise<{ saved: boolean; count: number }> {
  const doc = sanitizeBuilderDoc(input.doc)
  if (JSON.stringify(doc).length > MAX_TEMPLATE_DOC) throw new Error('Template too large')
  const list = await readTemplatesRow()
  if (list.length >= MAX_USER_TEMPLATES) throw new Error('Template limit reached')
  const template: UserTemplate = {
    id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(input.name || '').trim().slice(0, 80) || 'قالب بدون نام',
    nameEn: String(input.nameEn || '').trim().slice(0, 80),
    createdAt: new Date().toISOString(),
    kind: input.kind === 'post' ? 'post' : 'page',
    doc,
  }
  const value = JSON.stringify([...list, template])
  await db.setting.upsert({ where: { key: USER_TEMPLATES_KEY }, create: { key: USER_TEMPLATES_KEY, value }, update: { value } })
  return { saved: true, count: list.length + 1 }
}

export async function removeUserTemplate(id: string): Promise<{ removed: boolean }> {
  const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  const list = await readTemplatesRow()
  const next = list.filter((entry) => entry.id !== clean)
  if (next.length === list.length) return { removed: false }
  const value = JSON.stringify(next)
  await db.setting.upsert({ where: { key: USER_TEMPLATES_KEY }, create: { key: USER_TEMPLATES_KEY, value }, update: { value } })
  return { removed: true }
}

const TEMPLATE_ID = /^[a-zA-Z0-9_-]{1,64}$/

/** Per-post / per-product layout assignment (WordPress-style template choice). `''` = automatic. */
export async function getEntityTemplateId(entity: 'post' | 'product', id: number): Promise<string> {
  if (!Number.isSafeInteger(id) || id <= 0) return ''
  const row = await db.setting.findUnique({ where: { key: `${entity}.template.${id}` } }).catch(() => null)
  if (!row) return ''
  return TEMPLATE_ID.test(row.value) ? row.value : ''
}

export async function setEntityTemplateId(entity: 'post' | 'product', id: number, templateId: string): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid id')
  const clean = String(templateId || '')
  if (clean && !TEMPLATE_ID.test(clean)) throw new Error('Invalid template')
  const key = `${entity}.template.${id}`
  if (!clean) {
    await db.setting.delete({ where: { key } }).catch(() => undefined)
    return
  }
  await db.setting.upsert({ where: { key }, create: { key, value: clean }, update: { value: clean } })
}

export async function getPostTemplateId(postId: number): Promise<string> {
  return getEntityTemplateId('post', postId)
}

export async function setPostTemplateId(postId: number, templateId: string): Promise<void> {
  if (!Number.isSafeInteger(postId) || postId <= 0) throw new Error('Invalid post')
  const clean = String(templateId || '')
  if (clean && !TEMPLATE_ID.test(clean)) throw new Error('Invalid template')
  const key = `post.template.${postId}`
  if (!clean) {
    await db.setting.delete({ where: { key } }).catch(() => undefined)
    return
  }
  await db.setting.upsert({ where: { key }, create: { key, value: clean }, update: { value: clean } })
}

export type PostTemplateOption = { id: string; fa: string; en: string; builtin: boolean }

export async function listPostTemplateOptions(): Promise<{ builtin: PostTemplateOption[]; mine: PostTemplateOption[] }> {
  const user = await readTemplatesRow()
  return {
    builtin: POST_TEMPLATES.map((template) => ({ id: template.id, fa: template.fa, en: template.en, builtin: true })),
    mine: user.filter((entry) => entry.kind === 'post').map((entry) => ({ id: entry.id, fa: entry.name, en: entry.nameEn || entry.name, builtin: false })),
  }
}

export async function resolvePostTemplateDoc(templateId: string): Promise<BuilderDoc | null> {
  if (!TEMPLATE_ID.test(templateId)) return null
  const builtin = POST_TEMPLATES.find((template) => template.id === templateId)
  if (builtin) return builtin.doc
  const list = await readTemplatesRow()
  return list.find((entry) => entry.id === templateId && entry.kind === 'post')?.doc || null
}
