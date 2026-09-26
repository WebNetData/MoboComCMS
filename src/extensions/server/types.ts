import type { NextRequest, NextResponse } from 'next/server'
import type { ExtensionStorage } from '@/extensions/sdk/server'

export type ExtensionApiAccess = 'public' | 'authenticated' | `permission:${string}`

export interface ExtensionActor {
  id: number
  email: string
  role: string
  permissions: readonly string[] | null
}

export interface ExtensionServerContext {
  pluginId: string
  storage: ExtensionStorage
  enqueueJob: (jobName: string, payload?: Record<string, unknown>, dedupeKey?: string) => Promise<unknown>
}

export interface ExtensionApiContext extends ExtensionServerContext {
  path: readonly string[]
  actor: ExtensionActor | null
}

export interface ExtensionApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  access: ExtensionApiAccess
  handler: (request: NextRequest, context: ExtensionApiContext) => Promise<NextResponse> | NextResponse
}

export interface CoreExtensionEventMap {
  'user.created': { userId: number; email: string; role: string }
  'order.created': { orderId: number; userId: number; planId: number | null; productId: number | null; totalMinor: string; currency: string }
  'payment.completed': { invoiceId: number; orderId: number | null; userId: number; totalMinor: string; currency: string }
  'ticket.created': { ticketId: number; userId: number; priority: string }
  'fulfillment.completed': { jobId: number; kind: string; orderId: number | null; invoiceId: number | null; subscriptionId: number | null }
}

export type CoreExtensionEventName = keyof CoreExtensionEventMap
export type ExtensionEventHandler<TPayload = unknown> = (payload: TPayload, context: ExtensionServerContext) => Promise<void> | void
export type ExtensionJobHandler = (payload: Record<string, unknown>, context: ExtensionServerContext) => Promise<void> | void
export type ExtensionEventHandlers = { [K in CoreExtensionEventName]?: ExtensionEventHandler<CoreExtensionEventMap[K]> }

export interface PluginServerModule {
  api?: readonly ExtensionApiRoute[]
  events?: ExtensionEventHandlers
  jobs?: Readonly<Record<string, ExtensionJobHandler>>
  validateSettings?: (settings: Readonly<Record<string, unknown>>) => void
}
