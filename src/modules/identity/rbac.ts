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
  // Bulk import (upload, mapping, run, rollback); separate from settings.manage.
  'imports.manage',
  // Apply code packages and edit built-in plugin/theme source (full server trust).
  'extensions.code',
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
  // One part of the site each: the manager of a section gets that section and nothing else.
  'music-manager': ['dashboard.view', 'music.manage'],
  'cinema-manager': ['dashboard.view', 'cinema.manage'],
  'games-manager': ['dashboard.view', 'games.manage'],
  'software-manager': ['dashboard.view', 'software.manage'],
  'forum-manager': ['dashboard.view', 'forum.moderate'],
  'store-manager': ['dashboard.view', 'cms.products', 'orders.manage'],
  // cms.posts is the magazine's permission and also opens music, films, games, software and forum moderation.
  'content-editor': ['dashboard.view', 'cms.posts'],
}

/** What the role form calls each preset. */
export const ROLE_PRESET_LABELS: Record<string, string> = {
  admin: 'مدیر کل (همهٔ دسترسی‌ها)', accountant: 'حسابدار', support: 'پشتیبان', reseller: 'نماینده', backup: 'جانشین مدیر محتوا و تنظیمات',
  'music-manager': 'مدیر موزیک', 'cinema-manager': 'مدیر فیلم و سریال', 'games-manager': 'مدیر بازی', 'software-manager': 'مدیر نرم‌افزار',
  'forum-manager': 'مدیر تالار گفتمان', 'store-manager': 'مدیر فروشگاه (محصولات و سفارش‌ها)', 'content-editor': 'ویراستار محتوا (مجله و همهٔ بخش‌های محتوایی)',
}

/** Stored as the whole permission list: every capability, including ones plugins add later. */
export const FULL_ACCESS = '*'

/**
 * A role's capabilities. "*" — and, for roles saved before it existed, any
 * role holding every core permission (the admin preset) — means full access,
 * so permissions that extensions add later (e.g. server.manage) are included.
 */
export function parsePermissions(csv: string): string[] {
  const known = new Set(ALL_PERMISSIONS)
  const listed = csv.split(',').map((s) => s.trim())
  if (listed.includes(FULL_ACCESS) || PERMISSIONS.every((permission) => listed.includes(permission))) return [...ALL_PERMISSIONS]
  return listed.filter((s) => known.has(s))
}

export const isFullAccess = (csv: string) => {
  const listed = csv.split(',').map((s) => s.trim())
  return listed.includes(FULL_ACCESS) || PERMISSIONS.every((permission) => listed.includes(permission))
}

export function hasPermission(permissions: readonly string[] | undefined, needed: string): boolean {
  return Boolean(permissions?.includes(needed))
}
