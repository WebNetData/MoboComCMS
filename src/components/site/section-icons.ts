/** A section's icon when its menu link has none, from the first part of its address (as the header picks them). */
const SECTION_ICONS: Record<string, string> = { prompts: 'sparkles', products: 'bag', shop: 'bag', blog: 'book', journal: 'book', music: 'music', cinema: 'film', games: 'gamepad', software: 'devices', forum: 'chat', celebrities: 'users', people: 'users', businesses: 'star', vip: 'crown', plans: 'globe', dashboard: 'user', p: 'file' }

export const sectionIcon = (href: string, icon?: string) => icon || SECTION_ICONS[href.split(/[/?#]/).filter(Boolean)[0] || ''] || (href === '/' ? 'home' : 'sparkles')
