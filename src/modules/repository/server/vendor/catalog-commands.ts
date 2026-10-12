import { updateJsonSetting, JsonSettingMutationError } from '@/modules/settings/server'
import { auditAdminStrict } from '@/platform/audit/server'
import { normalizeProduct, RepoError } from '@/modules/repository/domain/repository'
import { assertVendorLicenseAuthority, commitVendorCommand, type VendorLicenseContext } from './license-command'
import type { VendorConfig } from '../vendor'

export const VENDOR_CONFIG_KEY = 'repository.vendor.v1'

export async function saveVendorConfig(input: Record<string, unknown>, context?: VendorLicenseContext): Promise<VendorConfig> {
  const next: VendorConfig = { enabled: input.enabled === true, name: String(input.name ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 80) }
  try {
    return await updateJsonSetting(VENDOR_CONFIG_KEY, async (value, tx) => {
      const actor = context ? await assertVendorLicenseAuthority(context, tx) : undefined
      Object.assign(value, next)
      if (Object.prototype.hasOwnProperty.call(input, 'archiveRecoveryEnabled')) value.archiveRecoveryEnabled = input.archiveRecoveryEnabled === true
      const saved = { ...next, archiveRecoveryEnabled: value.archiveRecoveryEnabled === true }
      if (context && actor) await auditAdminStrict({ req: context.req, actor, action: 'repository.settings', targetType: 'repository', targetId: 'vendor', metadata: { enabled: next.enabled, archiveRecoveryEnabled: saved.archiveRecoveryEnabled } }, tx)
      return saved
    })
  } catch (error) {
    if (error instanceof JsonSettingMutationError) throw new RepoError('تنظیمات مخزن معتبر نیست یا هم‌زمان تغییر کرده است؛ دوباره بررسی کنید', 409)
    throw error
  }
}

export async function saveProduct(input: Record<string, unknown>, id?: number, context?: VendorLicenseContext) {
  const data = normalizeProduct(input)
  try {
    return await commitVendorCommand(context, async tx => {
      if (id) {
        const current = await tx.repoProduct.findUnique({ where: { id } })
        if (!current) throw new RepoError('محصول پیدا نشد', 404)
        return tx.repoProduct.update({ where: { id }, data: { ...data, slug: current.slug, kind: current.kind } })
      }
      return tx.repoProduct.create({ data })
    }, saved => ({ action: 'product.save', targetId: saved.id, metadata: { slug: saved.slug } }))
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw new RepoError('این شناسه قبلاً ثبت شده است', 409)
    throw error
  }
}

export async function setReleasePublished(id: number, published: boolean, context?: VendorLicenseContext) {
  await commitVendorCommand(context, async tx => {
    const current = await tx.repoRelease.findUnique({ where: { id } })
    if (current && current.storageState !== 'READY') throw new RepoError('نسخه هنوز آمادهٔ انتشار نیست', 409)
    await tx.repoRelease.update({ where: { id }, data: { published } })
  }, () => ({ action: 'release.publish', targetId: id, metadata: { published } }))
}
