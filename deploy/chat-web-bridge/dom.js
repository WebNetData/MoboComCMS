// Visible DOM only. Keep operation state in the owned tab across reinjection.
globalThis.mobocomChatDom=(()=>{
 const operations=globalThis.__mobocomChatOperations||(globalThis.__mobocomChatOperations=new Map())
 const visible=el=>el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'
 const outer=selector=>{const all=[...document.querySelectorAll(selector)].filter(visible);return all.filter(el=>!all.some(parent=>parent!==el&&parent.contains(el)))}
 function text(root){
  if(!root)return ''
  const walk=node=>{
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||''
   if(node.nodeType!==Node.ELEMENT_NODE)return ''
   if(node.matches('button,[role="button"],nav,script,style,[aria-hidden="true"]')||getComputedStyle(node).display==='none')return ''
   if(node.tagName==='BR')return '\n'
   if(node.tagName==='PRE')return '\n'+(node.querySelector('code')||node).textContent+'\n'
   const value=[...node.childNodes].map(walk).join('')
   return /^(P|DIV|ARTICLE|SECTION|LI|H[1-6])$/.test(node.tagName)?'\n'+value+'\n':value
  }
  return walk(root).trim()
 }
 function completed(answer,marker){
  const lines=answer.replace(/\r\n/g,'\n').split('\n'),clean=s=>s.replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim()
  let index=-1;for(let i=0;i<lines.length;i++)if(clean(lines[i])===marker)index=i
  if(index<0)return null
  let result=lines.slice(0,index).join('\n').trim()
  // A rendered code-block language label is UI chrome, not part of its JSON.
  if(/^json\s*\n\s*[\[{]/i.test(result)){const candidate=result.replace(/^json\s*\n/i,'');try{JSON.parse(candidate);result=candidate}catch{}}
  return result&&result.length<=60000?result:null
 }
 function operation(id,options,deadline){
  let state=operations.get(id)
  if(!state){state={id,options,baseline:options.baseline,sent:options.resume===true,path:options.path,deadline,running:false};operations.set(id,state);if(operations.size>12)for(const[key,v]of operations){if(!v.running&&key!==id){operations.delete(key);break}}}
  state.deadline=Math.max(state.deadline,deadline);return state
 }
 const notify=async(state,stage,owned=true)=>{
  const reply=await chrome.runtime.sendMessage({type:'CHAT_PROGRESS',id:state.id,stage,baseline:state.baseline||0,owned})
  if(reply?.error)throw Object.assign(Error(reply.error),{code:'CHAT_UI'})
  return reply?.active===true
 }
 const deliver=async(state,result,owned=true)=>{state.result=result;const response=await chrome.runtime.sendMessage({type:'CHAT_RESULT',id:state.id,owned,...result});if(response?.error)throw Error(response.error)}
 return{visible,outer,text,completed,operation,notify,deliver}
})()
