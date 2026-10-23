/* Measured Registry retrieval smoke benchmark; never estimates model tokens. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const adapter=require('./graphify-local.cjs');
const config=JSON.parse(fs.readFileSync(path.join(adapter.root,'tools/devstack/registry-benchmark.json'),'utf8'));
adapter.refresh();
const edges=adapter.readGraph().edges;
const usageIndex=process.argv.indexOf('--usage');
if(process.argv.length>2 && (usageIndex!==2 || process.argv.length!==4)) throw new Error('Usage: node scripts/graphify-benchmark.cjs [--usage <actual client export.json>]');
let usage=usageIndex<0?[]:JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
assert(Array.isArray(usage));
for(const row of usage) {
 assert(config.conditions[row.condition]&&config.cases.some(c=>c.id===row.taskId));
 assert.equal(typeof row.verifiedSuccess,'boolean');
 for(const field of config.usage.requiredFields.slice(3)) assert(Number.isFinite(row[field])&&row[field]>=0,`Invalid usage field ${field}`);
 assert.equal(row.totalTokens,row.cachedInputTokens+row.uncachedInputTokens+row.outputTokens,'Total must include cached, uncached and output usage');
}
usage=usage.map(row=>Object.fromEntries(config.usage.requiredFields.map(field=>[field,row[field]])));
const samples=[];
for(const entry of config.cases) {
 const command=entry.graphify;
 const args=[...command,'--graph',adapter.graph,...(command[0]==='query'?['--budget','1500']:command[0]==='affected'?['--depth','2']:[])];
 const measured=adapter.run(args,`benchmark-${entry.id}`),text=fs.readFileSync(measured.log,'utf8');
 const sources=[...text.matchAll(/^NODE .*\[src=([^ ]+)/gm)].map(m=>m[1]);
 const unique=[...new Set(sources)];
 const hits=entry.expectedSources?.filter(p=>unique.includes(p)).length;
 const success=entry.expectedSources?hits===entry.expectedSources.length:entry.expectedText?text.includes(entry.expectedText):entry.expectedTextParts.every(p=>text.includes(p));
 // Validate the nominated architecture trace against actual source, not only the graph.
 let sourceVerified=true;
 if(entry.id==='client-hook-trace') sourceVerified=/const runtime = useExtensions\(\)/.test(fs.readFileSync(path.join(adapter.root,'src/plugins/registry.tsx'),'utf8'))
   &&edges.some(e=>e.relation==='calls'&&e.source==='src_plugins_registry_pluginoutlet'&&e.target==='src_extensions_client_extensionprovider_useextensions'&&e.confidence==='EXTRACTED');
 if(entry.id==='module-change-impact') {
  const source=fs.readFileSync(path.join(adapter.root,'src/extensions/server/modules.ts'),'utf8');
  sourceVerified=/async function requireModule[^}]*?isModuleEnabled\(id\)/.test(source)&&/async function moduleGuard[^}]*?isModuleEnabled\(id, reader\)/.test(source);
 }
 samples.push({taskId:entry.id,verifiedSuccess:success&&sourceVerified,toolCalls:1,durationMs:measured.durationMs,
  sampledPeakProcessTreeWorkingSetBytes:measured.sampledPeakProcessTreeWorkingSetBytes,retrievedUniqueFiles:unique.length,
  expectedFileRecall:entry.expectedSources?hits/entry.expectedSources.length:null,
  nominatedFilePrecision:entry.expectedSources&&unique.length?hits/unique.length:null,
  outputCharacters:text.length,totalTokens:null,cachedInputTokens:null,uncachedInputTokens:null,outputTokens:null});
}
const testStart=Date.now();
const testEnv={...process.env,NODE_PATH:[path.join(adapter.root,'tools/devstack/node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter)};
const tests=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','scripts/packages.test.cjs'],{cwd:adapter.root,env:testEnv,encoding:'utf8',windowsHide:true,maxBuffer:2e6});
fs.writeFileSync(path.join(adapter.local,'benchmark-functional-tests.log'),tests.stdout+tests.stderr);
const testText=tests.stdout,passed=Number(/# pass (\d+)/.exec(testText)?.[1]||0),failed=Number(/# fail (\d+)/.exec(testText)?.[1]||0);
const bytes=dir=>fs.readdirSync(dir,{withFileTypes:true}).reduce((n,e)=>n+(e.isDirectory()?bytes(path.join(dir,e.name)):fs.statSync(path.join(dir,e.name)).size),0);
const initial=fs.readdirSync(adapter.local).filter(x=>/^refresh-.*\.json$/.test(x)&&!x.includes('request')).sort().map(x=>JSON.parse(fs.readFileSync(path.join(adapter.local,x),'utf8'))).find(m=>fs.readFileSync(m.log,'utf8').includes('[graphify extract] scanning '));
const serenaFile=path.join(adapter.local,'serena-benchmark.json');
const report={date:new Date().toISOString().slice(0,10),scope:config.scope,condition:'E',graph:adapter.verify(),initialIndex:initial,
 corpus:{...adapter.sourceStamp(),gitHead:cp.spawnSync('git',['rev-parse','HEAD'],{cwd:adapter.root,encoding:'utf8',windowsHide:true}).stdout.trim(),workingTree:'dirty; content hash identifies the selected source'},
 graphAndCacheStorageBytes:bytes(path.join(adapter.local,'graphify-out')),samples,
 tracePassRate:samples.filter(x=>x.verifiedSuccess).length/samples.length,
 functionalTests:{command:'node --test scripts/packages.test.cjs',exitCode:tests.status,passed,failed,passRate:passed/(passed+failed),durationMs:Date.now()-testStart},
 comparison:{serenaOnly:fs.existsSync(serenaFile)?JSON.parse(fs.readFileSync(serenaFile,'utf8')):{status:'not measured'},codeGraphContext:{status:'not installed/configured; no run'},actualClientUsage:usage},
 limitations:['Retrieval CLI calls and wall-clock times are not completed feature-development tasks or full agent tool-call totals.','No model token usage exposed for this run: all token fields null; Graphify semantic extraction tokens zero.','File precision uses nominated Registry owner files, not a judgment that every additional related file is irrelevant.','Memory is sampled Windows process-tree working set at 250ms, not an exact allocation peak.','No prior Registry A-D benchmark found in this checkout; E is additive alongside named baselines, no historical condition IDs fabricated.']};
fs.writeFileSync(path.join(adapter.local,'benchmark.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({condition:'E',graph:report.graph,samples,tracePassRate:report.tracePassRate,functionalTests:report.functionalTests,storageBytes:report.graphAndCacheStorageBytes}));
if(report.tracePassRate!==1||tests.status!==0||!passed)process.exitCode=1;
