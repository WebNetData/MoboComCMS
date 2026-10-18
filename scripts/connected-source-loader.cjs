// Reuse production TypeScript owners in native checks; only named external boundaries are doubled.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
module.exports=function sourceLoader(mocks={}){
 const cache=new Map()
 function load(file){
  const base=path.resolve(file),full=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
  if(!full)throw Error('Missing source '+file)
  if(full.endsWith('.json'))return JSON.parse(fs.readFileSync(full,'utf8'))
  if(cache.has(full))return cache.get(full).exports
  const mod={exports:{}};cache.set(full,mod)
  const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{fileName:full,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports',code)(name=>Object.hasOwn(mocks,name)?mocks[name]:name.startsWith('@/')?load('src/'+name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name),mod,mod.exports)
  return mod.exports
 }
 return load
}
