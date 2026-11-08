// Visible DOM only. Keep operation state in the owned tab across reinjection.
globalThis.mobocomChatDom=(()=>{
 const tree=globalThis.mobocomChatTree
 const operations=globalThis.__mobocomChatOperations||(globalThis.__mobocomChatOperations=new Map())
 const composerSelector='#prompt-textarea,[data-testid="prompt-textarea"],[data-testid="composer-input"],form textarea,main [role="textbox"][contenteditable="true"],form [contenteditable="true"]'
 const visible=el=>{if(!el||!el.isConnected)return false;const style=getComputedStyle(el);if(style.display==='none'||['hidden','collapse'].includes(style.visibility))return false;if(el.getClientRects().length)return true;if(style.display==='contents'){const range=el.ownerDocument.createRange();range.selectNodeContents(el);if(range.getClientRects().length)return true;return el.shadowRoot?[...el.shadowRoot.children].some(visible):false}return false}
 const outer=selector=>{const all=tree.queryAll(selector).filter(visible);return all.filter(el=>!all.some(parent=>parent!==el&&tree.contains(parent,el)))}
 function text(root){
  if(!root)return ''
  const visited=new WeakSet(),walk=node=>{
   if(visited.has(node))return '';visited.add(node)
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||''
   if(node.nodeType===Node.DOCUMENT_FRAGMENT_NODE)return tree.children(node).map(walk).join('')
   if(node.nodeType!==Node.ELEMENT_NODE)return ''
   if(node.matches('button,[role="button"],nav,script,style,svg')||getComputedStyle(node).display==='none'||getComputedStyle(node).visibility==='hidden')return ''
   if(node.tagName==='BR')return '\n'
   if(node.tagName==='PRE')return '\n'+(node.querySelector('code')||node).textContent+'\n'
   const value=tree.children(node).map(walk).join('')
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
 function productionJson(answer){
  if(!answer||answer.length>90000)return null
  const valid=raw=>{try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)&&['title','slug','excerpt','coverPrompt'].every(key=>typeof value[key]==='string')&&Array.isArray(value.sections)&&value.sections.length>0&&value.sections.length<=12&&value.sections.every(s=>s&&typeof s.heading==='string'&&typeof s.text==='string'&&typeof s.imagePrompt==='string')?JSON.stringify(value):null}catch{return null}}
  const direct=valid(answer.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(direct&&direct.length<=60000)return direct
  let start=-1,depth=0,quoted=false,escaped=false,result=null
  for(let i=0;i<answer.length;i++){const c=answer[i];if(start<0){if(c==='{'){start=i;depth=1}continue}if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){const candidate=valid(answer.slice(start,i+1));if(candidate){if(result)return null;result=candidate}start=-1}}
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
 return{visible,outer,text,completed,productionJson,operation,notify,deliver,composerSelector,query:tree.queryAll,contains:tree.contains,closest:tree.closest,after:tree.after}
})()
