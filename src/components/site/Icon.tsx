const paths: Record<string, React.ReactNode> = {
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  arrow: <><path d="M19 12H5m6-6-6 6 6 6"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>,
  devices: <><rect x="3" y="4" width="13" height="12" rx="2"/><path d="M9 16v4H5m4 0h4"/><rect x="16" y="10" width="5" height="10" rx="1"/></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 8V5l14-2v3m4 5h-6v5h6"/><path d="M17 13.5h.01"/></>,
  chat: <path d="M21 11a9 9 0 0 1-9 9H3l1.8-4.5A9 9 0 1 1 21 11ZM8 10h8m-8 4h5"/>,
  sliders: <><path d="M4 7h4m4 0h8M4 17h10m4 0h2"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>,
  sparkles: <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2ZM19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 22 9.7C22 5.9 17.5 3 12 3Z"/><path d="M7.5 11h.01M10 7h.01M15 7h.01"/></>,
  code: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></>,
}
export default function Icon({ name = 'shield', size = 22, className = '' }: { name?: string; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name] || paths.shield}</svg>
}
