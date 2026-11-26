import { request } from 'node:http'
import { connect,checkServerIdentity,type TLSSocket } from 'node:tls'
import { isIP } from 'node:net'

export const PAY_PROXY_PORT=10810
/** DNS is resolved/validated by the caller; CONNECT uses that IP, TLS the original host. */
export function payCallbackTunnel(host:string,address:string,signal:AbortSignal):Promise<TLSSocket>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(new Error('PAY_PROXY_NOT_SENT'))
    const authority=`${isIP(address)===6?'['+address+']':address}:443`
    let secured:TLSSocket|undefined,done=false
    const req=request({host:'127.0.0.1',port:PAY_PROXY_PORT,method:'CONNECT',path:authority,headers:{host:authority},signal})
    const fail=()=>{if(done)return;done=true;signal.removeEventListener('abort',fail);secured?.destroy();req.destroy();reject(new Error('PAY_PROXY_NOT_SENT'))}
    req.once('error',fail)
    req.once('connect',(response,socket,head)=>{
      if(response.statusCode!==200||head.length){socket.destroy();fail();return}
      secured=connect({socket,servername:isIP(host)?undefined:host,rejectUnauthorized:true,ALPNProtocols:['http/1.1'],checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert)})
      signal.addEventListener('abort',fail,{once:true})
      secured.once('error',fail)
      secured.once('close',()=>{if(!done)fail()})
      secured.once('secureConnect',()=>{if(done)return;done=true;signal.removeEventListener('abort',fail);resolve(secured!)})
    })
    req.end()
  })
}
