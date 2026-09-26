import m0 from '@/plugins/announcement/manifest.json'
import m1 from '@/plugins/cinema/manifest.json'
import m2 from '@/plugins/games/manifest.json'
import m3 from '@/plugins/journal/manifest.json'
import m4 from '@/plugins/membership/manifest.json'
import m5 from '@/plugins/music/manifest.json'
import m6 from '@/plugins/operations-monitor/manifest.json'
import m7 from '@/plugins/page-builder/manifest.json'
import m8 from '@/plugins/remnawave-control/manifest.json'
import m9 from '@/plugins/store/manifest.json'
import m10 from '@/plugins/support-dock/manifest.json'
import m11 from '@/plugins/vpn/manifest.json'
import { assertUniqueExtensionIds, type ExtensionManifest } from '@/platform/extensions/contracts'

export const extensionCatalog = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] as unknown as readonly ExtensionManifest[]
assertUniqueExtensionIds(extensionCatalog)
export const extensionById = new Map(extensionCatalog.map((manifest) => [manifest.id, manifest]))
export const extensionPermissionIds = extensionCatalog.flatMap((manifest) => (manifest.permissions || []).map((permission) => permission.id))
