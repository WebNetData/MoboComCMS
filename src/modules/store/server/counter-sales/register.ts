import { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { StoreError } from '@/modules/store/domain/store'

type Tx = Prisma.TransactionClient
type Audit = (tx: Tx, id: number) => Promise<void>
const money = (value: unknown, signed = false) => { const raw=String(value ?? ''); if (!(signed ? /^-?\d{1,16}$/ : /^\d{1,16}$/).test(raw)) throw new StoreError('مبلغ شمارش معتبر نیست'); return BigInt(raw) }
const uuid = (value: unknown) => { const raw=String(value || ''); if (!/^[0-9a-f-]{36}$/i.test(raw)) throw new StoreError('شناسهٔ درخواست معتبر نیست'); return raw }
const view = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?value.toString():value instanceof Date?value.toISOString():value]))

export async function lockRegister(tx: Tx, id: number, actorId: number, currency?: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StoreRegisterSession" WHERE "id"=${id} FOR UPDATE`)
  const session=await tx.storeRegisterSession.findUnique({where:{id}})
  if(!session || session.status!=='OPEN' || session.cashierId!==actorId || (currency && session.currency!==currency)) throw new StoreError('صندوق بازِ همین کارمند و واحد پول را انتخاب کنید',409,'REGISTER_CLOSED')
  return session
}

async function totals(tx: Pick<Tx,'storeTender'|'storeRegisterAdjustment'>, sessionId: number) {
  const [tenders,adjustments]=await Promise.all([
    tx.storeTender.groupBy({by:['method'],where:{sessionId},_sum:{amountMinor:true}}),
    tx.storeRegisterAdjustment.groupBy({by:['method'],where:{sessionId},_sum:{amountMinor:true}}),
  ])
  const sum=(method:string)=>[...tenders,...adjustments].filter(x=>x.method===method).reduce((sum,x)=>sum+(x._sum.amountMinor||0n),0n)
  return {cash:sum('CASH'),card:sum('CARD'),wallet:sum('WALLET')}
}

export async function registerSessions(actorId: number) {
  const rows=await db.storeRegisterSession.findMany({orderBy:{id:'desc'},take:40,include:{cashier:{select:{name:true}},_count:{select:{orders:true}}}})
  return Promise.all(rows.map(async row=>{
    const balance=row.status==='OPEN'?await totals(db,row.id):null
    return {...view(row),cashier:row.cashier.name,orders:row._count.orders,mine:row.cashierId===actorId,
      ...(balance?{expectedCashMinor:(row.openingCashMinor+balance.cash).toString(),expectedCardMinor:balance.card.toString(),walletMinor:balance.wallet.toString()}:{}),
    }
  }))
}

export async function openRegister(raw: Record<string, unknown>, actorId: number, audit: Audit) {
  const requestId=uuid(raw.requestId), register=String(raw.register||'').trim().slice(0,60), currency=String(raw.currency||'IRT')
  if(!register || !['IRT','IRR','USD','EUR','AED','GBP','TRY','CAD','AUD'].includes(currency)) throw new StoreError('نام صندوق و واحد پول را انتخاب کنید')
  const openingCashMinor=money(raw.openingCashMinor)
  try { return await db.$transaction(async tx=>{
    const previous=await tx.storeRegisterSession.findUnique({where:{requestId}})
    if(previous) {if(previous.cashierId!==actorId || previous.register!==register || previous.openingCashMinor!==openingCashMinor || previous.currency!==currency)throw new StoreError('شناسهٔ درخواست قبلاً استفاده شده است',409);return view(previous)}
    const row=await tx.storeRegisterSession.create({data:{requestId,register,cashierId:actorId,currency,openingCashMinor}})
    await audit(tx,row.id);return view(row)
  }) } catch(error){if((error as {code?:string}).code==='P2002')throw new StoreError('این صندوق باز است؛ ابتدا همان نوبت را ببندید',409);throw error}
}

export async function closeRegister(raw: Record<string, unknown>, actorId: number, audit: Audit) {
  const id=Number(raw.sessionId), countedCashMinor=money(raw.countedCashMinor),countedCardMinor=money(raw.countedCardMinor)
  if(!Number.isSafeInteger(id)||id<=0)throw new StoreError('صندوق معتبر نیست')
  return db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "StoreRegisterSession" WHERE "id"=${id} FOR UPDATE`)
    const before=await tx.storeRegisterSession.findUnique({where:{id}})
    if(before?.cashierId!==actorId)throw new StoreError('این نوبت صندوق متعلق به شما نیست',403)
    if(before.status==='CLOSED'){if(before.countedCashMinor!==countedCashMinor||before.countedCardMinor!==countedCardMinor)throw new StoreError('صندوق بسته شده و شمارش آن تغییر نمی‌کند',409);return view(before)}
    const sum=await totals(tx,id),expectedCashMinor=before.openingCashMinor+sum.cash,expectedCardMinor=sum.card
    const changed=await tx.storeRegisterSession.updateMany({where:{id,status:'OPEN'},data:{status:'CLOSED',closedAt:new Date(),closedById:actorId,countedCashMinor,countedCardMinor,expectedCashMinor,expectedCardMinor,differenceCashMinor:countedCashMinor-expectedCashMinor,differenceCardMinor:countedCardMinor-expectedCardMinor,note:String(raw.note||'').trim().slice(0,500)}})
    if(changed.count!==1)throw new StoreError('وضعیت صندوق تغییر کرده است',409)
    await audit(tx,id);return view(await tx.storeRegisterSession.findUniqueOrThrow({where:{id}}))
  })
}

export async function adjustRegister(raw: Record<string, unknown>, actorId: number, audit: Audit) {
  const requestId=uuid(raw.requestId),sessionId=Number(raw.sessionId),method=String(raw.method),amountMinor=money(raw.amountMinor,true),reason=String(raw.reason||'').trim().slice(0,300)
  if(!Number.isSafeInteger(sessionId)||sessionId<=0||!['CASH','CARD'].includes(method)||!amountMinor||reason.length<3)throw new StoreError('نوع، مبلغ و دلیل دریافت/برداشت صندوق را بنویسید')
  return db.$transaction(async tx=>{
    const previous=await tx.storeRegisterAdjustment.findUnique({where:{requestId}})
    if(previous){if(previous.actorId!==actorId||previous.sessionId!==sessionId||previous.amountMinor!==amountMinor||previous.method!==method||previous.reason!==reason)throw new StoreError('درخواست تکراری با اطلاعات متفاوت',409);return view(previous)}
    await lockRegister(tx,sessionId,actorId)
    const row=await tx.storeRegisterAdjustment.create({data:{requestId,sessionId,actorId,method,amountMinor,reason}})
    await audit(tx,sessionId);return view(row)
  })
}
