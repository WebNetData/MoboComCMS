import { useId } from 'react';

export default function CampaignArtwork({ variant }: { variant: 'campaign' | 'ticket' | 'membership' }) {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;

  return (
    <svg viewBox="0 0 400 500" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-red`} x1="84" y1="229" x2="308" y2="403" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F34A4B" /><stop offset=".53" stopColor="#C9162C" /><stop offset="1" stopColor="#790C20" />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="141" y1="205" x2="223" y2="422" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9D90" /><stop offset=".35" stopColor="#F33B47" /><stop offset=".7" stopColor="#AA102B" /><stop offset="1" stopColor="#F66362" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="112" y1="100" x2="292" y2="277" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0B5" /><stop offset=".4" stopColor="#F8C866" /><stop offset="1" stopColor="#C3812F" />
        </linearGradient>
        <linearGradient id={`${id}-blue`} x1="72" y1="128" x2="319" y2="362" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A7F4F3" /><stop offset=".42" stopColor="#41C8E5" /><stop offset="1" stopColor="#1264AC" />
        </linearGradient>
        <linearGradient id={`${id}-dark`} x1="93" y1="144" x2="304" y2="341" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3A3D43" /><stop offset=".45" stopColor="#16191E" /><stop offset="1" stopColor="#07090C" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}><stop stopColor={variant === 'ticket' ? '#59DDF1' : variant === 'membership' ? '#E6C57C' : '#FF9B85'} stopOpacity=".38" /><stop offset="1" stopColor={variant === 'ticket' ? '#59DDF1' : variant === 'membership' ? '#E6C57C' : '#FF9B85'} stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="200" cy="257" rx="186" ry="210" fill={paint('halo')} />

      {variant === 'campaign' && <g>
        <ellipse cx="202" cy="415" rx="130" ry="20" fill="#6D1020" opacity=".16" />
        <path d="M108 248 194 219 309 250 224 284Z" fill="#7E1024" />
        <path d="M109 249 224 282 224 400 109 366Z" fill={paint('red')} />
        <path d="M224 282 309 250 309 365 224 400Z" fill="#9B1025" />
        <path d="M154 262 181 270 181 387 154 379Z" fill={paint('ribbon')} />
        <path d="M250 272 272 264 272 380 250 388Z" fill="#E83A42" />
        <path d="M113 248 195 221 305 251 224 279Z" fill="#5F0A1D" />
        <g transform="rotate(-13 201 191)">
          <path d="M142 112H262V146C250 146 250 164 262 164V237H142V164C154 164 154 146 142 146Z" fill="#AE752F" />
          <path d="M136 105H256V139C244 139 244 157 256 157V230H136V157C148 157 148 139 136 139Z" fill={paint('gold')} />
          <path d="M151 122H241V213H151Z" stroke="#FFF5CF" strokeOpacity=".65" strokeWidth="2" />
          <text x="196" y="188" textAnchor="middle" fill="#9E5B20" fontFamily="sans-serif" fontSize="61" fontWeight="700">%</text>
        </g>
        <path d="M67 204 174 174 264 196 157 228Z" fill="#FD6A64" />
        <path d="M67 204 157 228 157 250 67 225Z" fill="#B71B31" />
        <path d="M157 228 264 196 264 217 157 250Z" fill="#8C1129" />
        <path d="M103 194 128 187 219 209 194 216Z" fill="#FFD0B3" opacity=".72" />
        <path d="M139 185C108 168 116 141 132 144 148 147 159 169 166 185 166 158 177 136 191 142 204 149 189 173 173 188Z" fill={paint('ribbon')} stroke="#A20E27" strokeWidth="3" />
        <path d="M156 184C147 170 137 158 129 155M174 184C183 169 188 158 188 152" stroke="#FFB6A1" strokeWidth="3" strokeLinecap="round" />
        <circle cx="166" cy="188" r="10" fill="#D92A3B" stroke="#FF8E80" strokeWidth="2" />
        <path d="M80 118v20M70 128h20M311 161v18M302 170h18" stroke="#F3BE79" strokeWidth="3" strokeLinecap="round" />
        <circle cx="304" cy="104" r="4" fill="#F4C57D" /><circle cx="69" cy="301" r="3" fill="#E86364" />
      </g>}

      {variant === 'ticket' && <g>
        <ellipse cx="202" cy="404" rx="130" ry="18" fill="#075C91" opacity=".14" />
        <circle cx="200" cy="244" r="151" fill="#56D6E8" opacity=".13" stroke="#49C4DE" strokeWidth="2" />
        <circle cx="200" cy="244" r="130" stroke="#74E2ED" strokeWidth="2" strokeDasharray="3 10" />
        <g transform="rotate(-14 200 245)">
          <path d="M78 170H322V217C300 217 300 249 322 249V327H78V249C100 249 100 217 78 217Z" fill="#075A98" />
          <path d="M78 158H322V205C300 205 300 237 322 237V315H78V237C100 237 100 205 78 205Z" fill={paint('blue')} />
          <path d="M96 178H304M96 295H304" stroke="#D6FFFF" strokeOpacity=".6" strokeWidth="2" />
          <path d="M246 182V292" stroke="#E4FFFF" strokeWidth="2" strokeDasharray="5 7" opacity=".8" />
          <circle cx="165" cy="236" r="45" fill="#E9FFFF" opacity=".9" />
          <circle cx="165" cy="236" r="35" stroke="#43B8D3" strokeWidth="2" />
          <path d="m146 236 13 13 27-29" stroke="#1387AD" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M266 207h20M266 220h20M266 233h20M266 246h20M266 259h20" stroke="#E7FFFF" strokeWidth="3" strokeLinecap="round" opacity=".85" />
        </g>
        <circle cx="93" cy="128" r="11" stroke="#70DCE9" strokeWidth="3" /><circle cx="319" cy="346" r="7" stroke="#70DCE9" strokeWidth="3" />
        <path d="M309 108v22M298 119h22M67 329v16M59 337h16" stroke="#47BBD5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="339" cy="208" r="4" fill="#50CFE0" /><circle cx="61" cy="226" r="4" fill="#50CFE0" />
      </g>}

      {variant === 'membership' && <g>
        <ellipse cx="201" cy="397" rx="132" ry="18" fill="#3D3019" opacity=".17" />
        <ellipse cx="200" cy="240" rx="157" ry="89" transform="rotate(-35 200 240)" stroke="#D6B46D" strokeWidth="2" opacity=".65" />
        <ellipse cx="200" cy="240" rx="139" ry="168" transform="rotate(31 200 240)" stroke="#D6B46D" strokeWidth="1.5" opacity=".35" />
        <g transform="rotate(-12 200 244)">
          <rect x="69" y="167" width="270" height="166" rx="16" fill="#8E7141" />
          <rect x="64" y="157" width="270" height="166" rx="16" fill={paint('dark')} stroke="#C7A461" strokeWidth="2" />
          <rect x="77" y="170" width="244" height="140" rx="9" stroke="#D9BD7B" strokeOpacity=".42" />
          <path d="M238 170c-7 33 14 63 83 76M251 170c-6 27 15 48 70 58M264 170c-3 20 15 34 57 41" stroke="#D7B875" strokeOpacity=".4" />
          <circle cx="139" cy="227" r="32" stroke="#EAD397" strokeWidth="2" />
          <circle cx="139" cy="227" r="25" stroke="#C7A461" strokeWidth="1" />
          <path d="m139 207 5.2 13.8 14.8.7-11.5 9.3 3.8 14.2-12.3-8.4-12.3 8.4 3.8-14.2-11.5-9.3 14.8-.7Z" fill={paint('gold')} />
          <path d="M100 283h78M100 291h49" stroke="#E3C985" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          <rect x="264" y="265" width="36" height="25" rx="5" fill={paint('gold')} />
          <path d="M276 265v25M288 265v25M264 277h36" stroke="#9C753D" strokeWidth="1" />
        </g>
        <path d="M85 121v24M73 133h24M316 339v20M306 349h20" stroke="#D6B46D" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="319" cy="147" r="5" fill="#E4CA8C" /><circle cx="76" cy="315" r="4" fill="#D6B46D" /><circle cx="270" cy="96" r="3" fill="#D6B46D" />
      </g>}
    </svg>
  );
}
