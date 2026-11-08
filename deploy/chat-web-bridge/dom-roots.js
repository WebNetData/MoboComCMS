// Open shadow DOM only. Never opens closed roots or cross-origin frames.
globalThis.mobocomChatTree=(()=>{
 const cache=new WeakMap(),parent=node=>node?.assignedSlot||node?.parentElement||node?.parentNode?.host||null
 function roots(base=document){let item=cache.get(base);if(item&&Date.now()-item.at<750)return item.roots.filter(root=>!root.host||root.host.isConnected);const found=[base],seen=new Set(found);let nodes=0;for(let i=0;i<found.length&&i<64;i++){const root=found[i];if(root.shadowRoot&&!seen.has(root.shadowRoot)){seen.add(root.shadowRoot);found.push(root.shadowRoot)}for(const el of root.querySelectorAll('*')){if(++nodes>20000)break;if(el.shadowRoot&&!seen.has(el.shadowRoot)){seen.add(el.shadowRoot);found.push(el.shadowRoot)}}if(nodes>20000)break}item={at:Date.now(),roots:found.slice(0,64)};cache.set(base,item);return item.roots}
 const queryAll=(selector,base=document)=>[...new Set(roots(base).flatMap(root=>[...root.querySelectorAll(selector)]))]
 const contains=(owner,node)=>{for(let el=node,depth=0;el&&depth<256;el=parent(el),depth++)if(el===owner)return true;return false}
 const closest=(node,selector)=>{for(let el=node,depth=0;el&&depth<256;el=parent(el),depth++)if(el.matches?.(selector))return el;return null}
 const chain=node=>{const all=[];for(let el=node,depth=0;el&&depth<256;el=parent(el),depth++)all.unshift(el);return all}
 function after(anchor,node){const a=chain(anchor),b=chain(node);let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;if(!i||i===a.length||i===b.length)return false;const position=a[i].compareDocumentPosition(b[i]);return !(position&Node.DOCUMENT_POSITION_DISCONNECTED)&&!!(position&Node.DOCUMENT_POSITION_FOLLOWING)}
 const children=node=>node.nodeType===Node.ELEMENT_NODE&&node.tagName==='SLOT'?(node.assignedNodes({flatten:true}).length?node.assignedNodes({flatten:true}):[...node.childNodes]):[...(node.shadowRoot||node).childNodes]
 return{roots,queryAll,parent,contains,closest,after,children}
})()
