/** UI invalidation only; list ownership and authorization remain on the server. */
export const MEMBER_LISTS_CHANGED = 'mobocom:member-lists-changed'
export const MEMBER_LISTS_STORAGE = 'mobocom:member-lists-revision'
export function memberListsChanged(item: string) {
  window.dispatchEvent(new CustomEvent(MEMBER_LISTS_CHANGED, { detail: { item } }))
  // Invalidate other tabs; never persist member data, private prompt text or credentials here.
  try { window.localStorage.setItem(MEMBER_LISTS_STORAGE, `${Date.now()}:${Math.random()}`) } catch { /* Storage can be disabled; focus still refreshes from the server. */ }
}
