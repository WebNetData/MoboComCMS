// Downloaded helper owns only a loopback callback. PKCE verifier and all tokens stay on the CMS server.
export function localLoginHelper(authorizationUrl: string, expectedState: string, returnOrigin: string) {
  return `// MoboComCMS personal ChatGPT login. Run with Node.js22 on your own computer. No password/token is collected here.
const http=require('node:http');
const authorizationUrl=${JSON.stringify(authorizationUrl)},state=${JSON.stringify(expectedState)},origin=${JSON.stringify(returnOrigin)};
const server=http.createServer((req,res)=>{
 if(req.headers.host!=='127.0.0.1:1455'||req.method!=='GET'||(req.url||'').length>16000){res.writeHead(400);res.end('Invalid callback');return;}
 const url=new URL(req.url,'http://127.0.0.1:1455');
 if(url.pathname!=='/auth/callback'||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid login state');return;}
 for(const name of ['code','client_id','error'])if(url.searchParams.getAll(name).length>1){res.writeHead(400);res.end('Invalid callback');return;}
 const result=Object.fromEntries(['code','client_id','state','error'].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)]));
 const location=origin+'/admin/ai#chatgpt_callback='+Buffer.from(JSON.stringify(result)).toString('base64url');
 res.writeHead(303,{'Location':location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();server.close();
});
server.on('error',()=>{console.error('Cannot listen on127.0.0.1:1455. Close the earlier login helper and try again.');process.exitCode=1;});
server.listen(1455,'127.0.0.1',()=>{console.log('Open this official login URL in your browser, then return to MoboComCMS:');console.log(authorizationUrl);});
setTimeout(()=>{server.close();},10*60*1000).unref();
`
}
