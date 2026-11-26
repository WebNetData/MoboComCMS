import type { DriverCheck, DriverConnection, HostingDriver } from './contract'
import { connectionFailure, hostingRequest } from '@/modules/hosting/server/drivers/http'
import { whmOperation } from '@/modules/hosting/server/drivers/whm-operations'
import type { CloudOperationInput } from '@/modules/hosting/server/drivers/operations'

type WhmReply={metadata?:{result?:unknown};data?:{version?:unknown;pkg?:unknown}}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value)
/** WHM reseller and root authentication are explicit; a cPanel token is not a WHM token. */
export class CpanelDriver implements HostingDriver {
  readonly id='CPANEL'
  readonly capabilities=['create','suspend','unsuspend','terminate'] as const
  constructor(private readonly connection:DriverConnection){}
  performOperation(input:CloudOperationInput){return whmOperation(this.connection,input)}
  inspectOperation(input:CloudOperationInput,_reference:string){return whmOperation(this.connection,input,true)}
  private async call(command:'version'|'listpkgs'){
    const {url,username,secret,config}=this.connection,base=new URL(url)
    if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!['','2087'].includes(base.port))throw new Error('WHM_URL')
    if(!/^[a-zA-Z0-9_]{1,32}$/.test(username)||!secret||/[\r\n\u0000]/.test(secret))throw new Error('WHM_AUTH')
    const mode=config.authMode??'API_TOKEN'
    if(!['API_TOKEN','PASSWORD'].includes(String(mode)))throw new Error('WHM_AUTH')
    const authorization=mode==='PASSWORD'?'Basic '+Buffer.from(username+':'+secret).toString('base64'):'whm '+username+':'+secret
    const target=new URL('/json-api/'+command,base);target.searchParams.set('api.version','1')
    const response=await hostingRequest(target.toString(),{headers:{authorization}})
    if(response.status===401||response.status===403)throw new Error('WHM_DENIED')
    if(response.status<200||response.status>=300)throw new Error('WHM_RESPONSE')
    let value:unknown;try{value=JSON.parse(response.text)}catch{throw new Error('WHM_RESPONSE')}
    if(!record(value)||!record(value.metadata)||value.metadata.result!==1||!record(value.data))throw new Error('WHM_API')
    return value as WhmReply
  }
  async testConnection():Promise<DriverCheck>{
    try{
      const version=await this.call('version')
      if(typeof version.data?.version!=='string'||!version.data.version.trim())return {ok:false,message:'پاسخ WHM معتبر نیست؛ نشانی API و پورت ۲۰۸۷ را بررسی کنید.'}
      try{
        const reply=await this.call('listpkgs'),items=reply.data?.pkg
        if(!Array.isArray(items)||items.some(item=>!record(item)||typeof item.name!=='string'))return {ok:false,message:'WHM پاسخ بسته‌های معتبری برنگرداند.'}
        const names=[...new Set(items.map(item=>String(item.name).trim()).filter(name=>name.length>0&&name.length<=128&&!/[\u0000-\u001f]/.test(name)))].slice(0,100)
        return {ok:true,message:names.length?`ورود WHM تأیید شد؛ ${names.length.toLocaleString('fa-IR')} بستهٔ قابل دسترس.`:'ورود WHM تأیید شد؛ بسته‌ای برای این حساب در دسترس نیست.',packages:names.map(name=>({id:name,name}))}
      }catch(error){
        if(error instanceof Error&&['WHM_DENIED','WHM_API'].includes(error.message))return {ok:true,message:'ورود WHM تأیید شد؛ مجوز List Packages برای خواندن بسته‌ها در دسترس نیست.'}
        throw error
      }
    }catch(error){
      const code=error instanceof Error?error.message:''
      if(code==='WHM_URL')return {ok:false,message:'نشانی WHM باید HTTPS روی پورت ۲۰۸۷ یا ۴۴۳ و بدون مسیر ورود، query یا fragment باشد؛ پورت cPanel برابر ۲۰۸۳ مناسب نیست.'}
      if(code==='WHM_AUTH')return {ok:false,message:'نام کاربری WHM و نوع ورود معتبر با رمز یا API Token را تنظیم کنید.'}
      if(code==='WHM_DENIED')return {ok:false,message:'ورود WHM پذیرفته نشد (۴۰۱/۴۰۳). رمز یا توکن، مجوز API نمایندگی و محدودیت IP یا احراز هویت دومرحله‌ای را بررسی کنید.'}
      if(['WHM_RESPONSE','WHM_API'].includes(code))return {ok:false,message:'WHM پاسخ موفق API نداد؛ نشانی و مجوز حساب نمایندگی را بررسی کنید.'}
      return {ok:false,message:connectionFailure(error)}
    }
  }
}
