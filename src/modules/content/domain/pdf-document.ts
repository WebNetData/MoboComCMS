import sanitizeHtml from 'sanitize-html'
import { richTextToPlain } from '@/shared/content/sanitize'
import { PdfError, pdfLink } from './pdf'

export type PdfBlock = { kind:'paragraph'|'heading'|'quote'|'list'|'code'; text:string; level?:number; link?:string } | {kind:'image';src:string;alt:string} | {kind:'table';rows:string[][]} | {kind:'rule'}
/** A safe semantic projection; no browser engine, script execution or editor serialization. */
export function pdfDocument(html: string, base: string): PdfBlock[] {
  if(html.length>1_500_000)throw new PdfError('این مطلب برای یک فایل PDF بیش از حد طولانی است',413)
  const safe=sanitizeHtml(html,{allowedTags:['p','div','section','article','span','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','br','hr','table','thead','tbody','tr','td','th','img','figure','figcaption','a','b','strong','i','em','video','audio'],nonTextTags:['script','style','textarea','option','iframe','object'],allowedAttributes:{img:['src','alt'],a:['href'],video:['src'],audio:['src']},allowedSchemes:['https','http'],allowProtocolRelative:true})
  const out:PdfBlock[]=[], tokens=safe.match(/<[^>]+>|[^<]+/g)||[]
  let text='',kind:'paragraph'|'heading'|'quote'|'list'|'code'='paragraph',level=2,table:string[][]|null=null,row:string[]=[],cell='',inCell=false,code=false
  const plain=(s:string)=>richTextToPlain(s,1_000_000).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_m,key:string)=>{if(key.startsWith('#')){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):''}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[key.toLowerCase()]||''})
  const flush=()=>{if(text.trim()){out.push({kind,text:plain(text),...(kind==='heading'?{level}:{})});text=''}}
  const attribute=(tag:string,name:string)=>plain(new RegExp('\\b'+name+'="([^"]*)"','i').exec(tag)?.[1]||'')
  for(const token of tokens){
    if(!token.startsWith('<')){if(inCell)cell+=token;else text+=token;continue}
    const tag=/^<\/?([a-z0-9]+)/i.exec(token)?.[1].toLowerCase()||'',close=token.startsWith('</')
    if(tag==='table'){flush();if(close){if(table?.length)out.push({kind:'table',rows:table});table=null}else table=[];continue}
    if(table){if(tag==='tr'){if(close){table.push(row);row=[]}else row=[]}if(['td','th'].includes(tag)){if(close){row.push(plain(cell));cell='';inCell=false}else{cell='';inCell=true}}if(tag==='br')cell+=' ';continue}
    if(tag==='img'&&!close){flush();const src=attribute(token,'src');if(src)out.push({kind:'image',src,alt:attribute(token,'alt')});continue}
    if(tag==='hr'){flush();out.push({kind:'rule'});continue}
    if(tag==='br'){text+=code?'\n':' ';continue}
    if(/^h[1-6]$/.test(tag)){flush();kind=close?'paragraph':'heading';level=Number(tag[1]);continue}
    if(['p','div','section','article','li','blockquote','pre','figcaption'].includes(tag)){flush();if(!close){kind=tag==='li'?'list':tag==='blockquote'?'quote':tag==='pre'?'code':'paragraph';code=tag==='pre'}else{kind='paragraph';code=false}continue}
    if(tag==='a'&&!close){const href=pdfLink(attribute(token,'href'),base);if(href)out.push({kind:'paragraph',text:'',link:href});continue}
    if(['audio','video'].includes(tag)&&!close){flush();out.push({kind:'paragraph',text:'رسانهٔ تعاملی در نسخهٔ آنلاین این مطلب در دسترس است.'})}
  }
  flush()
  if(out.length>5000||out.reduce((n,b)=>n+('text'in b?b.text.length:b.kind==='table'?b.rows.flat().join('').length:0),0)>240_000)throw new PdfError('حجم متن برای یک PDF بیش از حد است؛ بخش کوتاه‌تری را دریافت کنید',413)
  return out
}
