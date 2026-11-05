import PDFDocument from 'pdfkit'
import { join } from 'node:path'
import { visualPieces } from '@/shared/text/visual-order'
import { PdfError } from '@/modules/content/domain/pdf'

export type PdfDoc=InstanceType<typeof PDFDocument>
export type TextStyle={size?:number;bold?:boolean;color?:string;align?:'left'|'right'|'center'}
export const FONT=(weight:'Regular'|'Bold')=>join(process.cwd(),'public','fonts','Vazirmatn-'+weight+'.ttf')
export const MARGIN=44,INK='#182333',MUTED='#596779',LINE='#dce3eb',SOFT='#f3f6fa'
export function drawing(pdf:PdfDoc){
  const style=(s:TextStyle={})=>pdf.font(s.bold?'bold':'regular').fontSize(s.size||11).fillColor(s.color||INK)
  const measure=(t:string,s:TextStyle={})=>{style(s);return visualPieces(t,{turnDigits:true}).reduce((n,p)=>n+pdf.widthOfString(p),0)}
  function line(t:string,x:number,y:number,w:number,s:TextStyle={}){
    style(s);const pieces=visualPieces(t,{turnDigits:true});let total=pieces.reduce((n,p)=>n+pdf.widthOfString(p),0)
    if(total>w&&total>0){pdf.fontSize((s.size||11)*w/total);total=w}
    let at=s.align==='left'?x:s.align==='center'?x+(w-total)/2:x+w-total
    for(const piece of pieces){pdf.text(piece,at,y,{lineBreak:false});at+=pdf.widthOfString(piece)}
  }
  function wrap(t:string,w:number,s:TextStyle={}):string[]{
    const lines:string[]=[]
    for(const paragraph of String(t).split(/\r?\n/)){
      let current=''
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(measure(word,s)>w){if(current){lines.push(current);current=''};for(const {segment}of new Intl.Segmenter('fa',{granularity:'grapheme'}).segment(word)){if(current&&measure(current+segment,s)>w){lines.push(current);current=''}current+=segment}continue}
        const next=current?current+' '+word:word
        if(current&&measure(next,s)>w){lines.push(current);current=word}else current=next
      }
      if(current)lines.push(current)
    }
    return lines
  }
  let pages=1
  const next=()=>{if(++pages>80)throw new PdfError('این مطلب بیش از ۸۰ صفحه است و در یک PDF جا نمی‌گیرد',413);pdf.addPage();return 70}
  return {pdf,style,measure,line,wrap,next,width:pdf.page.width,height:pdf.page.height,inner:pdf.page.width-MARGIN*2}
}
export type Drawing=ReturnType<typeof drawing>
