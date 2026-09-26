import Icon from './Icon'
export default function NetworkGlobe({ count, label, brand }: { count: number; label: string; brand: string }) {
  return <div className="network-art" aria-hidden="true">
    <div className="orbital-ring ring-one"/><div className="orbital-ring ring-two"/>
    <svg className="globe-svg" viewBox="0 0 520 520" fill="none">
      <defs><radialGradient id="globeGlow"><stop stopColor="var(--primary)" stopOpacity=".14"/><stop offset="1" stopColor="var(--primary)" stopOpacity="0"/></radialGradient><clipPath id="globeClip"><circle cx="260" cy="260" r="191"/></clipPath><pattern id="globeDots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="var(--primary)" opacity=".6"/></pattern></defs>
      <circle cx="260" cy="260" r="253" fill="url(#globeGlow)"/>
      <g stroke="var(--primary)" opacity=".2"><circle cx="260" cy="260" r="191"/>{[50,100,145,178].map(r => <ellipse key={r} cx="260" cy="260" rx={r} ry="191"/>)}{[115,160,210,260,310,360,405].map(y => <path key={y} d={`M69 ${y} Q260 ${y+55} 451 ${y}`} clipPath="url(#globeClip)"/>)}</g>
      <g fill="url(#globeDots)" clipPath="url(#globeClip)"><path d="m106 145 45-26 35 5 33-23 40 17-7 27-28 2-3 27-35 18-13 36-31-9-13-32-30-2Zm71 103 31-2 33 24 4 37-17 40-16 51-22-11-3-42-18-31-13-40ZM281 128l49-24 44 14 27 27 41 8 11 42-32 8-28-8-29 25-34-4-10-27-36 4-16-22Zm-17 80 38-13 28 28 2 51-24 45-26-15-5-36-26-26Zm112 121 34-17 26 28-6 27-42 7-25-23Z"/></g>
      <g stroke="var(--primary)" strokeWidth="1.3"><path d="M184 192Q266 79 330 175" strokeDasharray="5 5"/><path d="M330 175Q414 236 405 345" strokeDasharray="5 5"/><path d="M184 192Q190 280 204 331" strokeDasharray="5 5"/><path d="M204 331Q292 323 330 175" opacity=".5"/></g>
      {[[184,192],[330,175],[405,345],[204,331],[296,244]].map(([x,y], i) => <g key={i}><circle cx={x} cy={y} r="12" fill="var(--primary)" opacity=".09"/><circle cx={x} cy={y} r="4" fill="var(--primary)"/><circle cx={x} cy={y} r="7" stroke="var(--primary)" opacity=".5"/></g>)}
    </svg>
    <div className="globe-tag tag-top"><span className="live-dot"/><span dir="ltr">{brand} / NETWORK</span><Icon name="globe" size={16}/></div>
    <div className="globe-center"><Icon size={35}/></div>
    <div className="globe-tag tag-bottom"><Icon name="globe"/><div><strong>{count.toLocaleString('fa-IR')}</strong><small>{label}</small></div><span className="signal-bars"><i/><i/><i/><i/></span></div>
    <span className="art-coordinate coord-one">35°41′ N / 51°25′ E</span><span className="art-coordinate coord-two">BEYOND BORDERS ↗</span>
  </div>
}
