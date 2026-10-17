import type { NextRequest } from 'next/server'
import { db } from '@/platform/database/prisma'
import { auditAdminStrict } from '@/platform/audit/server'
import { folderId, folderKey, libraryName, libraryTags, LibraryError, LIBRARY_KINDS } from '@/modules/media/domain/library'
import { libraryTransaction, currentLibraryUser, owns, type LibraryActor } from './authority'
import { assetView, discoverAssets } from './catalog'

export async function queryLibrary(actor: LibraryActor, params: URLSearchParams) {
  const user = await currentLibraryUser(actor)
  const folder = params.get('folder')
  const q = (params.get('q') || '').trim().slice(0, 120)
  const kind = params.get('kind') || ''
  const rawPage = Number(params.get('page'))
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000000) : 1
  const where = {
    archivedAt: params.get('trash') === '1' ? { not: null } : null,
    ...(folder !== null && folder !== 'all' ? { folderId: folderId(folder) } : {}),
    ...(LIBRARY_KINDS.includes(kind as typeof LIBRARY_KINDS[number]) ? { kind } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { alt: { contains: q } }, { caption: { contains: q } }, { tags: { contains: q } }] } : {}),
    ...(params.get('tag') ? { tags: { contains: JSON.stringify(libraryTags([params.get('tag')])[0]) } } : {}),
  }
  const [folders, total, items] = await Promise.all([
    db.mediaFolder.findMany({ orderBy: { name: 'asc' } }), db.mediaAsset.count({ where }),
    db.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 40, take: 40 }),
  ])
  return { items: items.map(r => assetView(r, user)), folders: folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, revision: f.revision, editable: user.manageLibrary || f.createdById === user.id })), total, page, pages: Math.max(1, Math.ceil(total / 40)), manage: user.manageLibrary, configure: user.configureLibrary, serverTools: user.serverTools, userId: user.id }
}

export async function libraryCommand(actor: LibraryActor, input: Record<string, unknown>, req: NextRequest) {
  if (input.action === 'discover') {
    const user = await currentLibraryUser(actor)
    if (!user.manageLibrary) throw new LibraryError('فقط مدیر کتابخانه می‌تواند فایل‌های قدیمی را نمایه کند', 403)
    const result = await discoverAssets(String(input.cursor || ''))
    await auditAdminStrict({ req, actor: user, action: 'media.discovered', targetType: 'media-library', metadata: { count: result.count } })
    return result
  }
  return libraryTransaction(async tx => {
    const user = await currentLibraryUser(actor, tx)
    const audit = (action: string, id: string | number, metadata?: Record<string, unknown>) => auditAdminStrict({ req, actor: user, action, targetType: 'media-library', targetId: String(id), metadata }, tx)
    if (input.action === 'folder.create' || input.action === 'folder.update') {
      const name = libraryName(input.name), parentId = folderId(input.parentId)
      if (parentId && !await tx.mediaFolder.findUnique({ where: { id: parentId } })) throw new LibraryError('پوشهٔ مقصد پیدا نشد', 404)
      if (input.action === 'folder.create') {
        const row = await tx.mediaFolder.create({ data: { name, key: folderKey(parentId, name), parentId, createdById: user.id } })
        await audit('media.folder.created', row.id); return row
      }
      const id = folderId(input.id)
      const row = id ? await tx.mediaFolder.findUnique({ where: { id } }) : null
      if (!row) throw new LibraryError('پوشه پیدا نشد', 404)
      owns(user, row)
      if (parentId !== row.parentId && !user.manageLibrary) throw new LibraryError('جابه‌جایی ساختار پوشه‌ها به مدیر کتابخانه اختصاص دارد', 403)
      let ancestor = parentId, depth = 0
      while (ancestor) {
        if (ancestor === row.id || ++depth > 100) throw new LibraryError('پوشه نمی‌تواند داخل خودش یا زیرپوشهٔ خودش باشد')
        ancestor = (await tx.mediaFolder.findUnique({ where: { id: ancestor }, select: { parentId: true } }))?.parentId ?? null
      }
      const changed = await tx.mediaFolder.updateMany({ where: { id: row.id, revision: Number(input.revision) }, data: { name, parentId, key: folderKey(parentId, name), revision: { increment: 1 } } })
      if (!changed.count) throw new LibraryError('پوشه هم‌زمان تغییر کرده؛ فهرست را تازه کنید', 409)
      await audit('media.folder.updated', row.id); return { id: row.id }
    }
    if (input.action === 'folder.delete') {
      const id = folderId(input.id)
      const row = id ? await tx.mediaFolder.findUnique({ where: { id } }) : null
      if (!row) throw new LibraryError('پوشه پیدا نشد', 404)
      owns(user, row)
      if (await tx.mediaFolder.count({ where: { parentId: id } }) || await tx.mediaAsset.count({ where: { folderId: id } }) || await tx.mediaTransfer.count({ where: { folderId: id, status: { in: ['QUEUED', 'RUNNING', 'FAILED', 'PAUSED'] } } })) throw new LibraryError('ابتدا فایل‌ها، زیرپوشه‌ها و انتقال‌های فعال این پوشه را جابه‌جا کنید', 409)
      const changed = await tx.mediaFolder.deleteMany({ where: { id: row.id, revision: Number(input.revision) } })
      if (!changed.count) throw new LibraryError('پوشه تغییر کرده است', 409)
      await audit('media.folder.deleted', row.id); return { deleted: true }
    }
    if (input.action === 'assets.update') {
      const entries = Array.isArray(input.items) ? input.items as { id: string; revision: number }[] : []
      if (!entries.length || entries.length > 100) throw new LibraryError('بین ۱ تا ۱۰۰ فایل انتخاب کنید')
      const patch = (input.patch || {}) as Record<string, unknown>
      const destination = 'folderId' in patch ? folderId(patch.folderId) : undefined
      if (destination && !await tx.mediaFolder.findUnique({ where: { id: destination } })) throw new LibraryError('پوشهٔ مقصد وجود ندارد', 404)
      for (const item of entries) {
        const row = await tx.mediaAsset.findUnique({ where: { id: String(item.id) } })
        if (!row) throw new LibraryError('فایل پیدا نشد', 404)
        owns(user, row)
        const data = {
          ...('name' in patch ? { name: libraryName(patch.name) } : {}),
          ...('alt' in patch ? { alt: String(patch.alt || '').slice(0, 500) } : {}),
          ...('caption' in patch ? { caption: String(patch.caption || '').slice(0, 2000) } : {}),
          ...('tags' in patch ? { tags: JSON.stringify(libraryTags(patch.tags)) } : {}),
          ...(destination !== undefined ? { folderId: destination } : {}),
          ...(typeof patch.archived === 'boolean' ? { archivedAt: patch.archived ? new Date() : null } : {}),
          revision: { increment: 1 },
        }
        const changed = await tx.mediaAsset.updateMany({ where: { id: row.id, revision: Number(item.revision) }, data })
        if (!changed.count) throw new LibraryError('یکی از فایل‌ها هم‌زمان تغییر کرده؛ فهرست را تازه کنید', 409)
      }
      await audit('media.assets.updated', entries[0].id, { ids: entries.map(e => e.id), fields: Object.keys(patch) }); return { updated: entries.length }
    }
    throw new LibraryError('عملیات ناشناخته است')
  })
}
