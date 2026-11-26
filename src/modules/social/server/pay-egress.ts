import { db } from '@/platform/database/prisma'
import { normalizeEgress } from '@/modules/social/domain/egress'

/** Financial callback routing never reads a stale/error-fallback setting. */
export async function payCallbackEgress(): Promise<'direct' | 'proxy'> {
  const row=await db.setting.findUnique({where:{key:'egress.proxy.v2'},select:{value:true}})
  if(!row)return 'direct'
  let value:Record<string,unknown>
  try {const parsed:unknown=JSON.parse(row.value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();value=parsed as Record<string,unknown>}catch{throw new Error('PAY_EGRESS_CONFIG_INVALID')}
  if(!Array.isArray(value.profiles)||!value.routes||typeof value.routes!=='object'||Array.isArray(value.routes))throw new Error('PAY_EGRESS_CONFIG_INVALID')
  const route=(value.routes as Record<string,unknown>).pay_callbacks
  if(route===undefined||route===''||route===null)return 'direct'
  if(typeof route!=='string'||normalizeEgress(value).routes.pay_callbacks!==route)throw new Error('PAY_EGRESS_CONFIG_INVALID')
  return 'proxy'
}
