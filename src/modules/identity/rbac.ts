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
  // Form answers: read them, take the work, write back, read a sender's password (recorded). Building forms stays with cms.pages.
  'forms.handle',
  // Automation rules: what happens by itself when something happens.
  'automation.manage',
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

/**
 * `cms.posts` is the magazine: posts, their categories and comments, the journal, post templates. Until
 * migration 20261203120000 it also opened these; roles that held it then were given them by that migration, so
 * nobody lost access when the two were told apart.
 */
export const FORMERLY_OPENED_BY_POSTS = ['music.manage', 'cinema.manage', 'games.manage', 'software.manage', 'forum.moderate', 'reviews.moderate'] as const

/** Permissions that let their holder edit some content, and so upload a picture for it. */
export const CONTENT_EDIT_PERMISSIONS = ['cms.posts', 'cms.pages', 'cms.products', 'music.manage', 'cinema.manage', 'games.manage', 'software.manage'] as const

export const ROLE_PRESETS: Record<string, string[]> = {
  admin: [...ALL_PERMISSIONS],
  accountant: ['dashboard.view', 'finance.manage', 'invoices.manage', 'orders.manage'],
  support: ['dashboard.view', 'users.manage', 'subs.manage', 'orders.manage', 'invoices.manage', 'tickets.handle'],
  reseller: ['dashboard.view', 'subs.manage'],
  backup: ['dashboard.view', 'cms.pages', 'cms.posts', 'cms.products', 'settings.manage', ...FORMERLY_OPENED_BY_POSTS],
  // One part of the site each: the manager of a section gets that section and nothing else.
  'music-manager': ['dashboard.view', 'music.manage'],
  'cinema-manager': ['dashboard.view', 'cinema.manage'],
  'games-manager': ['dashboard.view', 'games.manage'],
  'software-manager': ['dashboard.view', 'software.manage'],
  'forum-manager': ['dashboard.view', 'forum.moderate'],
  'store-manager': ['dashboard.view', 'cms.products', 'orders.manage'],
  'magazine-manager': ['dashboard.view', 'cms.posts'],
  // Every content section at once, for an editor-in-chief.
  'content-manager': ['dashboard.view', 'cms.posts', ...FORMERLY_OPENED_BY_POSTS],
}

/** What the role form calls each preset. */
export const ROLE_PRESET_LABELS: Record<string, string> = {
  admin: 'مدیر کل (همهٔ دسترسی‌ها)', accountant: 'حسابدار', support: 'پشتیبان', reseller: 'نماینده', backup: 'جانشین مدیر محتوا و تنظیمات',
  'music-manager': 'مدیر موزیک', 'cinema-manager': 'مدیر فیلم و سریال', 'games-manager': 'مدیر بازی', 'software-manager': 'مدیر نرم‌افزار',
  'forum-manager': 'مدیر تالار گفتمان', 'store-manager': 'مدیر فروشگاه (محصولات و سفارش‌ها)', 'magazine-manager': 'مدیر مجله (نوشته‌ها، دسته‌ها و دیدگاه‌ها)', 'content-manager': 'مدیر محتوا (مجله و همهٔ بخش‌های محتوایی)',
}

/** Stored as the whole permission list: every capability, including ones plugins add later. */
export const FULL_ACCESS = '*'

/**
 * Core permissions added after roles were first stored as a full list. A role saved before one of these existed
 * cannot hold it, and must still read as full access — so they are left out of the "holds every core permission"
 * test. **Every core permission added from now on goes in this list** (leaving one out takes the extension
 * permissions away from every general manager, which is what happened with `forms.handle` in October 2026).
 */
export const CORE_ADDED_LATER: readonly string[] = ['forms.handle', 'automation.manage']
const holdsEveryOriginal = (listed: string[]) => PERMISSIONS.filter((permission) => !CORE_ADDED_LATER.includes(permission)).every((permission) => listed.includes(permission))

/**
 * A role's capabilities. "*" — and, for roles saved before it existed, any
 * role holding every core permission (the admin preset) — means full access,
 * so permissions that extensions add later (e.g. server.manage) are included.
 */
export function parsePermissions(csv: string): string[] {
  const known = new Set(ALL_PERMISSIONS)
  const listed = csv.split(',').map((s) => s.trim())
  if (listed.includes(FULL_ACCESS) || holdsEveryOriginal(listed)) return [...ALL_PERMISSIONS]
  return listed.filter((s) => known.has(s))
}

export const isFullAccess = (csv: string) => {
  const listed = csv.split(',').map((s) => s.trim())
  return listed.includes(FULL_ACCESS) || holdsEveryOriginal(listed)
}

export function hasPermission(permissions: readonly string[] | undefined, needed: string): boolean {
  return Boolean(permissions?.includes(needed))
}
