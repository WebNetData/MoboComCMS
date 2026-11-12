import { listLocations } from '@/modules/catalog/server/location-admin'
import { deliverySchedule } from '@/modules/shipping/server/shipping'
import { ShippingError } from '@/modules/shipping/domain/shipping'
import type { NextRequest } from 'next/server'
import { adminGuard } from '@/modules/identity/server/admin-guard'
import { requirePerm } from '@/modules/identity/server/access'
import { auditAdminStrict } from '@/platform/audit/server'
import { rateLimitStrict, clientIp } from '@/platform/http/rate-limit'
import { StoreError } from '@/modules/store/domain/store'
import { counterProducts, counterCustomers, counterReceipt, createCounterSale, quoteCounterSale, counterCustomer, registerSessions, openRegister, closeRegister, adjustRegister, scanCounterProduct,productLabels } from '@/modules/store/server/counter-sales'
import { db } from '@/platform/database/prisma'
import { resolvePhoneCustomer, findPhoneCustomer, PhoneCustomerError } from '@/modules/identity/server/phone-customer'
import { requestOtp, verifyOtp, SmsError } from '@/modules/sms/server/sms'
import { MarketingError } from '@/modules/store/domain/marketing'
import { readCounterSale } from '@/modules/store/domain/counter-sales'
import { storeSalesReport } from '@/modules/store/server/reports'

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
const failure = (error: unknown) => { if (error instanceof StoreError) return reply({ error: error.message, code: error.code }, error.status); if(error instanceof SmsError || error instanceof MarketingError || error instanceof ShippingError)return reply({error:error.message},error.status);if(error instanceof PhoneCustomerError)return reply({error:error.message},409);throw error }

export async function GET_counter(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in guard) return guard.response
  const params = req.nextUrl.searchParams
  try {
    // The cashier's open register decides which shelf's units the counter shows.
    const sessionId=Number(params.get('session'))
    const shelf=Number.isSafeInteger(sessionId)&&sessionId>0?(await db.storeRegisterSession.findFirst({where:{id:sessionId,cashierId:guard.admin.id,status:'OPEN'},select:{locationId:true}}))?.locationId??null:null
    if (params.has('deskOptions')) {
      const [locations, schedule] = await Promise.all([listLocations(), deliverySchedule()])
      return reply({ locations: locations.filter(row => row.active && row.kind === 'WAREHOUSE').map(row => ({ id: row.id, name: row.name })), days: schedule.settings.enabled ? schedule.days : [] })
    }
    if (params.has('shipLocation')) {
      const id = Number(params.get('shipLocation'))
      if (!Number.isSafeInteger(id) || id <= 0 || !await db.stockLocation.count({ where: { id, active: true, kind: 'WAREHOUSE' } })) throw new StoreError('انبار ارسال فعال را انتخاب کنید')
      if (params.has('scan')) return reply(await scanCounterProduct(params.get('scan') || '', id))
      return reply({ products: (await counterProducts(params.get('q') || '', undefined, id)).filter(row => row.kind === 'PHYSICAL') })
    }
    if(params.has('scan'))return reply(await scanCounterProduct(params.get('scan')||'',shelf))
    // Read-only: which account this mobile belongs to; the sale itself creates or links it in its own transaction.
    if(params.has('lookup'))return reply({customer:await findPhoneCustomer(params.get('lookup')||'')})
    if(params.has('labels')){const id=Number(params.get('product'));if(params.has('product')&&(!Number.isSafeInteger(id)||id<=0||id>2_147_483_647))throw new StoreError('محصول معتبر نیست');return reply({labels:await productLabels(params.get('q')||'',id||undefined)})}
    if(params.has('report'))return reply(await storeSalesReport(Number(params.get('days')||30)))
    if(params.has('registers'))return reply({sessions:await registerSessions(guard.admin.id)})
    if(params.has('customer')){
      const id=Number(params.get('customer'));if(!Number.isSafeInteger(id)||id<=0||id>2_147_483_647)throw new StoreError('مشتری معتبر نیست')
      return reply(await counterCustomer(id,{id:guard.admin.id,builder:!!await requirePerm(req,'cms.pages'),handler:!!await requirePerm(req,'forms.handle')}))
    }
    if (params.has('request')) {
      const request = params.get('request') || ''
      if (!/^[0-9a-f-]{36}$/i.test(request)) throw new StoreError('شناسهٔ درخواست معتبر نیست')
      const order = await db.order.findUnique({ where: { idempotencyKey: `counter:${guard.admin.id}:${request}` }, select: { id: true, status: true, saleSource: true } })
      return reply({ orderId: order?.status === 'PAID' && order.saleSource === 'COUNTER' ? order.id : null })
    }
    if (params.has('order')) {
      const id = Number(params.get('order'))
      if (!Number.isSafeInteger(id) || id <= 0) throw new StoreError('شمارهٔ فروش معتبر نیست')
      const receipt = await counterReceipt(id)
      await auditAdminStrict({ req, actor: guard.admin, action: 'store.counter.receipt', targetType: 'order', targetId: id, metadata: { codes: receipt.cards.length } })
      return reply({ receipt })
    }
    if (params.has('customers')) return reply({ customers: await counterCustomers(params.get('customers') || '') })
    return reply({ products: await counterProducts(params.get('q') || '', undefined, shelf) })
  } catch (error) { return failure(error) }
}

export async function POST_counter(req: NextRequest) {
  const guard = await adminGuard(req, 'store', ['orders.manage'])
  if ('response' in guard) return guard.response
  const limit = await rateLimitStrict(`counter-sale:${guard.admin.id}`, 60, 60_000)
  if (!limit.ok) return reply({ error: 'درخواست‌های ثبت فروش زیاد است؛ کمی بعد دوباره تلاش کنید' }, 429)
  const raw = await req.text()
  if (raw.length > 100_000) return reply({ error: 'اطلاعات فروش بیش از حد بزرگ است' }, 413)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return reply({ error: 'اطلاعات فروش معتبر نیست' }, 400) }
  try {
    const data=body&&typeof body==='object'?body as Record<string,unknown>:{}
    const audit=async(tx: Parameters<typeof resolvePhoneCustomer>[0],id:number)=>{
      if(!await requirePerm(req,'orders.manage',tx))throw new StoreError('دسترسی ثبت فروش تغییر کرده است',403)
      await auditAdminStrict({req,actor:guard.admin,action:`store.counter.${String(data.op||'sale').slice(0,40)}`,targetType:'store',targetId:id},tx)
    }
    if(data.op==='quote') return reply({ quote: await quoteCounterSale(data) })
    if(data.op==='customer.resolve'){
      const customer=await db.$transaction(async tx=>{const row=await resolvePhoneCustomer(tx,data.phone,data.firstName||data.lastName?{firstName:String(data.firstName||''),lastName:String(data.lastName||'')}:String(data.name||''));await audit(tx,row.id);return {id:row.id,name:row.name,phone:row.phone,email:row.email}})
      return reply({customer})
    }
    if(data.op==='register.open')return reply({session:await openRegister(data,guard.admin.id,audit)})
    if(data.op==='register.close')return reply({session:await closeRegister(data,guard.admin.id,audit)})
    if(data.op==='register.adjust')return reply({adjustment:await adjustRegister(data,guard.admin.id,audit)})
    if(data.op==='wallet.otp'){
      const id=Number(data.customerId);if(!Number.isSafeInteger(id)||id<=0||id>2_147_483_647)throw new StoreError('مشتری معتبر نیست')
      const customer=await db.user.findFirst({where:{id,status:'ACTIVE'},select:{phone:true}})
      if(!customer?.phone)throw new StoreError('ابتدا حساب مشتری را با شمارهٔ موبایل پیدا کنید')
      return reply(await requestOtp({phone:customer.phone,userId:id,purpose:`COUNTER:${guard.admin.id}:${id}`,ip:clientIp(req.headers)}))
    }
    if(data.op)throw new StoreError('عملیات صندوق معتبر نیست')
    const sale=readCounterSale(body)
    if(sale.payments?.some(row=>row.method==='WALLET')||sale.redeemPoints){
      const existing=await db.order.findUnique({where:{idempotencyKey:`counter:${guard.admin.id}:${sale.requestId}`},select:{status:true}})
      if(existing?.status!=='PAID'){
        if(!sale.customerId)throw new StoreError('حساب مشتری را انتخاب کنید',403)
        if(!(await rateLimitStrict(`counter-wallet-proof:${guard.admin.id}:${sale.customerId}`,8,5*60_000)).ok)return reply({error:'تلاش‌های کد تأیید زیاد است'},429)
        const customer=await db.user.findFirst({where:{id:sale.customerId,status:'ACTIVE'},select:{phone:true}})
        if(!customer)throw new StoreError('مشتری فعال نیست',403)
        await verifyOtp({phone:customer.phone,userId:sale.customerId,code:sale.walletCode,purpose:`COUNTER:${guard.admin.id}:${sale.customerId}`,consume:false})
      }
    }
    const result = await createCounterSale(body, guard.admin.id, async (tx) => {
      if (!(await requirePerm(req, 'orders.manage', tx))) throw new StoreError('دسترسی ثبت فروش تغییر کرده است', 403)
    }, async (tx, orderId) => { await auditAdminStrict({ req, actor: guard.admin, action: 'store.counter.sale', targetType: 'order', targetId: orderId, metadata: { source: 'COUNTER' } }, tx) })
    return reply(result)
  } catch (error) { return failure(error) }
}
