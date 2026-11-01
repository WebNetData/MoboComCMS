import { InstallError } from '../domain/installer'
import { closeInstallationListener, configureInstallationNetwork, hostSetupEnabled, installationNetworkState } from '@/modules/server-panel/installation'
import { exclusive } from './operation'
import { installMode } from './state'

export { hostSetupEnabled }
export async function networkStatus() {
  return hostSetupEnabled() && await installMode(true) === 'needs-admin' ? installationNetworkState() : { enabled: hostSetupEnabled(), ready: false }
}

export async function configureNetwork(input: Record<string, unknown>) {
  return exclusive(async () => {
    if (await installMode(true) !== 'needs-admin') throw new InstallError('جدول‌ها باید آماده باشند و نصب قبلی وجود نداشته باشد', 409)
    return configureInstallationNetwork(input)
  })
}

export async function requireConfiguredNetwork(siteUrl: string) {
  if (!hostSetupEnabled()) return
  const state = await installationNetworkState()
  if (!state.enabled || !state.ready || state.siteUrl !== siteUrl) throw new InstallError('ابتدا دامنه و SSL را در مرحلهٔ وب سرور کامل کنید', 409)
}

export const finishHostSetup = closeInstallationListener
