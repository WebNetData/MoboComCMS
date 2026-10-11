import { cache } from 'react'
import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'
import { extensionCatalog } from '@/extensions/generated/catalog'
import { getExtensionState, getPublicExtensionRuntime } from '@/extensions/server/state'

/**
 * Feature modules (VPN, store, journal, page builder …) ship with Core and are
 * switched on/off in the Extension Manager. Core code asks these helpers before
 * rendering or serving a module's features.
 */
export const getModuleStates = cache(async (): Promise<Record<string, boolean>> => {
  const runtime = await getPublicExtensionRuntime().catch(() => null)
  return Object.fromEntries(extensionCatalog.filter((m) => m.kind === 'module').map((m) => [m.id, runtime?.[m.id]?.enabled === true]))
})

export async function isModuleEnabled(id: string): Promise<boolean> {
  const states = await getModuleStates()
  return states[id] !== false
}

/** Pages: 404 while the module is off (admins previewing still see a 404 — enable it first). */
export async function requireModule(id: string): Promise<void> {
  if (!await isModuleEnabled(id)) notFound()
}

/** API routes: returns a 404 response while the module is off, otherwise null. */
export async function moduleGuard(id: string): Promise<NextResponse | null> {
  return await isModuleEnabled(id) ? null : NextResponse.json({ error: 'This feature is disabled', module: id }, { status: 404 })
}

/** API route files: the handler answers only while the module is on (404 otherwise). */
export function whenModuleOn<A extends unknown[]>(id: string, handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A): Promise<Response> => (await moduleGuard(id)) ?? handler(...args)
}

/** Admin paths owned by disabled modules (hidden from the admin menu). */
export async function disabledAdminPaths(): Promise<string[]> {
  const states = await getModuleStates()
  return extensionCatalog.filter((m) => m.kind === 'module' && states[m.id] === false).flatMap((m) => [...(m.adminPaths || [])])
}

/** A module's runtime setting (server only; secrets included). */
export const getModuleSettings = cache(async (id: string): Promise<Record<string, unknown>> => {
  try { return (await getExtensionState(id)).settings } catch { return {} }
})
