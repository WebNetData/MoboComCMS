/** UI invalidation only; list ownership and authorization remain on the server. */
export const MEMBER_LISTS_CHANGED = 'mobocom:member-lists-changed'
export const memberListsChanged = (item: string) => window.dispatchEvent(new CustomEvent(MEMBER_LISTS_CHANGED, { detail: { item } }))
