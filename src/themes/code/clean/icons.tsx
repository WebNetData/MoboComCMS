const paths: Record<string, React.ReactNode> = {
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  arrow: <path d="M19 12H5m6-6-6 6 6 6"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 9V6.5L16 4v2M21 11h-5v4h5"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H3l1.8-4.5A9 9 0 1 1 21 11Z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  devices: <><rect x="3" y="4" width="13" height="11" rx="2"/><path d="M7 19h5"/><rect x="17" y="9" width="4" height="11" rx="1"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4.5 4.5L19 7"/>,
  send: <path d="m21 3-9.5 18-2.5-8-8-2.5L21 3Z"/>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 21h4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  windows: <path d="m3 5 8-1v7H3V5Zm10-1 8-1v8h-8V4ZM3 13h8v7l-8-1v-6Zm10 0h8v8l-8-1v-7Z" fill="currentColor" stroke="none"/>,
  android: <><path d="M5 11a7 7 0 0 1 14 0v6H5v-6ZM8 5 6.5 2.5M16 5l1.5-2.5"/><path d="M9.5 8h.01M14.5 8h.01"/></>,
  apple: <path d="M15 5c.8-1.8 2.5-2.5 2.5-2.5.2 2-1.2 3.7-2.5 2.5ZM12 7.5C6 4.5 2.5 10 5.5 16.5 8 22 9.5 20 12 20s4 2 6.5-3.5c-3.5-1.8-3.5-6 0-7.5-2.8-3.3-5-1.5-6.5-1.5Z" fill="currentColor" stroke="none"/>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m5 1h5"/></>,
  sliders: <><path d="M4 7h4m4 0h8M4 17h10m4 0h2"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
}

/** Icon names in admin-edited sections are free text; unknown names fall back to the shield. */
export default function CleanIcon({ name = 'shield', size = 22 }: { name?: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={name === 'arrow' ? 'cl-arrow' : undefined} aria-hidden="true">{paths[name] || paths.shield}</svg>
}
