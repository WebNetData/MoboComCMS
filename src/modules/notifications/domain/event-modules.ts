// Notification kinds that only make sense while an optional module is on. Settings pages and the
// member's preference list leave them out while it is off; sending and stored mutes are unaffected.

const OWNERS: Readonly<Record<string, string>> = {
  SUBSCRIPTION_EXPIRING: 'vpn', SUBSCRIPTION_EXPIRED: 'vpn', SUBSCRIPTION_READY: 'vpn', SUBSCRIPTION_RENEWED: 'vpn',
  MARKETPLACE: 'marketplace', MEMBERSHIP: 'membership', LIVECHAT: 'livechat', CONTENT_PURCHASE: 'paywall', ADS: 'ads', HOSTING: 'hosting',
  PRODUCT_PRICE_DROP: 'store',
  PRODUCT_DELIVERED: 'store', DELIVERY_DELAYED: 'store', STOCK_BACK: 'store', CART_REMINDER: 'store', GIFT_CARD: 'store', LOYALTY: 'store',
}

/** The module a notification kind belongs to, or null for kinds every site has. */
export function notificationModule(kind: string): string | null {
  if (kind.startsWith('FORUM_')) return 'forum'
  if (kind.startsWith('COMMUNITY_')) return 'community'
  return OWNERS[kind] || null
}

/** `states` maps module id to on/off; a module that is not listed counts as on. */
export const notificationOffered = (kind: string, states: Readonly<Record<string, boolean | undefined>>) => {
  const owner = notificationModule(kind)
  return !owner || states[owner] !== false
}
