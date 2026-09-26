/* Local integration checks. Creates and removes only its own uniquely named fixtures.
   Run: node --env-file=.env scripts/site.integration.cjs (development server running). */
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { encode } = require('next-auth/jwt')
const db = new PrismaClient()
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Integration checks are restricted to localhost')
const id = `qa-${Date.now().toString(36)}`
let formId, userId
async function token(user) {return `next-auth.session-token=${await encode({secret:process.env.NEXTAUTH_SECRET||'dev-secret-change-me',token:{uid:String(user.id),role:'ADMIN',roleId:null,email:user.email},maxAge:600})}`}
async function request(path, method='GET', body, cookie) {
  const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  return {status:response.status,data:await response.json().catch(()=>null)}
}
async function main(){
  const admin=await db.user.findFirst({where:{role:'ADMIN',status:'ACTIVE'},include:{roleRef:true}})
  assert.ok(admin,'An existing admin account is required')
  const cookie=await token(admin)
  assert.equal((await request('/api/admin/site')).status,403)
  assert.equal((await request('/api/admin/forms')).status,403)
  assert.equal((await request('/api/admin/happ')).status,403)
  const happ=await request('/api/admin/happ','GET',null,cookie)
  assert.equal(happ.status,200)
  assert.equal(happ.data.format,'happ://crypt5/')
  assert.equal(happ.data.rawExport,false)
  assert.equal(typeof happ.data.ready,'boolean')
  const invalidToken='0'.repeat(48)
  assert.equal((await fetch(base+'/api/happ/sub/'+invalidToken)).status,410)
  assert.equal((await fetch(base+'/api/happ/sub/'+invalidToken,{headers:{'user-agent':'Happ/3.0'}})).status,410)
  assert.equal((await fetch(base+'/api/sub/'+invalidToken)).status,410)
  assert.equal((await request('/api/admin/forms/submissions?formId=1')).status,403)
  const site=await request('/api/admin/site','GET',null,cookie)
  assert.equal(site.status,200)
  assert.ok(site.data.themes.length>=3)
  assert.equal((await request('/api/admin/site','PUT',{...site.data.config,navigation:[{label:{fa:'test',en:'test'},href:'javascript:alert(1)'}]},cookie)).status,400)
  console.log('PASS: admin protection, catalog and unsafe navigation rejection')
  const definition={slug:id,title:'QA disposable form',description:'Integration fixture',published:false,successText:'QA saved',fields:[{id:'email',label:'ایمیل',type:'email',required:true,options:[]},{id:'message',label:'پیام اولیه',type:'textarea',required:true,options:[]}]}
  const create=await request('/api/admin/forms','POST',definition,cookie)
  assert.equal(create.status,200);formId=create.data.id
  assert.equal((await fetch(base+'/forms/'+id)).status,404)
  assert.equal((await request('/api/forms/'+id,'POST',{values:{email:'qa@example.invalid',message:'QA'}})).status,404)
  const published={...definition,id:formId,published:true}
  assert.equal((await request('/api/admin/forms','POST',published,cookie)).status,200)
  const publicPage=await fetch(base+'/forms/'+id);assert.equal(publicPage.status,200);assert.ok((await publicPage.text()).includes('QA disposable form'))
  assert.equal((await request('/api/forms/'+id,'POST',{values:{email:'invalid',message:'QA'}})).status,400)
  assert.equal((await request('/api/forms/'+id,'POST',{values:{email:'qa@example.invalid',message:'QA submission'}})).status,201)
  const inbox=await request('/api/admin/forms/submissions?formId='+formId,'GET',null,cookie)
  assert.equal(inbox.status,200);assert.equal(inbox.data.total,1);assert.equal(inbox.data.rows[0].data[1].label,'پیام اولیه')
  assert.equal((await request('/api/admin/forms/submissions','PATCH',{id:inbox.data.rows[0].id,read:true},cookie)).status,200)
  published.fields[1].label='عنوان جدید'
  assert.equal((await request('/api/admin/forms','POST',published,cookie)).status,200)
  const old=await request('/api/admin/forms/submissions?formId='+formId,'GET',null,cookie)
  assert.equal(old.data.rows[0].data[1].label,'پیام اولیه');assert.equal(old.data.rows[0].read,true)
  console.log('PASS: draft/publish, server validation, submit, inbox, read state and historical labels')
  const user=await db.user.create({data:{email:`${id}@example.invalid`,name:'QA disposable user',passwordHash:'invalid-test-hash',role:'CUSTOMER'}});userId=user.id
  assert.equal((await request('/api/admin/site','GET',null,await token(user))).status,403)
  await db.user.update({where:{id:userId},data:{role:'ADMIN',status:'BANNED'}})
  assert.equal((await request('/api/admin/forms','GET',null,await token(user))).status,403)
  console.log('PASS: stale administrator claims and banned accounts cannot access admin APIs')
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{if(formId)await db.siteForm.delete({where:{id:formId}});if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect()})
