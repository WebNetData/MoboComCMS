import { compareVersions, isSafeRef, isValidRepo, UpdateError } from '../domain/updater'
import { currentVersion, environment, checkForUpdate } from './service'
import { uploadPackage } from './packages'
import { githubAsset } from './network'

/** Download/admit only; the existing separate confirmed package command performs installation. */
export async function downloadGithubPackage(ref: unknown) {
  const host = environment()
  if (host.method !== 'package' || !isValidRepo(host.repo)) throw new UpdateError('دریافت بستهٔ امضاشده روی این نصب فعال نیست', 409)
  if (!isSafeRef(ref)) throw new UpdateError('نسخهٔ انتشار معتبر نیست')
  const check = await checkForUpdate(true)
  if (check.error) throw new UpdateError(check.error, 502)
  const release = check.releases.find(r => r.tag === ref && !r.prerelease)
  if (!release || compareVersions(release.version, currentVersion()) <= 0) throw new UpdateError('انتشار پایدار جدیدتری پیدا نشد', 409)
  try {
    const response = await githubAsset(`https://github.com/${host.repo}/releases/download/${encodeURIComponent(release.tag)}/mobocom-${release.version}.mbrelease`, AbortSignal.timeout(300_000))
    return await uploadPackage(new Request('https://release.invalid/package', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(response.headers.has('content-length') ? { 'Content-Length': response.headers.get('content-length')! } : {}) }, body: response.body, duplex: 'half' } as RequestInit), release.version)
  } catch (error) {
    if (error instanceof UpdateError) throw error
    throw new UpdateError('دریافت بسته از GitHub کامل نشد؛ مسیر «به‌روزرسانی» در پروکسی یا بارگذاری دستی mbrelease را بررسی کنید', 502)
  }
}
