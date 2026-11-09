import { cache } from 'react'
import { createSectionSettingsHistory } from '@/modules/settings/server'
import { normalizeLibrary, type ComponentLibrary } from '@/modules/site/domain/components'

export const COMPONENTS_KEY = 'site.components.v1'
const owner = () => createSectionSettingsHistory(COMPONENTS_KEY, 'settings-site-components', normalizeLibrary, (library: ComponentLibrary) => ({
  components: library.components.length, scripted: library.components.filter(c => c.js.trim()).length,
}), { action: 'site.components.settings', targetId: COMPONENTS_KEY })
export const getComponentLibrary = () => owner().read()
export const saveComponentLibrary = (...args: Parameters<ReturnType<typeof owner>['save']>) => owner().save(...args)
export const componentLibraryState = () => owner().current()
export const restoreComponentLibrary = (...args: Parameters<ReturnType<typeof owner>['restore']>) => owner().restore(...args)
/** For rendering: a broken stored library renders no components rather than failing the page. */
export const componentsForRender = cache(async () => { try { return new Map((await getComponentLibrary()).components.map(c => [c.id, c])) } catch { return new Map() } })
