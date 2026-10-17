import type { ImportJob } from '@prisma/client'
import type { ImportSettings } from '@/modules/imports/domain/types'
import { importImage } from '@/modules/imports/server/media'
import { copiesFiles, copiesImages } from '@/modules/imports/domain/media-options'
import { continuingImportActor } from '@/modules/imports/server/authority'
import type { AssetOrganization } from '@/modules/downloads/domain/organization'

export function importMediaServices(job: ImportJob | null, settings: ImportSettings, dryRun: boolean) {
  async function transfer(url: string, kind: 'image' | 'file', organization?: AssetOrganization) {
    if (dryRun) throw new Error('dry run never downloads')
    if (!/^https?:\/\//i.test(url)) return { url, reused: true }
    if (kind === 'image' ? !copiesImages(settings.options) : !copiesFiles(settings.options)) return { url, reused: true }
    if (!job || !await continuingImportActor(job, 'RUNNING')) throw new Error('اختیار اجرای ورود اطلاعات تغییر کرده است')
    if (kind === 'image' && settings.options.copyAssets === undefined) return importImage(url)
    const mode = String(settings.options.mediaTransferMode || 'immediate')
    const result = await (await import('@/modules/media/server/library')).requestTransfer({ id: job.executionActorId ?? job.createdById, authAt: job.executionAuthorizedAt ?? job.createdAt, purpose: 'import' }, { url, kind, mode, organization, section: organization?.section==='film'||organization?.section==='series'?'cinema':organization?.section||'posts', ...(mode === 'scheduled' ? { runAt: settings.options.mediaTransferAt } : {}) })
    return { url: result.url, reused: result.status === 'READY', deferred: result.status !== 'READY' }
  }
  return { importImage: (url: string, organization?: AssetOrganization) => transfer(url, 'image', organization), importFile: (url: string, organization?: AssetOrganization) => transfer(url, 'file', organization) }
}
