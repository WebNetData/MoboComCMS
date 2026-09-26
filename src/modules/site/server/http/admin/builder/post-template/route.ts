import { NextRequest } from 'next/server'
import { err, ok } from '@/platform/http/response'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdmin } from '@/platform/audit/server'
import { getPostTemplateId, listPostTemplateOptions, setPostTemplateId, resolvePostTemplateDoc } from '@/modules/site/server/builder'

function readPostId(value: unknown): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function GET(req: NextRequest) {
  const postId = readPostId(req.nextUrl.searchParams.get('postId'))
  if (!postId) return err('Invalid post ID')
  if (!await requirePerm(req, 'cms.posts')) return err('forbidden', 403)
  const templateId = await getPostTemplateId(postId)
  const options = await listPostTemplateOptions()
  return ok({ postId, templateId, ...options })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const postId = readPostId(body?.postId)
  if (!postId) return err('Invalid post ID')
  const admin = await requirePerm(req, 'cms.posts')
  if (!admin) return err('forbidden', 403)
  const templateId = String(body?.templateId || '')
  if (templateId && !(await resolvePostTemplateDoc(templateId))) return err('Template not found', 404)
  try {
    await setPostTemplateId(postId, templateId)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Invalid template')
  }
  await auditAdmin({
    req,
    actor: admin,
    action: 'page.builder.post.template',
    targetType: 'Post',
    targetId: String(postId),
    metadata: { templateId: templateId || '(default)' },
  })
  return ok({ saved: true, postId, templateId })
}
