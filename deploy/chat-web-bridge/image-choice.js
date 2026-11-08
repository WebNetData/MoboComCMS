// Choose only among images from the current nonce-owned response. Never clicks UI.
globalThis.mobocomChatImageChoice=(state,getImages)=>{
 const dom=globalThis.mobocomChatDom,tree=globalThis.mobocomChatTree,src=image=>image.currentSrc||image.src
 const select=image=>{if(state.imageChoiceNode!==image||state.imageChoiceSource!==src(image)){if(state.imageReadSource&&state.imageReadSource!==src(image))state.imageReadAbort?.abort();state.imageChoiceNode=image;state.imageChoiceSource=src(image)}}
 const marked=(image,images)=>{for(let el=image,depth=0;el&&depth<12;el=tree.parent(el),depth++){
  if(images.filter(other=>dom.contains(el,other)).length>1)break
  if(el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-checked')==='true'||el.getAttribute('aria-pressed')==='true'||el.getAttribute('data-selected')==='true'||['selected','checked'].includes(el.getAttribute('data-state')))return true
 }return false}
 const click=event=>{
  let images;try{images=getImages()}catch{return}const path=event.composedPath();let chosen=path.find(el=>images.includes(el))
  if(!chosen){const control=path.find(el=>el.matches?.('button,[role="button"],[role="radio"],[role="option"]'));if(!control)return
   const label=(control.getAttribute('aria-label')||control.innerText||'').trim()
   if(!control.matches('[role="radio"],[role="option"]')&&!/\b(?:prefer|choose|select|use this)\b|انتخاب|ترجیح/i.test(label))return
   for(let el=control,depth=0;el&&depth<12;el=tree.parent(el),depth++){const within=images.filter(image=>dom.contains(el,image));if(within.length===1){chosen=within[0];break}if(within.length>1)break}
  }
  if(chosen){select(chosen);state.imageExplicitChoice=true}
 }
 document.addEventListener('click',click,true)
 return{pick(images){
  const available=getImages();state.imageCandidateCount=available.length
  const explicit=available.filter(image=>marked(image,available)),clicked=available.find(image=>image===state.imageChoiceNode||src(image)===state.imageChoiceSource)
  const image=state.imageExplicitChoice&&clicked?clicked:explicit.length===1?explicit[0]:images[0]
  state.imageSelection=explicit.length===1||state.imageExplicitChoice&&clicked?'explicit':images.length>1?'first':'only'
  return image&&images.find(ready=>ready===image||src(ready)===src(image))
 },close(){document.removeEventListener('click',click,true)}}
}
