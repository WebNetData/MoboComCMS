export type ExtensionSettingDefinition = {
  key: string; label: string; labelEn?: string; description?: string; descriptionEn?: string
  type: string; options?: { label: string; value: string }[]
}
export type ExtensionManifest = {
  id: string; name: string; nameEn?: string; description?: string; descriptionEn?: string
  version: string; kind: string; capabilities?: string[]; settings?: ExtensionSettingDefinition[]
  adminNavigation?: { href: string; label: string; labelEn?: string }[]
  requires?: string[]; publicPaths?: string[]; adminPaths?: string[]; category?: string; icon?: string
}
export type ExtensionRow = {
  manifest: ExtensionManifest
  state: { enabled: boolean; requestedEnabled?: boolean; blockedBy?: string[]; unavailable?: boolean; compatibilityError?: string | null; settings: Record<string, unknown> }
}
