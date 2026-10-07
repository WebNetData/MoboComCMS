// What the rest of the code imports. The parts live in ./panels/, one file per concern.
export type { ProvisionInput, PanelGroup, PanelUser, SubFormat, SubContent, PanelDevice, PanelAdapter } from '@/modules/providers/server/panels/contract'
export { RemnaWaveAdapter } from '@/modules/providers/server/panels/remnawave'
export { PasarGuardAdapter } from '@/modules/providers/server/panels/pasarguard'
export { registerPanelAdapter, panelConfigJson, getPanelAdapter } from '@/modules/providers/server/panels/registry'
export type { PanelConfig, PanelAdapterFactory } from '@/modules/providers/server/panels/registry'
