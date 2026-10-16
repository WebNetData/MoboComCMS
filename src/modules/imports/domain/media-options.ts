/** Absent belongs to a pre-library job; preserve its historical image-copy behavior. */
export function importMediaOptions(raw: Record<string, unknown>) {
  return {
    ...(raw.mediaPolicyVersion === 1 ? { mediaPolicyVersion: 1 } : {}),
    ...(typeof raw.copyAssets === 'boolean' ? { copyAssets: raw.copyAssets } : {}),
    mediaTransferMode: ['queued', 'scheduled'].includes(String(raw.mediaTransferMode)) ? String(raw.mediaTransferMode) : 'immediate',
    mediaTransferAt: typeof raw.mediaTransferAt === 'string' ? raw.mediaTransferAt.slice(0, 40) : '',
  }
}
export const copiesImages = (options: Record<string, unknown>) => options.copyAssets !== false
export const copiesFiles = (options: Record<string, unknown>) => options.copyAssets === true
