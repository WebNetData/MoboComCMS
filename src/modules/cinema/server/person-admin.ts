import type { Prisma } from '@prisma/client'
import { db } from '@/platform/database/prisma'
import { adminPageParams, adminPageSlice } from '@/modules/content/domain/admin-pagination'
import { normalizePersonName } from '@/modules/cinema/domain/people'
import { personProfileInput, PersonProfileError } from '@/modules/cinema/domain/person-profile'

const profile = { id:true, name:true, normalizedName:true, bio:true, image:true, imageLocked:true, profileVersion:true, mergedIntoId:true } as const
export async function adminPeople(params: URLSearchParams) {
  let pagination: ReturnType<typeof adminPageParams>
  try { pagination=adminPageParams(params) } catch { throw new PersonProfileError('جست‌وجو یا صفحه‌بندی معتبر نیست') }
  const {size,page,query}=pagination,role=params.get('role') || ''
  if (role && !['CAST','DIRECTOR','PRODUCER','uncredited'].includes(role)) throw new PersonProfileError('نوع عوامل معتبر نیست')
  const q=normalizePersonName(query)
  const where: Prisma.CinemaPersonWhereInput={mergedIntoId:null,...(q?{OR:[{normalizedName:{contains:q}},{displayNameKey:{contains:q}},{aliases:{some:{OR:[{normalizedName:{contains:q}},{displayNameKey:{contains:q}}]}}}]}:{}),...(role==='uncredited'?{credits:{none:{}}}:role?{credits:{some:{role}}}:{})}
  const total=await db.cinemaPerson.count({where}),slice=adminPageSlice(total,page,size)
  const rows=await db.cinemaPerson.findMany({where,skip:slice.skip,take:slice.take,orderBy:{id:'desc'},select:{id:true,name:true,image:true,imageLocked:true,credits:{select:{role:true}},_count:{select:{credits:{where:{title:{status:'PUBLISHED',publishedAt:{lte:new Date()}}}}}}}})
  return {people:rows.map(({credits,_count,...person})=>({...person,roles:[...new Set(credits.map(c=>c.role))],creditCount:credits.length,publicCredits:_count.credits})),total,page:slice.page,pages:slice.pages,limit:size}
}
/**
 * The title form's people picker: canonical profiles whose name (or a merged alias) contains the query, the most
 * credited first, at most 12, with the roles they already have. Names only; nothing private about a person. An author
 * (authorId) sees people of published titles and of the titles they created, not names only on others' drafts.
 */
export async function suggestPeople(params: URLSearchParams, authorId: number | null = null) {
  const q=normalizePersonName(params.get('q')||'').slice(0,60)
  if(q.length<2)return {people:[]}
  const rows=await db.cinemaPerson.findMany({
    where:{mergedIntoId:null,AND:[
      {OR:[{normalizedName:{contains:q}},{displayNameKey:{contains:q}},{aliases:{some:{OR:[{normalizedName:{contains:q}},{displayNameKey:{contains:q}}]}}}]},
      ...(authorId?[{credits:{some:{title:{OR:[{status:'PUBLISHED'},{createdById:authorId}]}}}}]:[]),
    ]},
    orderBy:[{credits:{_count:'desc'}},{id:'asc'}],take:12,
    select:{id:true,name:true,image:true,credits:{select:{role:true},take:60}},
  })
  const people=rows.map(({credits,...person})=>({...person,roles:[...new Set(credits.map(credit=>credit.role))]}))
  // One artist across the sections («چهره‌ها»): a singer not yet in cinema is offered too; picked, the credit's name makes
  // their cinema record and the same name joins them into one person. A section author keeps the narrower list.
  if(authorId||people.length>=12)return {people}
  const known=new Set(people.map(person=>normalizePersonName(person.name)))
  const typed=params.get('q')?.trim().slice(0,60)||q
  const singers=await db.musicArtist.findMany({where:{mergedIntoId:null,AND:[{OR:[{name:{contains:typed}},{nameEn:{contains:typed,mode:'insensitive'}}]},{OR:[{celebrity:{is:null}},{celebrity:{is:{cinemaPersonId:null}}}]}]},orderBy:[{name:'asc'},{id:'asc'}],take:12-people.length,select:{id:true,name:true,image:true}}).catch(()=>[])
  return {people:[...people,...singers.filter(artist=>!known.has(normalizePersonName(artist.name))).map(artist=>({id:-artist.id,name:artist.name,image:artist.image,roles:['SINGER']}))]}
}
export async function adminPerson(id: number) {
  const person=await db.cinemaPerson.findUnique({where:{id},select:{...profile,credits:{orderBy:{id:'asc'},take:101,select:{id:true,role:true,character:true,title:{select:{id:true,title:true,slug:true,status:true,publishedAt:true,kind:true}}}}}})
  if (!person) throw new PersonProfileError('پروفایل پیدا نشد',404)
  const publicCredits=await db.cinemaCredit.count({where:{personId:id,title:{status:'PUBLISHED',publishedAt:{lte:new Date()}}}})
  return {...person,credits:person.credits.slice(0,100),moreCredits:person.credits.length>100,publicCredits}
}
/** HTTP guard owns authority; atomic audit callback and version claim share this transaction. */
export async function savePerson(input: Record<string,unknown>,audit: (tx:Prisma.TransactionClient,id:number,created:boolean)=>Promise<unknown>) {
  const data=personProfileInput(input),id=input.id
  if(id!==undefined && (!Number.isSafeInteger(id)||Number(id)<=0))throw new PersonProfileError('شناسه معتبر نیست')
  if(id!==undefined && (!Number.isSafeInteger(input.profileVersion)||Number(input.profileVersion)<0))throw new PersonProfileError('نسخهٔ فرم معتبر نیست؛ پروفایل را دوباره باز کنید')
  try {return await db.$transaction(async tx=>{
    let person
    if(id===undefined)person=await tx.cinemaPerson.create({data:{...data,normalizedName:normalizePersonName(data.name)},select:profile})
    else {
      const changed=await tx.cinemaPerson.updateMany({where:{id:Number(id),mergedIntoId:null,profileVersion:Number(input.profileVersion)},data:{...data,profileVersion:{increment:1}}})
      if(!changed.count){if(!await tx.cinemaPerson.findUnique({where:{id:Number(id)},select:{id:true}}))throw new PersonProfileError('پروفایل پیدا نشد',404);throw new PersonProfileError('پروفایل هم‌زمان تغییر کرده است؛ نسخهٔ تازه را باز کنید',409)}
      person=await tx.cinemaPerson.findUniqueOrThrow({where:{id:Number(id)},select:profile})
    }
    await audit(tx,person.id,id===undefined)
    return person
  })}catch(error){if((error as {code?:string}).code==='P2002')throw new PersonProfileError('این شخص از قبل ثبت شده است؛ پروفایل موجود را جست‌وجو کنید',409);throw error}
}
