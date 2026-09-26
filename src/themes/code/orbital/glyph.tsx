const paths: Record<string, React.ReactNode> = {
  infinity: <path d="M12 12c-3-7-10-7-10 0s7 7 10 0 10-7 10 0-7 7-10 0Z"/>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  router: <><rect x="2" y="11" width="20" height="9" rx="2"/><path d="M6 11V4m12 7V4M6 16h.01M10 16h.01m4 0h4"/></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></>,
  windows: <path d="m3 5 8-1v7H3V5Zm10-1 8-1v8h-8V4ZM3 13h8v7l-8-1v-6Zm10 0h8v8l-8-1v-7Z" fill="currentColor" stroke="none"/>,
  android: <><path d="M5 10a7 7 0 0 1 14 0v7H5v-7Zm0 0h14M8 4 6 1m10 3 2-3M8 17v4m8-4v4M2 10v7m20-7v7"/><path d="M9 7h.01M15 7h.01"/></>,
  apple: <><path d="M14 6c1-3 4-4 4-4 0 3-2 5-4 4ZM12 7C5 3 1 10 5 17c3 6 4 3 7 3s4 3 7-3c-4-2-4-6 0-8-3-4-5-2-7-2Z" fill="currentColor" stroke="none"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 1h4"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  arrow: <><path d="M19 12H5m6-6-6 6 6 6"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>,
  devices: <><rect x="3" y="4" width="13" height="12" rx="2"/><path d="M9 16v4H5m4 0h4"/><rect x="16" y="10" width="5" height="10" rx="1"/></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 8V5l14-2v3m4 5h-6v5h6"/><path d="M17 13.5h.01"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H3l1.8-4.5A9 9 0 1 1 21 11ZM8 10h8m-8 4h5"/>,
  sliders: <><path d="M4 7h4m4 0h8M4 17h10m4 0h2"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
}

export default function Glyph({ name = 'shield', size = 22, className = '' }: { name?: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name] || paths.shield}
    </svg>
  )
}
