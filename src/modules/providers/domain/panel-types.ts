export const PANEL_TYPES = [
  { value: 'REMNAWAVE', label: 'Remnawave', icon: '🌊', groupMode: 'squads', password: false },
  { value: 'PASARGUARD', label: 'PasarGuard', icon: '🛡', groupMode: 'groups', password: true },
] as const

export type BuiltinPanelType = (typeof PANEL_TYPES)[number]['value']

export function isKnownPanelType(value: unknown): value is BuiltinPanelType {
  return PANEL_TYPES.some((item) => item.value === value)
}

export function panelTypeMeta(value: string) {
  return PANEL_TYPES.find((item) => item.value === value) || {
    value,
    label: value,
    icon: '🔌',
    groupMode: 'none' as const,
    password: false,
  }
}
