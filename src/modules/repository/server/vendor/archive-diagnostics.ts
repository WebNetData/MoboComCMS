import { db } from '@/platform/database/prisma'
import { repositoryArchiveIssues } from '@/modules/repository/server/vendor/archive-integrity.cjs'
import { assertVendorLicenseAuthority, type VendorLicenseContext } from './license-command'
import { RepoError } from '@/modules/repository/domain/repository'

type Options = Omit<NonNullable<Parameters<typeof repositoryArchiveIssues>[1]>, 'directory'>

/** Read-only observation, never authority to mutate files; current admission also checked after I/O. */
export async function inspectRepositoryArchives(options: Options, context: VendorLicenseContext) {
  const admit = () => db.$transaction(tx => assertVendorLicenseAuthority(context, tx))
  await admit()
  if ((options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500)) || (options.afterReleaseId !== undefined && (!Number.isSafeInteger(options.afterReleaseId) || options.afterReleaseId < 0 || options.afterReleaseId > 2147483647)) || (options.afterFileId && !/^[0-9a-f-]{36}\.zip$/.test(options.afterFileId))) throw new RepoError('نشانگر یا اندازهٔ بررسی فایل معتبر نیست', 400)
  const report = await repositoryArchiveIssues(db, options)
  await admit()
  return report
}
