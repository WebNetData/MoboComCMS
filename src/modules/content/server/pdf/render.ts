import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { PDF_DESIGNS,type PdfContent,type PdfDesign,type PdfSettings,PdfError,pdfLink } from '@/modules/content/domain/pdf'
import { pdfDocument,type PdfBlock } from '@/modules/content/domain/pdf-document'
import { drawing,FONT,MARGIN,INK,MUTED,LINE,SOFT,type TextStyle } from './drawing'
import { pdfAssets,type PdfAssets } from './assets'
import { pdfCover } from './designs'

/** Produces actual text/vector PDFs, never screenshots or a browser print dialog. */
export async function renderContentPdf(content:PdfContent,settings:PdfSettings,base:string,design:PdfDesign):Promise<Buffer>{
  const blocks=pdfDocument(content.html,base),assets=await pdfAssets(content,blocks,settings,base)
  const pdf=new PDFDocument({size:settings.paper,margin:MARGIN,font:FONT('Regular'),bufferPages:true,info:{Title:content.title,Author:content.author||settings.brand,Creator:'MoboCom PDF editions',Subject:content.subtitle},lang:'fa-IR'})
  pdf.registerFont('regular',FONT('Regular'));pdf.registerFont('bold',FONT('Bold'))
  const chunks:Buffer[]=[];let bytes=0
  pdf.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>30*1024**2)pdf.destroy(new PdfError('حجم PDF بیش از حد است',413));else chunks.push(chunk)})
  const finished=new Promise<Buffer>((resolve,reject)=>{pdf.once('end',()=>resolve(Buffer.concat(chunks)));pdf.once('error',reject)})
  // Always observe stream failure, even when a synchronous layout guard throws first.
  void finished.catch(()=>undefined)
  try{
    const d=drawing(pdf),{line,wrap,inner,width,height}=d,p=PDF_DESIGNS[design],bottom=height-73
    let y=pdfCover(d,content,settings,design,assets)
    const newPage=()=>{y=d.next();line(settings.brand,MARGIN,27,inner,{size:9,bold:true,color:p.color});line(content.title,MARGIN,43,inner,{size:8,color:MUTED});pdf.moveTo(MARGIN,61).lineTo(width-MARGIN,61).lineWidth(.5).stroke(LINE)}
    const ensure=(h:number)=>{if(y+h>bottom)newPage()}
    function paragraph(text:string,style:TextStyle={},inset=0){
      const size=style.size||settings.fontSize,step=size*1.75,rows=wrap(text,inner-inset*2,{...style,size})
      for(const row of rows){ensure(step);line(row,MARGIN+inset,y,inner-inset*2,{...style,size});y+=step}
      y+=7
    }
    if(content.summary){ensure(60);paragraph(content.summary,{size:settings.fontSize+1,bold:true,color:p.deep});y+=5}
    if(content.author)paragraph('نویسنده: '+content.author,{size:9,color:MUTED})
    if(content.facts.length){
      ensure(60);line('در یک نگاه',MARGIN,y,inner,{size:14,bold:true,color:p.color});y+=30
      for(const [label,value]of content.facts){
        if(label.length+value.length>1800)throw new PdfError('مشخصات این مطلب برای PDF بیش از حد طولانی است',413)
        const labelWidth=132,rows=wrap(value,inner-labelWidth-24,{size:10}),h=Math.max(35,rows.length*17+16)
        if(h>bottom-80)throw new PdfError('یک ردیف مشخصات بیش از یک صفحه است',413)
        ensure(h+5);pdf.roundedRect(MARGIN,y,inner,h,6).fill(SOFT);line(label,MARGIN+inner-labelWidth-12,y+10,labelWidth,{size:9,bold:true,color:p.deep})
        rows.forEach((r,i)=>line(r,MARGIN+12,y+9+i*17,inner-labelWidth-24,{size:10,color:INK}));y+=h+5
      }y+=20
    }
    const heading=(text:string,level=2)=>{const size=level<3?17:14,rows=wrap(text,inner-18,{size,bold:true});ensure(Math.min(120,rows.length*size*1.5+50));y+=13;pdf.roundedRect(width-MARGIN-4,y+4,4,18,2).fill(p.color);pdf.outline.addItem(text);paragraph(text,{size,bold:true,color:p.deep},9)}
    function table(rows:string[][]){
      if(rows.some(r=>r.length>12)||rows.length>500)throw new PdfError('جدول این مطلب برای PDF بیش از حد بزرگ است',413)
      const cols=Math.max(1,...rows.map(r=>r.length)),cw=inner/cols
      rows.forEach((cells,rowIndex)=>{
        const wrapped=Array.from({length:cols},(_,i)=>wrap(cells[i]||'',cw-14,{size:9,bold:rowIndex===0})),max=Math.max(1,...wrapped.map(r=>r.length))
        let offset=0
        while(offset<max){ensure(52);const count=Math.min(max-offset,Math.max(1,Math.floor((bottom-y-16)/15))),h=count*15+16
          pdf.rect(MARGIN,y,inner,h).fill(rowIndex===0?p.deep:rowIndex%2?SOFT:'#ffffff')
          for(let i=0;i<cols;i++){const x=width-MARGIN-(i+1)*cw;pdf.rect(x,y,cw,h).lineWidth(.4).stroke(LINE);for(let j=0;j<count;j++)if(wrapped[i][offset+j])line(wrapped[i][offset+j],x+7,y+8+j*15,cw-14,{size:9,bold:rowIndex===0,color:rowIndex===0?'#ffffff':INK})}
          y+=h;offset+=count;if(offset<max)newPage()
        }
      });y+=18
    }
    for(const block of blocks){
      if(block.kind==='heading'){heading(block.text,block.level);continue}
      if(block.kind==='table'){table(block.rows);continue}
      if(block.kind==='rule'){ensure(30);pdf.moveTo(MARGIN,y+10).lineTo(width-MARGIN,y+10).stroke(LINE);y+=26;continue}
      if(block.kind==='image'){
        if(!settings.includeImages)continue
        const image=assets.pictures.get(block.src)
        if(!image){paragraph((block.alt?block.alt+' - ':'')+'تصویر در نسخهٔ آنلاین در دسترس است.',{size:9,color:MUTED});continue}
        const h=Math.min(300,inner*image.height/image.width);ensure(h+40);pdf.image(image.bytes,MARGIN,y,{fit:[inner,h],align:'center',valign:'center'});y+=h+10;if(block.alt)paragraph(block.alt,{size:9,color:MUTED});y+=10;continue
      }
      if(block.link){const url=pdfLink(block.link,base);if(url){ensure(20);const rows=wrap(url,inner,{size:8});for(const row of rows){ensure(15);line(row,MARGIN,y,inner,{size:8,color:p.color,align:'left'});pdf.link(MARGIN,y,inner,14,url);y+=15}y+=4}}
      if(block.text)paragraph((block.kind==='list'?'•  ':'')+block.text,{size:settings.fontSize,color:block.kind==='quote'?p.color:INK,bold:block.kind==='quote'},block.kind==='quote'||block.kind==='code'?14:0)
    }
    const url=pdfLink(content.url,base)
    if(url){ensure(100);y+=15;pdf.roundedRect(MARGIN,y,inner,80,10).fill(SOFT)
      const qrSize=settings.includeQr?58:0
      if(qrSize){const {modules}=QRCode.create(url,{errorCorrectionLevel:'M'}),size=qrSize/modules.size;for(let r=0;r<modules.size;r++)for(let c=0;c<modules.size;c++)if(modules.data[r*modules.size+c])pdf.rect(MARGIN+12+c*size,y+11+r*size,size+.05,size+.05).fill(p.deep)}
      line('ادامهٔ تجربه در موبوکام',MARGIN+qrSize+26,y+12,inner-qrSize-40,{size:12,bold:true,color:p.deep})
      const label=new URL(url).hostname+new URL(url).pathname
      const rows=wrap(label,inner-qrSize-40,{size:8});rows.slice(0,2).forEach((r,i)=>line(r,MARGIN+qrSize+26,y+38+i*13,inner-qrSize-40,{size:8,color:p.color,align:'left'}));pdf.link(MARGIN,y,inner,80,url)
    }
    decoratePdf(d,settings,content,assets)
    pdf.end();return await finished
  }catch(error){pdf.destroy();throw error}
}

function decoratePdf(d:ReturnType<typeof drawing>,settings:PdfSettings,content:PdfContent,assets:PdfAssets){
  const {pdf,line,width,height,inner}=d,range=pdf.bufferedPageRange()
  for(let index=0;index<range.count;index++){
    pdf.switchToPage(range.start+index);pdf.page.margins.bottom=0
    if(settings.watermarkEnabled){
      const tile=settings.watermarkPosition==='tile',points=tile?[[width*.27,height*.25],[width*.73,height*.25],[width*.27,height*.55],[width*.73,height*.55],[width*.27,height*.8],[width*.73,height*.8]]:settings.watermarkPosition==='bottom'?[[width/2,height-99]]:[[width/2,height/2]]
      for(const [x,y]of points){pdf.save().opacity(settings.watermarkOpacity/100).rotate(settings.watermarkPosition==='bottom'?0:settings.watermarkAngle,{origin:[x,y]})
        if(assets.watermark){const w=width*settings.watermarkSize/100,h=w*assets.watermark.height/assets.watermark.width;pdf.image(assets.watermark.bytes,x-w/2,y-h/2,{fit:[w,Math.min(h,160)],align:'center',valign:'center'})}
        else line(settings.watermarkText,x-width*.45,y-settings.watermarkSize/2,width*.9,{size:tile?Math.min(24,settings.watermarkSize):settings.watermarkSize,bold:true,color:settings.watermarkColor,align:'center'})
        pdf.restore()
      }
    }
    pdf.moveTo(MARGIN,height-53).lineTo(width-MARGIN,height-53).lineWidth(.5).stroke(LINE)
    d.wrap(settings.footer,inner-75,{size:7}).forEach((text,i)=>line(text,MARGIN+75,height-46+i*10,inner-75,{size:7,color:MUTED}))
    line('صفحهٔ '+(index+1).toLocaleString('fa-IR')+' از '+range.count.toLocaleString('fa-IR'),MARGIN,height-42,64,{size:8,color:MUTED,align:'left'})
    line('به‌روزرسانی: '+content.updatedAt.toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'}),MARGIN,height-25,inner,{size:7,color:MUTED})
  }
}
