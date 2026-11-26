import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

export class HostingConnectionError extends Error {
  constructor(readonly code: 'DESTINATION' | 'NETWORK' | 'TLS' | 'TIMEOUT' | 'RESPONSE_SIZE' | 'REDIRECT') { super(code) }
}
const denied = new BlockList(), special6 = new BlockList(), private4 = new BlockList(), private6 = new BlockList()
for(const [ip,prefix] of [['0.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)denied.addSubnet(ip,prefix,'ipv4')
for(const [ip,prefix] of [['10.0.0.0',8],['100.64.0.0',10],['172.16.0.0',12],['192.168.0.0',16]] as const)private4.addSubnet(ip,prefix,'ipv4')
for(const [ip,prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20],['fe80::',10],['ff00::',8]] as const)special6.addSubnet(ip,prefix,'ipv6')
private6.addSubnet('fc00::',7,'ipv6')
/** Private systems are an explicit deployment choice, never a customer-selected URL. */
export function hostingAddressAllowed(host:string,address:string){
  const family=isIP(address)
  if(family===4&&denied.check(address,'ipv4')||family===6&&special6.check(address,'ipv6')||!family)return false
  const internal=family===4?private4.check(address,'ipv4'):private6.check(address,'ipv6')
  if(!internal)return family===4||/^[23]/i.test(address)
  return (process.env.HOSTING_PRIVATE_API_HOSTS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).includes(host.toLowerCase())
}
export type HostingRequestInit={method?:'GET'|'POST';headers?:Record<string,string>;body?:string;timeoutMs?:number}
/** One HTTPS origin, pinned DNS and a deadline covering headers and body; no credential-bearing redirects. */
export async function hostingRequest(destination:string,init:HostingRequestInit={}):Promise<{status:number;text:string}>{
  const url=new URL(destination),host=url.hostname.replace(/^\[|\]$/g,''),deadline=AbortSignal.timeout(Math.min(30000,Math.max(1000,init.timeoutMs??10000)))
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new HostingConnectionError('DESTINATION')
  let addresses:{address:string;family:number}[]
  try{addresses=await Promise.race([isIP(host)?Promise.resolve([{address:host,family:isIP(host)}]):lookup(host,{all:true,verbatim:true}),new Promise<never>((_resolve,reject)=>{if(deadline.aborted)return reject(new HostingConnectionError('TIMEOUT'));deadline.addEventListener('abort',()=>reject(new HostingConnectionError('TIMEOUT')),{once:true})})])}catch(error){throw error instanceof HostingConnectionError?error:new HostingConnectionError('NETWORK')}
  if(!addresses.length||addresses.some(item=>!hostingAddressAllowed(host,item.address)))throw new HostingConnectionError('DESTINATION')
  const pinned=addresses[0]
  return new Promise((resolve,reject)=>{
    const req=request(url,{method:init.method||'GET',agent:false,signal:deadline,family:pinned.family,servername:isIP(host)?undefined:host,
      lookup:((_hostname:string,options:{all?:boolean},cb:(...args:unknown[])=>void)=>options?.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)) as NonNullable<Parameters<typeof request>[1]>['lookup'],
      headers:{...init.headers,Host:url.host,Accept:'application/json','User-Agent':'MoboComCloud/1',...(init.body!==undefined?{'Content-Length':Buffer.byteLength(init.body)}:{})}},res=>{
        if(res.statusCode&&res.statusCode>=300&&res.statusCode<400){res.destroy();reject(new HostingConnectionError('REDIRECT'));return}
        const chunks:Buffer[]=[];let size=0
        res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){res.destroy();reject(new HostingConnectionError('RESPONSE_SIZE'));return}chunks.push(Buffer.from(chunk))})
        res.on('end',()=>resolve({status:res.statusCode||0,text:Buffer.concat(chunks).toString('utf8')}))
        res.on('error',()=>reject(new HostingConnectionError('NETWORK')))
      })
    req.on('error',(error:Error&{code?:string})=>reject(new HostingConnectionError(deadline.aborted?'TIMEOUT':/CERT|TLS|SSL|SELF_SIGNED|VERIFY/.test(error.code||'')?'TLS':'NETWORK')))
    req.end(init.body)
  })
}

export function connectionFailure(error:unknown):string{
  const code=error instanceof HostingConnectionError?error.code:'NETWORK'
  return ({DESTINATION:'مقصد اتصال مجاز نیست؛ برای سرور خصوصی، میزبان دقیق را در HOSTING_PRIVATE_API_HOSTS مجاز کنید.',TLS:'گواهی TLS معتبر نیست؛ نام میزبان و زنجیرهٔ گواهی سرور را اصلاح کنید.',TIMEOUT:'مهلت اتصال تمام شد؛ دسترسی شبکه و فایروال سرور را بررسی کنید.',RESPONSE_SIZE:'پاسخ سامانه بیش از حد بزرگ است.',REDIRECT:'سامانه پاسخ تغییر مسیر داد؛ نشانی مستقیم API را وارد کنید.',NETWORK:'ارتباط با سامانه برقرار نشد؛ DNS، پورت و فایروال را بررسی کنید.'})[code]
}
