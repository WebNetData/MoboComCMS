export type Definition = { key: string; label: string; labelEn?: string; description?: string; type: 'text' | 'textarea' | 'boolean' | 'number' | 'select' | 'secret'; default?: string | number | boolean; options?: { label: string; value: string }[] }
export type Section = {
  id: string; name: string; nameEn: string; defaultName: string; defaultNameEn: string; customName: { fa: string; en: string }; description: string; icon: string; version: string; enabled: boolean
  settings: Record<string, unknown>; definitions: Definition[]
  menu: { title?: string; items: { href: string; label: string; icon?: string }[] }
  bases: { base: string; alias: string }[]
}
