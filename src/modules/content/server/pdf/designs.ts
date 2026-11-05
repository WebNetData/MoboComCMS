import { PDF_DESIGNS,PDF_KINDS,type PdfContent,type PdfDesign,type PdfSettings,PdfError } from '@/modules/content/domain/pdf'
import { type Drawing,MARGIN,LINE,MUTED } from './drawing'
import { type PdfAssets } from './assets'

/** Eight typed, code-owned compositions. Templates cannot execute administrator-supplied code. */
export function pdfCover(d:Drawing,c:PdfContent,s:PdfSettings,design:PdfDesign,assets:PdfAssets):number{
  const {pdf,line,wrap,width,inner}=d,p=PDF_DESIGNS[design],image=assets.pictures.get(c.image),right=width-MARGIN
  const photo=(x:number,y:number,w:number,h:number)=>{if(image){pdf.save().roundedRect(x,y,w,h,12).clip();pdf.image(image.bytes,x,y,{fit:[w,h],align:'center',valign:'center'});pdf.restore()}else{pdf.roundedRect(x,y,w,h,12).fill(p.deep);pdf.save().fillOpacity(.12).circle(x+w/2,y+h/2,Math.min(w,h)*.3).fill('#ffffff');pdf.restore()}}
  const title=(x:number,y:number,w:number,size:number,color:string,max=160)=>{while(size>11&&wrap(c.title,w,{size,bold:true}).length*size*1.6>max)size--;const rows=wrap(c.title,w,{size,bold:true});if(rows.length*size*1.6>max)throw new PdfError('عنوان این محتوا برای جلد PDF بیش از حد طولانی است',413);for(const text of rows){line(text,x,y,w,{size,bold:true,color});y+=size*1.6}return y}
  const subtitle=(t:string,x:number,y:number,w:number,style:{size:number;color:string})=>{for(const row of wrap(t,w,style)){line(row,x,y,w,style);y+=style.size*1.6}}
  const brand=(color=MUTED)=>{line(s.brand,MARGIN,26,inner,{size:10,bold:true,color});line('نسخهٔ مطالعه  /  '+PDF_KINDS[c.kind],MARGIN,46,inner,{size:8,color})}
  if(design==='cinema'){
    const g=pdf.linearGradient(0,0,width,360);g.stop(0,p.deep).stop(1,'#26394b');pdf.rect(0,0,width,360).fill(g)
    pdf.save().fillOpacity(.08).circle(30,340,180).fill(p.color);pdf.restore();brand('#f3ddbb');photo(right-156,85,156,232)
    line('پروندهٔ سینمایی',MARGIN,93,inner-180,{size:11,color:'#f3ddbb'});const y=title(MARGIN,131,inner-184,23,'#ffffff');subtitle(c.subtitle,MARGIN,y+12,inner-184,{size:10,color:'#d8e3ee'});return Math.max(382,y+62)
  }
  if(design==='catalogue'){
    brand();pdf.roundedRect(MARGIN,83,inner,266,16).fill('#eef7f6');photo(MARGIN+16,102,216,226)
    pdf.roundedRect(right-91,101,74,21,10).fill(p.color);line('کاتالوگ',right-89,106,70,{size:8,bold:true,color:'#ffffff',align:'center'})
    const y=title(MARGIN+250,145,inner-270,20,p.deep,145);line(c.subtitle,MARGIN+250,y+12,inner-270,{size:9,color:p.color});return Math.max(372,y+60)
  }
  if(design==='sound'){
    pdf.rect(0,0,width,329).fill('#fbf2f6');brand(p.deep)
    pdf.circle(161,205,104).fill('#241c2b');for(const r of [88,80,72,64])pdf.circle(161,205,r).lineWidth(.5).stroke('#514451');photo(102,146,118,118);pdf.circle(161,205,5).fill('#f9eef4')
    line('MUSIC / MOBOCOM',MARGIN+244,99,inner-244,{size:9,bold:true,color:p.color});const y=title(MARGIN+244,130,inner-244,22,p.deep,145);line(c.subtitle,MARGIN+244,y+12,inner-244,{size:11,color:p.color})
    for(let i=0;i<30;i++){const h=7+(i*13%37);pdf.roundedRect(MARGIN+i*5,346-h,2,h,1).fill(p.color)}return Math.max(375,y+65)
  }
  if(design==='serial'){
    brand();pdf.roundedRect(MARGIN,83,inner,260,14).fill('#f5f0fa');pdf.rect(right-8,98,3,232).fill(p.color)
    photo(MARGIN+20,104,164,214);pdf.save().fillOpacity(.06);line('01',MARGIN+160,80,inner-180,{size:90,bold:true,color:p.deep,align:'left'});pdf.restore()
    line('روایت، فصل به فصل',MARGIN+208,112,inner-238,{size:10,color:p.color});const y=title(MARGIN+208,151,inner-238,21,p.deep,125);line(c.subtitle,MARGIN+208,y+12,inner-238,{size:9,color:p.color});return Math.max(367,y+60)
  }
  if(design==='arena'){
    pdf.rect(0,0,width,360).fill(p.deep);pdf.polygon([0,0],[width,0],[width,79],[0,198]).fill(p.color);brand('#ffffff')
    photo(MARGIN,111,inner,218);pdf.save().fillOpacity(.85).rect(MARGIN,244,inner,85).fill(p.deep);pdf.restore()
    const y=title(MARGIN+14,251,inner-28,21,'#ffffff',65);return Math.max(382,y+26)
  }
  if(design==='technical'){
    brand();pdf.rect(MARGIN,78,inner,3).fill(p.color)
    for(let x=MARGIN;x<right;x+=20)for(let y=95;y<261;y+=20)pdf.circle(x,y,.65).fill('#c9dce7')
    photo(MARGIN+6,108,142,142);line('مشخصات و راهنمای کاربرد',MARGIN+178,105,inner-180,{size:10,color:p.color})
    const y=title(MARGIN+178,135,inner-180,21,p.deep,100);line(c.subtitle,MARGIN+178,y+11,inner-180,{size:9,color:p.color});pdf.moveTo(MARGIN,280).lineTo(right,280).stroke(LINE);return Math.max(304,y+55)
  }
  brand();pdf.moveTo(MARGIN,75).lineTo(right,75).lineWidth(design==='minimal'?.6:2).stroke(p.color)
  let y=title(MARGIN,98,inner,design==='minimal'?25:28,p.deep)
  if(c.subtitle){for(const row of wrap(c.subtitle,inner,{size:11})){line(row,MARGIN,y+8,inner,{size:11,color:p.color});y+=18}y+=10}
  if(image&&s.includeImages){photo(MARGIN,y+18,inner,design==='minimal'?170:210);y+=design==='minimal'?198:238}
  return y+28
}
