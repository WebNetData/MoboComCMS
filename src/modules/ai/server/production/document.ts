import { randomUUID } from 'node:crypto'
import { blockEditorEnabled, prepareDocument } from '@/modules/editor/server/documents'
import type { EditorActor } from '@/modules/editor/server/documents'
import { cleanRichText } from '@/shared/content/sanitize'
import type { ProductionOutput, ProductionImage } from '../../domain/production'
const escape=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
export function productionHtml(output: ProductionOutput, images: ProductionImage[]) {
  return cleanRichText(output.sections.map((s,i)=>{
    const image=images.find(x=>x.index===i+1)
    return (s.heading?`<h2>${escape(s.heading)}</h2>`:'')+s.text.split(/\n\s*\n/).map(t=>`<p>${escape(t).replace(/\n/g,'<br>')}</p>`).join('')+(image?`<figure><img src="${escape(image.url)}" alt="${escape(image.alt)}"><figcaption>${escape(image.caption)}</figcaption></figure>`:'')
  }).join(''))
}
export async function productionDocument(output: ProductionOutput, images: ProductionImage[],actor:EditorActor,includeCover=false) {
  const cover=includeCover?images.find(x=>x.index===0):undefined
  if(!await blockEditorEnabled())return{editorFormat:'legacy',content:(cover?cleanRichText(`<figure><img src="${escape(cover.url)}" alt="${escape(cover.alt)}"><figcaption>${escape(cover.caption)}</figcaption></figure>`):'')+productionHtml(output,images),contentDocument:''}
  const id=()=> 'b_'+randomUUID().replaceAll('-','').slice(0,16)
  const blocks=output.sections.flatMap((s,i)=>{
    const content=[...(s.heading?[{type:'heading',attrs:{level:2},content:[{type:'text',text:s.heading}]}]:[]),...s.text.split(/\n\s*\n/).map(t=>({type:'paragraph',content:t.split('\n').flatMap((line,j)=>[...(j?[{type:'hardBreak'}]:[]),...(line?[{type:'text',text:line}]:[])])}))]
    const result: unknown[]=[{id:id(),type:'content.richText',version:2,props:{dir:'auto',content:{type:'doc',content}}}]
    const image=images.find(x=>x.index===i+1);if(image)result.push({id:id(),type:'content.image',version:1,props:{image:{src:image.url,alt:image.alt,caption:image.caption,width:0,height:0,mime:'image/webp'},link:'',width:'container',rounded:true}})
    return result
  })
  if(cover)blocks.unshift({id:id(),type:'content.image',version:1,props:{image:{src:cover.url,alt:cover.alt,caption:cover.caption,width:0,height:0,mime:'image/webp'},link:'',width:'container',rounded:true}})
  const prepared=await prepareDocument({version:1,blocks},actor)
  return{editorFormat:'blocks-v1',content:prepared.html,contentDocument:JSON.stringify(prepared.checked.document)}
}
