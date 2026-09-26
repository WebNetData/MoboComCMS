import { extensionPermissionIds } from '@/extensions/generated/catalog'

// Core capabilities. Extensions may append namespaced capabilities through their manifest.
export const PERMISSIONS = [
  'dashboard.view',
  'users.manage',
  'subs.manage',
  'orders.manage',
  'finance.manage',
  'invoices.manage',
  'gateways.manage',
  'plans.manage',
  'panels.manage',
  'tickets.handle',
  'tickets.departments.manage',
  'settings.manage',
  'cms.pages',
  'cms.posts',
  'cms.products',
  'roles.manage',
  'resellers.manage',
  'audit.view',
] as const

export type CorePermission = (typeof PERMISSIONS)[number]
export type Permission = string
export const ALL_PERMISSIONS: readonly string[] = [...PERMISSIONS, ...extensionPermissionIds]

export const ROLE_PRESETS: Record<string, string[]> = {
  admin: [...ALL_PERMISSIONS],
  accountant: ['dashboard.view', 'finance.manage', 'invoices.manage', 'orders.manage'],
  support: ['dashboard.view', 'users.manage', 'subs.manage', 'orders.manage', 'invoices.manage', 'tickets.handle'],
  reseller: ['dashboard.view', 'subs.manage'],
  backup: ['dashboard.view', 'cms.pages', 'cms.posts', 'cms.products', 'settings.manage'],
}

export function parsePermissions(csv: string): string[] {
  const known = new Set(ALL_PERMISSIONS)
  return csv.split(',').map((s) => s.trim()).filter((s) => known.has(s))
}

export function hasPermission(permissions: readonly string[] | undefined, needed: string): boolean {
  return Boolean(permissions?.includes(needed))
}
