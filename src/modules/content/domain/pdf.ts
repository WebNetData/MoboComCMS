export const PDF_KINDS = { post: 'مجله و مقاله', page: 'صفحه', product: 'محصول', movie: 'فیلم', series: 'سریال', game: 'بازی', software: 'نرم‌افزار', track: 'تک‌آهنگ', album: 'آلبوم', playlist: 'پلی‌لیست', thread: 'پست تالار', prompt: 'الگوی پرامپت', profile: 'پروفایل عمومی', business: 'کسب‌وکار' } as const
export type PdfKind = keyof typeof PDF_KINDS
export const PDF_DESIGNS = {
  editorial: { name: 'فصل‌نامه', note: 'تیتر درشت، ستون تحریریه و تصویر عریض', color: '#5138a5', deep: '#241b46', layout: 'editorial' },
  catalogue: { name: 'ویترین', note: 'تصویر محصول، کارت مشخصات و چیدمان کاتالوگ', color: '#087e77', deep: '#083d3c', layout: 'catalogue' },
  cinema: { name: 'پردهٔ نقره‌ای', note: 'پوستر سینمایی، کاور تیره و اطلاعات اثر', color: '#b87925', deep: '#14212c', layout: 'cinema' },
  serial: { name: 'روایت', note: 'پروندهٔ سریال با فصل‌بندی و ریتم روایی', color: '#8051af', deep: '#302345', layout: 'serial' },
  sound: { name: 'ضرب‌آهنگ', note: 'کاور مربع، خطوط صوتی و هویت موزیک', color: '#ac3566', deep: '#3b1730', layout: 'sound' },
  arena: { name: 'آرنا', note: 'هندسهٔ جسور، قاب بازی و اطلاعات پلتفرم', color: '#2364bd', deep: '#122840', layout: 'arena' },
  technical: { name: 'داده‌نما', note: 'شبکهٔ فنی، شماره‌گذاری و جدول مشخصات', color: '#166a94', deep: '#123344', layout: 'technical' },
  minimal: { name: 'سپید', note: 'تایپوگرافی آرام و فضای خالی برای مطالعه', color: '#47605d', deep: '#223b37', layout: 'minimal' },
} as const
export type PdfDesign = keyof typeof PDF_DESIGNS
const DEFAULTS: Record<PdfKind, PdfDesign> = { post:'editorial', page:'minimal', product:'catalogue', movie:'cinema', series:'serial', game:'arena', software:'technical', track:'sound', album:'sound', playlist:'sound', thread:'editorial', prompt:'technical', profile:'minimal', business:'catalogue' }
export type PdfSettings = {
  enabled: boolean; assignments: Record<PdfKind, { enabled: boolean; design: PdfDesign }>
  brand: string; footer: string; paper: 'A4'|'LETTER'; fontSize: number; includeImages: boolean; includeQr: boolean
  watermarkEnabled: boolean; watermarkKind: 'text'|'image'; watermarkText: string; watermarkImage: string
  watermarkOpacity: number; watermarkSize: number; watermarkAngle: number; watermarkPosition: 'center'|'tile'|'bottom'; watermarkColor: string
}
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown, fallback: string, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max) : fallback
const int = (v: unknown, lo: number, hi: number, fallback: number) => v !== undefined && Number.isFinite(Number(v)) ? Math.min(hi,Math.max(lo,Math.round(Number(v)))) : fallback
function watermarkImage(raw:unknown){
  if(typeof raw!=='string'||raw.length>800)return ''
  if(/^\/api\/media\/covers\/[a-f0-9-]{36}\.(webp|png|jpg)$/.test(raw))return raw
  if(!/^\/files\/(uploads|download)\//.test(raw)||/[?#]/.test(raw))return ''
  try{return raw.split('/').slice(2).every(s=>{const d=decodeURIComponent(s);return d&&!d.startsWith('.')&&!/[\/\\\u0000-\u001f]/.test(d)})?raw:''}catch{return ''}
}
export function normalizePdfSettings(raw: unknown): PdfSettings {
  const r=object(raw), choices=object(r.assignments)
  return {
    enabled:r.enabled!==false,
    assignments:Object.fromEntries(Object.keys(PDF_KINDS).map(key=>{const v=object(choices[key]);return [key,{enabled:v.enabled!==false,design:Object.hasOwn(PDF_DESIGNS,String(v.design))?v.design:DEFAULTS[key as PdfKind]}]})) as PdfSettings['assignments'],
    brand:text(r.brand,'موبوکام',100),footer:text(r.footer,'نسخهٔ مطالعه و بایگانی؛ تازه‌ترین اطلاعات در سایت موبوکام',240),paper:r.paper==='LETTER'?'LETTER':'A4',fontSize:int(r.fontSize,9,13,11),includeImages:r.includeImages!==false,includeQr:r.includeQr!==false,
    watermarkEnabled:r.watermarkEnabled!==false,watermarkKind:r.watermarkKind==='image'?'image':'text',watermarkText:text(r.watermarkText,'موبوکام | Mobocom.net',90)||'موبوکام | Mobocom.net',watermarkImage:watermarkImage(r.watermarkImage),
    watermarkOpacity:int(r.watermarkOpacity,3,35,9),watermarkSize:int(r.watermarkSize,12,72,38),watermarkAngle:int(r.watermarkAngle,-60,60,-30),watermarkPosition:r.watermarkPosition==='tile'||r.watermarkPosition==='bottom'?r.watermarkPosition:'center',watermarkColor:/^#[\da-f]{6}$/i.test(String(r.watermarkColor))?String(r.watermarkColor):'#64748b',
  }
}
export const DEFAULT_PDF_SETTINGS=normalizePdfSettings({})
export class PdfError extends Error { constructor(message: string, readonly status=400){super(message)} }
export type PdfRef = { type: string; id: number }
const TYPES = new Set(['post','page','product','title','game','software','track','album','playlist','thread','forum-post','prompt','artist','person','studio','business'])
export function pdfRef(key: string): PdfRef | null {
  const m=/^([a-z-]+):([1-9]\d{0,9})$/.exec(key)
  return m && TYPES.has(m[1]) && Number.isSafeInteger(Number(m[2])) ? {type:m[1],id:Number(m[2])}:null
}
export function pdfKind(type: string): PdfKind | null {
  if(type==='title')return 'movie'
  if(type==='forum-post')return 'thread'
  if(['artist','person','studio'].includes(type))return 'profile'
  return Object.hasOwn(PDF_KINDS,type)?type as PdfKind:null
}
export type PdfContent = { ref: PdfRef; kind: PdfKind; title: string; subtitle: string; summary: string; html: string; image: string; url: string; updatedAt: Date; author: string; facts: [string,string][] }
export function pdfLink(raw: string, base: string): string {
  try { const u=new URL(raw,base);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!/^\/(api|dl)\//.test(u.pathname)?u.toString():'' }catch{return ''}
}
